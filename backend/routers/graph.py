"""知识图谱路由 —— 返回图谱数据 + 用户掌握度叠加"""

import os
import sys
from functools import lru_cache
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User, KnowledgeState
from routers.auth import get_current_user, require_user
from services.path_planner import path_planner
from services.neo4j_service import neo4j_service

router = APIRouter(prefix="/api/graph", tags=["知识图谱"])


class GraphNode(BaseModel):
    id: str
    name: str
    category: str = ""
    difficulty: int = 3
    chapter: int = 0
    description: str = ""
    estimated_minutes: int = 30
    mastery: Optional[float] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str = "prerequisite"


class GraphResponse(BaseModel):
    course: str
    name: str = ""
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class MasteryItem(BaseModel):
    knowledge_point_id: str
    mastery: float
    attempt_count: int
    correct_count: int


class GeneratedPathItem(BaseModel):
    id: str
    name: str
    category: str = ""
    description: str = ""
    chapter: Optional[int] = None
    mastery: float
    estimated_minutes: int = 30
    difficulty: int = 3
    status: str
    recommended: bool = False


class GenerateGraphRequest(BaseModel):
    subject_id: str = Field(..., min_length=1, max_length=50)
    subject_name: Optional[str] = Field(default=None, max_length=100)
    source_text: str = Field(..., min_length=20, max_length=20000)
    expected_node_count: int = Field(default=15, ge=5, le=80)
    persist: bool = False


class GenerateGraphResponse(BaseModel):
    subject_id: str
    subject_name: str
    persisted: bool
    node_count: int
    edge_count: int
    warnings: List[str] = Field(default_factory=list)
    graph: GraphResponse
    path_preview: List[GeneratedPathItem] = Field(default_factory=list)


def _ensure_project_root_on_path():
    current_dir = os.path.dirname(__file__)
    candidate_roots = [
        os.path.dirname(current_dir),
        os.path.dirname(os.path.dirname(current_dir)),
    ]

    for candidate in candidate_roots:
        if os.path.isdir(os.path.join(candidate, "ai")) and candidate not in sys.path:
            sys.path.append(candidate)


def require_teacher(user: User = Depends(require_user)) -> User:
    role = (user.role or "").strip().lower()
    if role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="仅教师或管理员可生成知识图谱")
    return user


@lru_cache(maxsize=1)
def _get_generator_types():
    _ensure_project_root_on_path()

    try:
        from ai.graph_generator import (
            GraphGenerator,
            GraphGeneratorInputError,
            GraphGeneratorLLMError,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "AI 知识图谱生成模块未安装或未复制到后端运行环境，请重新构建 backend 镜像。"
        ) from exc

    return GraphGenerator, GraphGeneratorInputError, GraphGeneratorLLMError


@lru_cache(maxsize=1)
def _get_generator():
    GraphGenerator, _, _ = _get_generator_types()
    return GraphGenerator(
        api_base=settings.LLM_API_BASE,
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL,
    )


@router.get("/{course}", response_model=GraphResponse)
def get_graph(
    course: str,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取课程知识图谱

    如果用户已登录，节点会叠加个人掌握度数据。
    """
    data = neo4j_service.get_knowledge_graph(course)

    user_mastery: Dict[str, float] = {}
    if user:
        states = db.query(KnowledgeState).filter(
            KnowledgeState.user_id == user.id,
            KnowledgeState.course == course,
        ).all()
        user_mastery = {s.knowledge_point_id: s.mastery_probability for s in states}

    nodes = [
        GraphNode(
            id=n["id"],
            name=n.get("name", n["id"]),
            category=n.get("category", ""),
            difficulty=n.get("difficulty", 3),
            chapter=n.get("chapter", 0),
            description=n.get("description", ""),
            estimated_minutes=n.get("estimated_minutes", 30),
            mastery=user_mastery.get(n["id"]),
        )
        for n in data.get("nodes", [])
    ]

    edges = [
        GraphEdge(source=e["from"], target=e["to"], relation=e.get("relation", "prerequisite"))
        for e in data.get("edges", [])
    ]

    return GraphResponse(
        course=course,
        name=data.get("name", course),
        nodes=nodes,
        edges=edges,
    )


@router.get("/{course}/mastery", response_model=List[MasteryItem])
def get_mastery(
    course: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取用户在某课程所有知识点的掌握度"""
    if not user:
        return []

    graph = neo4j_service.get_knowledge_graph(course)
    kp_ids = {n["id"] for n in graph.get("nodes", [])}

    states = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id,
        KnowledgeState.course == course,
        KnowledgeState.knowledge_point_id.in_(kp_ids),
    ).all()

    return [
        MasteryItem(
            knowledge_point_id=s.knowledge_point_id,
            mastery=round(s.mastery_probability, 4),
            attempt_count=s.attempt_count,
            correct_count=s.correct_count,
        )
        for s in states
    ]


@router.post("/generate", response_model=GenerateGraphResponse)
async def generate_graph(
    req: GenerateGraphRequest,
    user: User = Depends(require_teacher),
):
    del user

    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")

    try:
        _, GraphGeneratorInputError, GraphGeneratorLLMError = _get_generator_types()
        generator = _get_generator()
        result = await generator.generate_graph(
            subject_id=req.subject_id.strip(),
            subject_name=(req.subject_name or req.subject_id).strip(),
            source_text=req.source_text,
            expected_node_count=req.expected_node_count,
        )
    except GraphGeneratorInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GraphGeneratorLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 知识图谱服务内部错误：{str(exc)}") from exc

    graph_data = result["graph"]
    subject_id = graph_data.get("course", req.subject_id.strip())
    warnings = list(result.get("warnings", []))

    mastery_map = {node["id"]: 0.3 for node in graph_data.get("nodes", [])}
    weak_points = [(node_id, mastery) for node_id, mastery in mastery_map.items()]
    path_preview = path_planner.generate_from_graph(
        weak_points=weak_points,
        graph_data=graph_data,
        mastery_map=mastery_map,
    )

    persisted = False
    if req.persist:
        warnings.extend(
            neo4j_service.save_knowledge_graph(subject_id, graph_data)
        )
        persisted = True

    graph_nodes = [
        GraphNode(
            id=node["id"],
            name=node.get("name", node["id"]),
            category=node.get("category", ""),
            difficulty=node.get("difficulty", 3),
            chapter=node.get("chapter", 0),
            description=node.get("description", ""),
            estimated_minutes=node.get("estimated_minutes", 30),
            mastery=None,
        )
        for node in graph_data.get("nodes", [])
    ]
    graph_edges = [
        GraphEdge(
            source=edge["from"],
            target=edge["to"],
            relation=edge.get("relation", "prerequisite"),
        )
        for edge in graph_data.get("edges", [])
    ]

    return GenerateGraphResponse(
        subject_id=subject_id,
        subject_name=graph_data.get("name", req.subject_name or req.subject_id),
        persisted=persisted,
        node_count=len(graph_nodes),
        edge_count=len(graph_edges),
        warnings=warnings,
        graph=GraphResponse(
            course=subject_id,
            name=graph_data.get("name", req.subject_name or req.subject_id),
            nodes=graph_nodes,
            edges=graph_edges,
        ),
        path_preview=[GeneratedPathItem(**item) for item in path_preview],
    )
