"""学习报告路由 —— 统计与进度"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, KnowledgeState
from models.record import PracticeRecord
from routers.auth import require_user

router = APIRouter(prefix="/api/report", tags=["学习报告"])


class SummaryResponse(BaseModel):
    total_exercises: int
    total_correct: int
    accuracy: float
    mastery_distribution: Dict[str, int]
    recent_activity: List[Dict]
    days_active: int


class ProgressItem(BaseModel):
    knowledge_point_id: str
    mastery: float
    attempt_count: int


@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    course: Optional[str] = None,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """学习概况统计"""
    total_query = db.query(func.count(PracticeRecord.id)).filter(
        PracticeRecord.user_id == user.id
    )
    if course:
        total_query = total_query.filter(PracticeRecord.course == course)
    total = total_query.scalar() or 0

    correct_query = db.query(func.count(PracticeRecord.id)).filter(
        PracticeRecord.user_id == user.id,
        PracticeRecord.is_correct == True,
    )
    if course:
        correct_query = correct_query.filter(PracticeRecord.course == course)
    correct = correct_query.scalar() or 0

    accuracy = correct / total if total > 0 else 0

    states_query = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id
    )
    if course:
        states_query = states_query.filter(KnowledgeState.course == course)
    states = states_query.all()

    distribution = {"high": 0, "medium": 0, "low": 0}
    for s in states:
        if s.mastery_probability >= 0.7:
            distribution["high"] += 1
        elif s.mastery_probability >= 0.4:
            distribution["medium"] += 1
        else:
            distribution["low"] += 1

    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_query = db.query(PracticeRecord).filter(
        PracticeRecord.user_id == user.id,
        PracticeRecord.answered_at >= week_ago,
    )
    if course:
        recent_query = recent_query.filter(PracticeRecord.course == course)
    recent_records = recent_query.all()

    daily_counts: Dict[str, int] = defaultdict(int)
    for r in recent_records:
        day = r.answered_at.strftime("%Y-%m-%d")
        daily_counts[day] += 1

    recent_activity = [
        {"date": day, "count": count}
        for day, count in sorted(daily_counts.items())
    ]

    all_dates_query = db.query(
        func.distinct(func.date(PracticeRecord.answered_at))
    ).filter(PracticeRecord.user_id == user.id)
    if course:
        all_dates_query = all_dates_query.filter(PracticeRecord.course == course)
    all_dates = all_dates_query.all()
    days_active = len(all_dates)

    return SummaryResponse(
        total_exercises=total,
        total_correct=correct,
        accuracy=round(accuracy, 4),
        mastery_distribution=distribution,
        recent_activity=recent_activity,
        days_active=days_active,
    )


@router.get("/progress", response_model=List[ProgressItem])
def get_progress(
    course: Optional[str] = None,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """各知识点掌握进度"""
    states_query = db.query(KnowledgeState).filter(
        KnowledgeState.user_id == user.id
    )
    if course:
        states_query = states_query.filter(KnowledgeState.course == course)

    states = states_query.order_by(KnowledgeState.mastery_probability.asc()).all()

    return [
        ProgressItem(
            knowledge_point_id=s.knowledge_point_id,
            mastery=round(s.mastery_probability, 4),
            attempt_count=s.attempt_count,
        )
        for s in states
    ]