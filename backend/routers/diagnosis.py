"""诊断测评路由 —— 智能出题 + BKT 更新"""

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
    options: dict
    difficulty: int

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
    mastery_map: Dict[str, float]  # {kp_id: mastery}
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
    开始诊断测评：优先出未测试和薄弱知识点的题目

    策略：
    1. 获取用户当前掌握状态
    2. 优先选择未做过的知识点
    3. 其次选择薄弱知识点
    4. 每个知识点选 1-2 题
    """
    # 用户当前掌握状态
    states = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id
    ).all()
    tested_kps = {s.knowledge_point_id: s.mastery_probability for s in states}

    # 获取课程所有知识点
    graph = neo4j_service.get_knowledge_graph(course)
    all_kps = [n["id"] for n in graph.get("nodes", [])]

    # 排序：未测试的优先，然后按掌握度升序
    untested = [kp for kp in all_kps if kp not in tested_kps]
    weak = sorted(
        [(kp, m) for kp, m in tested_kps.items() if m < 0.7],
        key=lambda x: x[1],
    )

    # 构建出题知识点列表
    target_kps = untested + [kp for kp, _ in weak]

    # 从数据库取题
    exercises = []
    for kp in target_kps:
        if len(exercises) >= count:
            break
        kp_exercises = db.query(Exercise).filter(
            Exercise.knowledge_point_id == kp
        ).limit(2).all()
        exercises.extend(kp_exercises)

    # 如果题目不够，补充其他题
    if len(exercises) < count:
        existing_ids = {e.id for e in exercises}
        more = db.query(Exercise).filter(
            Exercise.id.notin_(existing_ids)
        ).limit(count - len(exercises)).all()
        exercises.extend(more)

    return exercises[:count]


@router.post("/submit", response_model=DiagnosisResult)
def submit_diagnosis(
    req: SubmitRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    提交诊断答案，更新 BKT 掌握概率

    返回诊断结果：正确率、各知识点掌握度、薄弱点列表
    """
    correct_count = 0
    kp_responses: Dict[str, List[bool]] = {}  # {kp_id: [True/False, ...]}

    for item in req.answers:
        exercise = db.query(Exercise).filter(Exercise.id == item.exercise_id).first()
        if not exercise:
            continue

        is_correct = item.answer.upper() == exercise.correct_answer.upper()
        if is_correct:
            correct_count += 1

        kp_id = exercise.knowledge_point_id
        kp_responses.setdefault(kp_id, []).append(is_correct)

        # 记录做题记录
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
        # 获取或创建知识状态
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

        # 逐题更新 BKT
        current_mastery = state.mastery_probability
        for is_correct in responses:
            current_mastery = bkt.update(current_mastery, is_correct)

        state.mastery_probability = current_mastery
        state.attempt_count += len(responses)
        state.correct_count += sum(responses)
        state.last_practiced = datetime.utcnow()

        mastery_map[kp_id] = round(current_mastery, 4)

    db.commit()

    # 诊断薄弱点
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
