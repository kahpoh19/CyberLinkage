"""AI 对话路由 —— 连接前端聊天页与 AI Tutor 服务"""

import os
import sys
from functools import lru_cache
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings

router = APIRouter(prefix="/api/chat", tags=["AI答疑"])


def _ensure_project_root_on_path():
    current_dir = os.path.dirname(__file__)
    candidate_roots = [
        os.path.dirname(current_dir),
        os.path.dirname(os.path.dirname(current_dir)),
    ]

    for candidate in candidate_roots:
        if os.path.isdir(os.path.join(candidate, "ai")) and candidate not in sys.path:
            sys.path.append(candidate)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    mode: Literal["socratic", "explain"] = "socratic"
    history: List[ChatMessage] = Field(default_factory=list)
    student_mastery: Dict[str, float] = Field(default_factory=dict)
    current_topic: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    knowledge_points: List[str] = Field(default_factory=list)


@lru_cache(maxsize=1)
def _get_tutor_types():
    _ensure_project_root_on_path()

    try:
        from ai.tutor_agent import LLMServiceError, SocraticTutor
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "AI 模块未安装或未复制到后端运行环境，请重新构建 backend 镜像。"
        ) from exc

    return SocraticTutor, LLMServiceError


@lru_cache(maxsize=1)
def _get_tutor():
    SocraticTutor, _ = _get_tutor_types()

    return SocraticTutor(
        api_base=settings.LLM_API_BASE,
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL,
    )


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")

    try:
        _, LLMServiceError = _get_tutor_types()
        tutor = _get_tutor()
        result = await tutor.chat(
            user_message=req.message,
            history=[msg.model_dump() for msg in req.history],
            mode=req.mode,
            student_mastery=req.student_mastery,
            current_topic=req.current_topic,
        )
    except LLMServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 服务内部错误：{str(exc)}") from exc

    return ChatResponse(**result)
