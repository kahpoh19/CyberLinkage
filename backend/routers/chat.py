"""AI 对话路由 —— 连接前端聊天页与 AI Tutor 服务"""

import os
import sys
from functools import lru_cache
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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
    subject_id: Optional[str] = None
    subject_label: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    knowledge_points: List[str] = Field(default_factory=list)


def _ensure_chat_available():
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")


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
    _ensure_chat_available()

    try:
        _, LLMServiceError = _get_tutor_types()
        tutor = _get_tutor()
        result = await tutor.chat(
            user_message=req.message,
            history=[msg.model_dump() for msg in req.history],
            mode=req.mode,
            student_mastery=req.student_mastery,
            current_topic=req.current_topic,
            subject_id=req.subject_id,
            subject_label=req.subject_label,
        )
    except LLMServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 服务内部错误：{str(exc)}") from exc

    return ChatResponse(**result)


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    _ensure_chat_available()

    try:
        _, LLMServiceError = _get_tutor_types()
        tutor = _get_tutor()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI 服务内部错误：{str(exc)}") from exc

    async def generate():
        yielded_any_chunk = False
        try:
            async for chunk in tutor.stream_chat(
                user_message=req.message,
                history=[msg.model_dump() for msg in req.history],
                mode=req.mode,
                student_mastery=req.student_mastery,
                current_topic=req.current_topic,
                subject_id=req.subject_id,
                subject_label=req.subject_label,
            ):
                if chunk:
                    yielded_any_chunk = True
                    yield chunk
        except LLMServiceError as exc:
            if not yielded_any_chunk:
                try:
                    fallback = await tutor.chat(
                        user_message=req.message,
                        history=[msg.model_dump() for msg in req.history],
                        mode=req.mode,
                        student_mastery=req.student_mastery,
                        current_topic=req.current_topic,
                        subject_id=req.subject_id,
                        subject_label=req.subject_label,
                    )
                    response_text = (fallback.get("response") or "").strip()
                    if response_text:
                        yield response_text
                        yield f"\n\n> 注：流式通道暂时不可用，已自动切换为普通回答。"
                        return
                except Exception:
                    pass
            yield f"\n\n> ⚠️ {str(exc)}"
        except Exception as exc:
            yield f"\n\n> ⚠️ AI 服务内部错误：{str(exc)}"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")
