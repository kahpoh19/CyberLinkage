"""学习路径推荐路由"""

from typing import Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, KnowledgeState
from routers.auth import require_user
from services.knowledge_tracing import bkt
from services.path_planner import path_planner
from services.neo4j_service import neo4j_service

router = APIRouter(prefix="/api/path", tags=["学习路径"])


class PathItem(BaseModel):
    id: str
    name: str
    category: str = ""
    mastery: float
    estimated_minutes: int = 30
    difficulty: int = 3
    status: str  # "completed" | "in-progress" | "locked"


class PathResponse(BaseModel):
    path: List[PathItem]
    total_minutes: int
    weak_count: int


@router.get("/recommend", response_model=PathResponse)
def recommend_path(
    course: str = "c_language",
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    推荐个性化学习路径

    基于用户当前掌握状态，生成按拓扑顺序排列的学习路径。
    """
    # 获取用户掌握状态
    states = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id
    ).all()
    mastery_map: Dict[str, float] = {
        s.knowledge_point_id: s.mastery_probability for s in states
    }

    # 对于未测试的知识点，使用默认初始概率
    graph = neo4j_service.get_knowledge_graph(course)
    for node in graph.get("nodes", []):
        if node["id"] not in mastery_map:
            mastery_map[node["id"]] = 0.3  # BKT 初始值

    # 诊断薄弱点
    weak_points = bkt.diagnose_weak_points(mastery_map, threshold=0.7)

    # 生成路径
    path = path_planner.generate(weak_points, course, mastery_map)

    total_minutes = sum(item["estimated_minutes"] for item in path)
    weak_count = sum(1 for item in path if item["mastery"] < 0.6)

    return PathResponse(
        path=[PathItem(**item) for item in path],
        total_minutes=total_minutes,
        weak_count=weak_count,
    )
