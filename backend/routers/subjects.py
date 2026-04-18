"""科目管理路由 —— 增删改查 + 安全校验"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.subject import Subject
from models.exercise import Exercise
from models.record import PracticeRecord
from models.user import KnowledgeState
from routers.auth import require_user
from models.user import User

router = APIRouter(prefix="/api/subjects", tags=["科目管理"])

# 内置科目列表（与前端保持同步，不允许删除）
BUILTIN_SUBJECT_IDS = {
    "mechanics",
    "c_language",
    "data_structure",
    "calculus",
    "aerospace",
    "thermo",
    "physics",
    "circuits",
}


# ─── Schemas ────────────────────────────────────────

class SubjectCreate(BaseModel):
    subject_id: str = Field(..., min_length=1, max_length=50, description="科目唯一标识，如 'mechanics'")
    label: str = Field(..., min_length=1, max_length=100, description="显示名称，如 '机械原理'")


class SubjectOut(BaseModel):
    id: int
    subject_id: str
    label: str
    builtin: bool

    class Config:
        from_attributes = True


class SafeDeleteInfo(BaseModel):
    """安全删除时的关联数据统计"""
    subject_id: str
    exercise_count: int
    knowledge_state_count: int
    can_delete: bool
    reason: str


# ─── 路由 ───────────────────────────────────────────

@router.get("", response_model=List[SubjectOut])
def list_subjects(db: Session = Depends(get_db)):
    """获取所有科目列表（含内置 + 用户自定义）"""
    # 确保内置科目始终存在
    _ensure_builtin_subjects(db)
    subjects = db.query(Subject).order_by(Subject.id.asc()).all()
    return subjects


@router.post("", response_model=SubjectOut)
def create_subject(
    data: SubjectCreate,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """新增自定义科目"""
    # 标准化 ID
    normalized_id = data.subject_id.strip().replace(" ", "_").lower()

    # 检查重复
    existing = db.query(Subject).filter(Subject.subject_id == normalized_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"科目 ID '{normalized_id}' 已存在")

    subject = Subject(
        subject_id=normalized_id,
        label=data.label.strip(),
        builtin=False,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/{subject_id}/check-delete", response_model=SafeDeleteInfo)
def check_safe_delete(
    subject_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    删除前安全检查 —— 统计该科目下的关联数据。
    前端应先调用此接口，展示警告后再决定是否执行删除。
    """
    # 内置科目不可删
    if subject_id in BUILTIN_SUBJECT_IDS:
        return SafeDeleteInfo(
            subject_id=subject_id,
            exercise_count=0,
            knowledge_state_count=0,
            can_delete=False,
            reason="内置科目无法删除",
        )

    # 统计关联数据
    exercise_count = (
        db.query(Exercise)
        .filter(Exercise.knowledge_point_id.like(f"{subject_id}%"))
        .count()
    )

    knowledge_state_count = (
        db.query(KnowledgeState)
        .filter(KnowledgeState.knowledge_point_id.like(f"{subject_id}%"))
        .count()
    )

    total_associated = exercise_count + knowledge_state_count

    if total_associated > 0:
        reason = (
            f"该科目下仍有 {exercise_count} 道练习题"
            + (f" 和 {knowledge_state_count} 条学习记录" if knowledge_state_count > 0 else "")
            + "，删除将产生孤儿数据，请先清理资料或进行数据迁移。"
        )
        return SafeDeleteInfo(
            subject_id=subject_id,
            exercise_count=exercise_count,
            knowledge_state_count=knowledge_state_count,
            can_delete=False,
            reason=reason,
        )

    return SafeDeleteInfo(
        subject_id=subject_id,
        exercise_count=0,
        knowledge_state_count=0,
        can_delete=True,
        reason="可以安全删除",
    )


@router.delete("/{subject_id}")
def delete_subject(
    subject_id: str,
    force: bool = False,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    删除自定义科目。
    默认进行安全校验（force=false），force=true 时强制删除（危险！）。
    内置科目始终无法删除。
    """
    # 内置科目拦截
    if subject_id in BUILTIN_SUBJECT_IDS:
        raise HTTPException(status_code=403, detail="内置科目无法删除")

    subject = db.query(Subject).filter(Subject.subject_id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="科目不存在")

    if not force:
        # 执行关联数据检查
        exercise_count = (
            db.query(Exercise)
            .filter(Exercise.knowledge_point_id.like(f"{subject_id}%"))
            .count()
        )
        knowledge_state_count = (
            db.query(KnowledgeState)
            .filter(KnowledgeState.knowledge_point_id.like(f"{subject_id}%"))
            .count()
        )
        total = exercise_count + knowledge_state_count

        if total > 0:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": f"无法直接删除！该科目下仍有 {exercise_count} 道练习题"
                               + (f" 和 {knowledge_state_count} 条学习记录" if knowledge_state_count > 0 else "")
                               + "，删除将产生孤儿数据，请先清理资料或进行数据迁移。",
                    "exercise_count": exercise_count,
                    "knowledge_state_count": knowledge_state_count,
                },
            )

    db.delete(subject)
    db.commit()
    return {"message": f"科目 '{subject_id}' 已删除", "subject_id": subject_id}


# ─── 内部工具 ────────────────────────────────────────

_BUILTIN_DATA = [
    ("mechanics",      "机械原理"),
    ("c_language",     "C 语言程序设计"),
    ("data_structure", "数据结构"),
    ("calculus",       "高等数学"),
    ("aerospace",      "航空航天概论"),
    ("thermo",         "工程热力学"),
    ("physics",        "大学物理"),
    ("circuits",       "电路原理"),
]


def _ensure_builtin_subjects(db: Session):
    """确保内置科目始终存在于数据库中（首次访问时自动初始化）"""
    for sid, label in _BUILTIN_DATA:
        exists = db.query(Subject).filter(Subject.subject_id == sid).first()
        if not exists:
            db.add(Subject(subject_id=sid, label=label, builtin=True))
    db.commit()