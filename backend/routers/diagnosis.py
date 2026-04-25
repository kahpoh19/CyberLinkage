"""诊断测评路由 —— 智能出题 + BKT 更新"""

import json as json_lib
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, KnowledgeState
from models.exercise import Exercise
from models.record import PracticeRecord
from routers.auth import require_user
from services.knowledge_tracing import bkt
from services.neo4j_service import neo4j_service

router = APIRouter(prefix="/api/diagnosis", tags=["诊断测评"])

class ExerciseOut(BaseModel):
    id: int
    knowledge_point_id: str
    question_type: str = "single_choice"
    question_text: str
    options: Dict[str, str]
    difficulty: int

    @field_validator("options", mode="before")
    @classmethod
    def parse_options(cls, v: Any) -> Dict[str, str]:
        if isinstance(v, str):
            return json_lib.loads(v)
        return v

    class Config:
        from_attributes = True


class ExerciseReviewOut(ExerciseOut):
    correct_answer: str
    explanation: Optional[str] = None


class AnswerItem(BaseModel):
    exercise_id: int
    answer: str


class SubmitRequest(BaseModel):
    answers: List[AnswerItem]


class DiagnosisResult(BaseModel):
    total: int
    correct: int
    accuracy: float
    mastery_map: Dict[str, float]
    weak_points: List[str]
    exercises: List[ExerciseReviewOut] = Field(default_factory=list)


def _normalize_answer(answer: str, question_type: str = "single_choice") -> str:
    text = str(answer or "").strip().upper()
    if question_type == "multiple_choice":
        keys = []
        for key in text.replace("，", ",").replace("、", ",").replace(";", ",").split(","):
            key = key.strip()
            if len(key) == 1 and key.isalpha() and key not in keys:
                keys.append(key)
        if not keys and text.isalpha():
            keys = list(dict.fromkeys(text))
        return ",".join(sorted(keys))
    return text[:1]


@router.get("/start", response_model=List[ExerciseOut])
def start_diagnosis(
    course: str = "c_language",
    count: Optional[int] = None,
    knowledge_point_id: Optional[str] = None,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    开始诊断测评：优先出未测试和薄弱知识点的题目。

    若携带 knowledge_point_id，则进入学习路线中的专项测评模式，
    直接返回该知识点下的全部相关题目（或按 count 限制数量）。
    """
    target_count = count if isinstance(count, int) and count > 0 else 10

    if knowledge_point_id:
        query = (
            db.query(Exercise)
            .filter(
                Exercise.course == course,
                Exercise.knowledge_point_id == knowledge_point_id,
            )
            .order_by(Exercise.difficulty.asc(), Exercise.id.asc())
        )
        if isinstance(count, int) and count > 0:
            query = query.limit(count)
        return query.all()

    states = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id,
        KnowledgeState.course == course,
    ).all()
    tested_kps = {s.knowledge_point_id: s.mastery_probability for s in states}

    try:
        graph = neo4j_service.get_knowledge_graph(course)
        all_kps = [n["id"] for n in graph.get("nodes", [])]
    except Exception:
        all_kps = []

    exercises: List[Exercise] = []

    if all_kps:
        untested = [kp for kp in all_kps if kp not in tested_kps]
        weak = sorted(
            [(kp, m) for kp, m in tested_kps.items() if m < 0.7],
            key=lambda x: x[1],
        )
        target_kps = untested + [kp for kp, _ in weak]

        seen_ids = set()
        for kp in target_kps:
            if len(exercises) >= target_count:
                break
            kp_exercises = db.query(Exercise).filter(
                Exercise.course == course,
                Exercise.knowledge_point_id == kp,
            ).limit(2).all()
            for ex in kp_exercises:
                if ex.id not in seen_ids:
                    exercises.append(ex)
                    seen_ids.add(ex.id)

        if len(exercises) < target_count:
            existing_ids = {e.id for e in exercises}
            more_query = db.query(Exercise).filter(Exercise.course == course)
            if existing_ids:
                more_query = more_query.filter(Exercise.id.notin_(existing_ids))
            more = more_query.limit(target_count - len(exercises)).all()
            exercises.extend(more)
    else:
        exercises = (
            db.query(Exercise)
            .filter(Exercise.course == course)
            .limit(target_count)
            .all()
        )

    if not exercises:
        return []

    return exercises[:target_count]


@router.post("/submit", response_model=DiagnosisResult)
def submit_diagnosis(
    req: SubmitRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """提交诊断答案，更新 BKT 掌握概率"""
    correct_count = 0
    kp_responses: Dict[str, Dict[str, Any]] = {}
    review_exercises: List[Exercise] = []

    for item in req.answers:
        exercise = db.query(Exercise).filter(Exercise.id == item.exercise_id).first()
        if not exercise:
            continue

        review_exercises.append(exercise)
        is_correct = (
            _normalize_answer(item.answer, exercise.question_type)
            == _normalize_answer(exercise.correct_answer, exercise.question_type)
        )
        if is_correct:
            correct_count += 1

        kp_id = exercise.knowledge_point_id
        kp_responses.setdefault(kp_id, {
            "course": exercise.course,
            "responses": [],
        })
        kp_responses[kp_id]["responses"].append(is_correct)

        record = PracticeRecord(
            user_id=user.id,
            exercise_id=exercise.id,
            course=exercise.course,
            knowledge_point_id=kp_id,
            is_correct=is_correct,
        )
        db.add(record)

    mastery_map: Dict[str, float] = {}
    for kp_id, payload in kp_responses.items():
        course = payload["course"]
        responses = payload["responses"]

        state = db.query(KnowledgeState).filter(
            KnowledgeState.user_id == user.id,
            KnowledgeState.course == course,
            KnowledgeState.knowledge_point_id == kp_id,
        ).first()

        if not state:
            state = KnowledgeState(
                user_id=user.id,
                course=course,
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
        exercises=review_exercises,
    )
