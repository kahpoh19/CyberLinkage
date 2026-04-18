"""学习路径推荐路由"""

import json as json_lib
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.exercise import Exercise
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
    description: str = ""
    chapter: Optional[int] = None
    mastery: float
    estimated_minutes: int = 30
    difficulty: int = 3
    status: str  # "completed" | "in-progress" | "locked"
    recommended: bool = False


class PathResponse(BaseModel):
    path: List[PathItem]
    total_minutes: int
    weak_count: int


class PathExerciseOut(BaseModel):
    id: int
    knowledge_point_id: str
    question_text: str
    options: Dict[str, str]
    difficulty: int
    explanation: Optional[str] = None

    @field_validator("options", mode="before")
    @classmethod
    def parse_options(cls, value: Any) -> Dict[str, str]:
        if isinstance(value, str):
            return json_lib.loads(value)
        return value

    class Config:
        from_attributes = True


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


@router.get("/exercises", response_model=List[PathExerciseOut])
def get_path_exercises(
    knowledge_point_id: str,
    count: int = 5,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    获取某个学习路径知识点对应的练习题。

    这里按题目难度和录入顺序返回，避免每次刷新顺序完全跳变。
    """
    _ = user
    exercises = (
        db.query(Exercise)
        .filter(Exercise.knowledge_point_id == knowledge_point_id)
        .order_by(Exercise.difficulty.asc(), Exercise.id.asc())
        .limit(max(1, min(count, 10)))
        .all()
    )
    return exercises
