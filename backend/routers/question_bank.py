"""AI 题库生成路由。"""

import os
import sys
from functools import lru_cache
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.exercise import Exercise
from models.user import User
from routers.auth import require_user

router = APIRouter(prefix="/api/question-bank", tags=["AI题库"])

DEFAULT_QUESTION_TYPE = "single_choice"
QUESTION_TYPE_CONFIG = {
    "single_choice": {
        "label": "单选题",
        "option_keys": ["A", "B", "C", "D"],
    },
    "yes_no": {
        "label": "是非题",
        "option_keys": ["A", "B"],
        "fixed_options": {
            "A": "是",
            "B": "非",
        },
    },
    "true_false": {
        "label": "判断题",
        "option_keys": ["A", "B"],
    },
}


def _normalize_question_type(value: Optional[str]) -> str:
    normalized = str(value or DEFAULT_QUESTION_TYPE).strip().lower()
    if normalized not in QUESTION_TYPE_CONFIG:
        raise ValueError("question_type 仅支持 single_choice、yes_no 或 true_false")
    return normalized


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
    question_type: str = DEFAULT_QUESTION_TYPE
    question_text: str
    options: Dict[str, str]
    correct_answer: str
    difficulty: int
    explanation: str = ""

    @field_validator("knowledge_point_id", "question_text", "explanation", mode="before")
    @classmethod
    def normalize_text_fields(cls, value):
        return str(value or "").strip()

    @field_validator("question_type", mode="before")
    @classmethod
    def normalize_question_type_value(cls, value):
        return _normalize_question_type(value)

    @field_validator("correct_answer", mode="before")
    @classmethod
    def normalize_correct_answer(cls, value):
        return str(value or "").strip().upper()[:1]

    @field_validator("difficulty", mode="before")
    @classmethod
    def normalize_difficulty(cls, value):
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("difficulty 必须是整数") from exc
        return max(1, min(5, parsed))

    @field_validator("options", mode="before")
    @classmethod
    def normalize_options(cls, value):
        if not isinstance(value, dict):
            raise ValueError("options 必须是对象")

        normalized = {}
        for key, option_value in value.items():
            option_key = str(key or "").strip().upper()
            if not option_key:
                continue
            normalized[option_key] = str(option_value or "").strip()
        return normalized

    @model_validator(mode="after")
    def validate_question_shape(self):
        type_config = QUESTION_TYPE_CONFIG[self.question_type]
        option_keys = type_config["option_keys"]

        if self.question_type == "yes_no":
            self.options = {
                "A": "是",
                "B": "非",
            }

        option_map = {
            key: str((self.options or {}).get(key, "")).strip()
            for key in option_keys
        }

        if not self.knowledge_point_id:
            raise ValueError("knowledge_point_id 不能为空")
        if not self.question_text:
            raise ValueError("question_text 不能为空")
        if any(not option_map[key] for key in option_keys):
            raise ValueError(
                f"{type_config['label']}的 options 必须完整包含 "
                + "/".join(option_keys)
            )
        if self.correct_answer not in option_keys:
            raise ValueError(
                f"{type_config['label']}的 correct_answer 必须是 "
                + "/".join(option_keys)
            )

        self.options = option_map
        return self


class GenerateQuestionBankRequest(BaseModel):
    subject_id: str = Field(..., min_length=1, max_length=50)
    knowledge_point_ids: List[str] = Field(default_factory=list)
    questions_per_point: int = Field(default=3, ge=1, le=10)
    max_points: Optional[int] = Field(default=None, ge=1, le=200)
    question_type: str = DEFAULT_QUESTION_TYPE
    custom_instructions: Optional[str] = Field(default=None, max_length=4000)
    persist: bool = False
    replace_existing: bool = True

    @field_validator("question_type", mode="before")
    @classmethod
    def normalize_request_question_type(cls, value):
        return _normalize_question_type(value)

    @field_validator("custom_instructions", mode="before")
    @classmethod
    def normalize_custom_instructions(cls, value):
        normalized = str(value or "").strip()
        return normalized or None


class PersistPreviewQuestionBankRequest(BaseModel):
    subject_id: str = Field(..., min_length=1, max_length=50)
    subject_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    questions: List[GeneratedQuestionOut] = Field(default_factory=list, min_length=1)
    replace_existing: bool = True


class GenerateQuestionBankResponse(BaseModel):
    subject_id: str
    subject_name: str
    knowledge_points: List[str] = Field(default_factory=list)
    generated_count: int
    persisted_count: int = 0
    replaced_count: int = 0
    questions: List[GeneratedQuestionOut] = Field(default_factory=list)


def _validate_question_payload(item: Dict[str, object], index: Optional[int] = None) -> Dict[str, object]:
    try:
        return GeneratedQuestionOut.model_validate(item).model_dump()
    except ValidationError as exc:
        first_error = exc.errors()[0] if exc.errors() else {}
        message = first_error.get("msg") or str(exc)
        prefix = f"第 {index} 题" if index is not None else "题目"
        raise ValueError(f"{prefix}数据不合法：{message}") from exc


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


def _persist_questions(
    db: Session,
    course: str,
    questions: List[Dict[str, object]],
    replace_existing: bool,
) -> tuple[int, int, List[str]]:
    normalized_questions = [
        _validate_question_payload(item, index=index)
        for index, item in enumerate(questions, start=1)
    ]

    target_kps = list(
        dict.fromkeys(
            str(item.get("knowledge_point_id", "")).strip()
            for item in normalized_questions
            if str(item.get("knowledge_point_id", "")).strip()
        )
    )

    replaced_count = 0
    persisted_count = 0

    if replace_existing and target_kps:
        replaced_count = (
            db.query(Exercise)
            .filter(
                Exercise.course == course,
                Exercise.knowledge_point_id.in_(target_kps),
            )
            .delete(synchronize_session=False)
        )

    for item in normalized_questions:
        db.add(
            Exercise(
                course=course,
                knowledge_point_id=str(item["knowledge_point_id"]).strip(),
                question_type=str(item.get("question_type") or DEFAULT_QUESTION_TYPE).strip(),
                question_text=str(item["question_text"]).strip(),
                options=item["options"],
                correct_answer=str(item["correct_answer"]).strip(),
                difficulty=int(item["difficulty"]),
                explanation=str(item.get("explanation", "") or "").strip(),
            )
        )
        persisted_count += 1

    db.commit()
    return replaced_count, persisted_count, target_kps


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
            question_type=req.question_type,
            custom_instructions=req.custom_instructions,
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
        try:
            replaced_count, persisted_count, _ = _persist_questions(
                db=db,
                course=result["subject_id"],
                questions=questions,
                replace_existing=req.replace_existing,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GenerateQuestionBankResponse(
        subject_id=result["subject_id"],
        subject_name=result["subject_name"],
        knowledge_points=result["knowledge_points"],
        generated_count=len(questions),
        persisted_count=persisted_count,
        replaced_count=replaced_count,
        questions=questions,
    )


@router.post("/persist-preview", response_model=GenerateQuestionBankResponse)
async def persist_preview_question_bank(
    req: PersistPreviewQuestionBankRequest,
    user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    del user

    course = req.subject_id.strip()
    try:
        questions = [item.model_dump() for item in req.questions]
        replaced_count, persisted_count, target_kps = _persist_questions(
            db=db,
            course=course,
            questions=questions,
            replace_existing=req.replace_existing,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GenerateQuestionBankResponse(
        subject_id=course,
        subject_name=(req.subject_name or course).strip(),
        knowledge_points=target_kps,
        generated_count=len(questions),
        persisted_count=persisted_count,
        replaced_count=replaced_count,
        questions=questions,
    )
