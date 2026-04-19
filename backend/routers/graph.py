"""知识图谱路由 —— 返回图谱数据 + 用户掌握度叠加"""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, KnowledgeState
from routers.auth import get_current_user
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
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class MasteryItem(BaseModel):
    knowledge_point_id: str
    mastery: float
    attempt_count: int
    correct_count: int


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

    return GraphResponse(course=course, nodes=nodes, edges=edges)


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