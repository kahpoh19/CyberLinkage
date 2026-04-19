"""AI 题库生成路由。"""

import os
import sys
from functools import lru_cache
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.exercise import Exercise
from models.user import User
from routers.auth import require_user

router = APIRouter(prefix="/api/question-bank", tags=["AI题库"])


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
        raise HTTPException(status_code=403, detail="仅教师或管理员可生成题库")
    return user


class GeneratedQuestionOut(BaseModel):
    knowledge_point_id: str
    question_text: str
    options: Dict[str, str]
    correct_answer: str
    difficulty: int
    explanation: str = ""


class GenerateQuestionBankRequest(BaseModel):
    subject_id: str = Field(..., min_length=1, max_length=50)
    knowledge_point_ids: List[str] = Field(default_factory=list)
    questions_per_point: int = Field(default=3, ge=1, le=10)
    max_points: Optional[int] = Field(default=None, ge=1, le=200)
    persist: bool = False
    replace_existing: bool = True


class GenerateQuestionBankResponse(BaseModel):
    subject_id: str
    subject_name: str
    knowledge_points: List[str] = Field(default_factory=list)
    generated_count: int
    persisted_count: int = 0
    replaced_count: int = 0
    questions: List[GeneratedQuestionOut] = Field(default_factory=list)


@lru_cache(maxsize=1)
def _get_generator_types():
    _ensure_project_root_on_path()

    try:
        from ai.question_bank_generator import (
            QuestionBankGenerator,
            QuestionBankGeneratorError,
            QuestionBankGeneratorInputError,
            QuestionBankGeneratorLLMError,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "AI 题库生成模块未安装或未复制到后端运行环境，请重新构建 backend 镜像。"
        ) from exc

    return (
        QuestionBankGenerator,
        QuestionBankGeneratorError,
        QuestionBankGeneratorInputError,
        QuestionBankGeneratorLLMError,
    )


@lru_cache(maxsize=1)
def _get_generator():
    QuestionBankGenerator, _, _, _ = _get_generator_types()
    return QuestionBankGenerator(
        api_base=settings.LLM_API_BASE,
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL,
        knowledge_data_dir=settings.KNOWLEDGE_DATA_DIR,
    )


@router.post("/generate", response_model=GenerateQuestionBankResponse)
async def generate_question_bank(
    req: GenerateQuestionBankRequest,
    user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    del user

    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")

    try:
        (
            _,
            _QuestionBankGeneratorError,
            QuestionBankGeneratorInputError,
            QuestionBankGeneratorLLMError,
        ) = _get_generator_types()
        generator = _get_generator()
        result = await generator.generate_for_subject(
            subject_id=req.subject_id.strip(),
            knowledge_point_ids=req.knowledge_point_ids,
            questions_per_point=req.questions_per_point,
            max_points=req.max_points,
        )
    except QuestionBankGeneratorInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except QuestionBankGeneratorLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 题库服务内部错误：{str(exc)}") from exc

    questions = result["questions"]
    replaced_count = 0
    persisted_count = 0

    if req.persist and questions:
        target_kps = result["knowledge_points"]
        if req.replace_existing and target_kps:
            replaced_count = (
                db.query(Exercise)
                .filter(Exercise.knowledge_point_id.in_(target_kps))
                .delete(synchronize_session=False)
            )

        for item in questions:
            db.add(
                Exercise(
                    knowledge_point_id=item["knowledge_point_id"],
                    question_text=item["question_text"],
                    options=item["options"],
                    correct_answer=item["correct_answer"],
                    difficulty=item["difficulty"],
                    explanation=item.get("explanation", ""),
                )
            )
            persisted_count += 1

        db.commit()

    return GenerateQuestionBankResponse(
        subject_id=result["subject_id"],
        subject_name=result["subject_name"],
        knowledge_points=result["knowledge_points"],
        generated_count=len(questions),
        persisted_count=persisted_count,
        replaced_count=replaced_count,
        questions=questions,
    )
