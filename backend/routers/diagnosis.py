"""诊断测评路由 —— 智能出题 + BKT 更新"""

import json as json_lib
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, KnowledgeState
from models.exercise import Exercise
from models.record import PracticeRecord
from routers.auth import require_user
from services.knowledge_tracing import bkt
from services.neo4j_service import neo4j_service

router = APIRouter(prefix="/api/diagnosis", tags=["诊断测评"])


# ─── Schemas ────────────────────────────────────────────

class ExerciseOut(BaseModel):
    id: int
    knowledge_point_id: str
    question_text: str
    options: Dict[str, str]   # 保证返回 dict，不是字符串
    difficulty: int

    @field_validator("options", mode="before")
    @classmethod
    def parse_options(cls, v: Any) -> Dict[str, str]:
        """数据库里可能存的是 JSON 字符串，统一转成 dict"""
        if isinstance(v, str):
            return json_lib.loads(v)
        return v

    class Config:
        from_attributes = True


class AnswerItem(BaseModel):
    exercise_id: int
    answer: str  # "A", "B", "C", "D"


class SubmitRequest(BaseModel):
    answers: List[AnswerItem]


class DiagnosisResult(BaseModel):
    total: int
    correct: int
    accuracy: float
    mastery_map: Dict[str, float]
    weak_points: List[str]


# ─── 路由 ───────────────────────────────────────────────

@router.get("/start", response_model=List[ExerciseOut])
def start_diagnosis(
    course: str = "c_language",
    count: int = 10,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    开始诊断测评：优先出未测试和薄弱知识点的题目。

    修复点：
    1. 新用户没有 KnowledgeState 时，直接从全部题库随机取题
    2. options 字段统一 parse 为 dict
    """
    # 用户当前掌握状态
    states = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id
    ).all()
    tested_kps = {s.knowledge_point_id: s.mastery_probability for s in states}

    # 获取课程所有知识点
    try:
        graph = neo4j_service.get_knowledge_graph(course)
        all_kps = [n["id"] for n in graph.get("nodes", [])]
    except Exception:
        all_kps = []

    exercises: List[Exercise] = []

    if all_kps:
        # 未测试的知识点优先
        untested = [kp for kp in all_kps if kp not in tested_kps]
        # 薄弱知识点（掌握度 < 0.7）按掌握度升序
        weak = sorted(
            [(kp, m) for kp, m in tested_kps.items() if m < 0.7],
            key=lambda x: x[1],
        )
        target_kps = untested + [kp for kp, _ in weak]

        seen_ids: set = set()
        for kp in target_kps:
            if len(exercises) >= count:
                break
            kp_exercises = db.query(Exercise).filter(
                Exercise.knowledge_point_id == kp
            ).limit(2).all()
            for ex in kp_exercises:
                if ex.id not in seen_ids:
                    exercises.append(ex)
                    seen_ids.add(ex.id)

        # 若还不够，从剩余题库补充
        if len(exercises) < count:
            existing_ids = {e.id for e in exercises}
            more = (
                db.query(Exercise)
                .filter(Exercise.id.notin_(existing_ids))
                .limit(count - len(exercises))
                .all()
            )
            exercises.extend(more)
    else:
        # 知识图谱不可用时，直接取全部题库
        exercises = db.query(Exercise).limit(count).all()

    # 最终保底：如果还是空，就取全部
    if not exercises:
        exercises = db.query(Exercise).limit(count).all()

    if not exercises:
        return []   # 题库真的是空的

    return exercises[:count]


@router.post("/submit", response_model=DiagnosisResult)
def submit_diagnosis(
    req: SubmitRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """提交诊断答案，更新 BKT 掌握概率"""
    correct_count = 0
    kp_responses: Dict[str, List[bool]] = {}

    for item in req.answers:
        exercise = db.query(Exercise).filter(Exercise.id == item.exercise_id).first()
        if not exercise:
            continue

        is_correct = item.answer.upper() == exercise.correct_answer.upper()
        if is_correct:
            correct_count += 1

        kp_id = exercise.knowledge_point_id
        kp_responses.setdefault(kp_id, []).append(is_correct)

        record = PracticeRecord(
            user_id=user.id,
            exercise_id=exercise.id,
            knowledge_point_id=kp_id,
            is_correct=is_correct,
        )
        db.add(record)

    # BKT 更新掌握概率
    mastery_map: Dict[str, float] = {}
    for kp_id, responses in kp_responses.items():
        state = db.query(KnowledgeState).filter(
            KnowledgeState.user_id == user.id,
            KnowledgeState.knowledge_point_id == kp_id,
        ).first()

        if not state:
            state = KnowledgeState(
                user_id=user.id,
                knowledge_point_id=kp_id,
            )
            db.add(state)
            db.flush()

        current_mastery = state.mastery_probability
        for is_correct in responses:
            current_mastery = bkt.update(current_mastery, is_correct)

        state.mastery_probability = current_mastery
        state.attempt_count += len(responses)
        state.correct_count += sum(responses)
        state.last_practiced = datetime.utcnow()

        mastery_map[kp_id] = round(current_mastery, 4)

    db.commit()

    weak_points = [kp for kp, m in mastery_map.items() if m < 0.6]
    total = len(req.answers)
    accuracy = correct_count / total if total > 0 else 0

    return DiagnosisResult(
        total=total,
        correct=correct_count,
        accuracy=round(accuracy, 4),
        mastery_map=mastery_map,
        weak_points=weak_points,
    )