"""实战工坊 AI 路由。"""

import os
import sys
from functools import lru_cache
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings

router = APIRouter(prefix="/api/sandbox-ai", tags=["实战工坊AI"])


def _ensure_project_root_on_path():
    current_dir = os.path.dirname(__file__)
    candidate_roots = [
        os.path.dirname(current_dir),
        os.path.dirname(os.path.dirname(current_dir)),
    ]

    for candidate in candidate_roots:
        if os.path.isdir(os.path.join(candidate, "ai")) and candidate not in sys.path:
            sys.path.append(candidate)


class MechanismJoint(BaseModel):
    id: str
    x: Optional[float] = None
    y: Optional[float] = None
    fixed: bool = False
    driven: bool = False
    constraint_type: Optional[str] = None
    pivot_id: Optional[str] = None
    radius: Optional[float] = None
    output: bool = False
    axis_angle_deg: Optional[float] = None


class MechanismLink(BaseModel):
    id: str
    a_id: str
    b_id: str
    length: Optional[float] = None


class OutputJointSnapshot(BaseModel):
    id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None


class CurveSample(BaseModel):
    angle: int
    x: Optional[float] = None
    y: Optional[float] = None


class MechanismState(BaseModel):
    joints: List[MechanismJoint] = Field(default_factory=list)
    links: List[MechanismLink] = Field(default_factory=list)
    playing: bool = False
    speed: float = 1.0
    theta_deg: float = 0.0
    dead_point: bool = False
    dof: Optional[int] = None
    chart_dimension: str = "x"
    output_joint: Optional[OutputJointSnapshot] = None
    driven_joint_id: Optional[str] = None
    selected_items: List[Dict[str, str]] = Field(default_factory=list)
    curve_samples: List[CurveSample] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)


class SandboxExplainRequest(BaseModel):
    question: str = Field(default="请解释当前动画", min_length=1)
    mechanism_state: MechanismState


class SandboxExplainResponse(BaseModel):
    response: str


class GeneratedSceneJoint(BaseModel):
    id: str
    x: float
    y: float
    fixed: bool = False
    driven: bool = False
    constraint_type: Optional[str] = None
    pivot_id: Optional[str] = None
    radius: Optional[float] = None
    output: bool = False
    axis_angle_deg: Optional[float] = None
    axis_origin_x: Optional[float] = None
    axis_origin_y: Optional[float] = None


class GeneratedSceneLink(BaseModel):
    id: str
    a_id: str
    b_id: str
    length: float


class GeneratedScene(BaseModel):
    name: str
    description: str = ""
    theta_deg: float = 0.0
    joints: List[GeneratedSceneJoint] = Field(default_factory=list)
    links: List[GeneratedSceneLink] = Field(default_factory=list)


class SandboxSceneGenerateRequest(BaseModel):
    description: str = Field(..., min_length=1)


class SandboxSceneGenerateResponse(BaseModel):
    scene: GeneratedScene
    warnings: List[str] = Field(default_factory=list)


@lru_cache(maxsize=1)
def _get_explainer_types():
    _ensure_project_root_on_path()

    try:
        from ai.mechanism_explainer import MechanismExplainer, MechanismExplainerError
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "实战工坊 AI 模块未安装或未复制到后端运行环境，请重新构建 backend 镜像。"
        ) from exc

    return MechanismExplainer, MechanismExplainerError


@lru_cache(maxsize=1)
def _get_explainer():
    MechanismExplainer, _ = _get_explainer_types()
    return MechanismExplainer(
        api_base=settings.LLM_API_BASE,
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL,
    )


@lru_cache(maxsize=1)
def _get_scene_generator_types():
    _ensure_project_root_on_path()

    try:
        from ai.mechanism_scene_generator import (
            MechanismSceneGenerator,
            MechanismSceneGeneratorError,
        )
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "实战工坊场景生成模块未安装或未复制到后端运行环境，请重新构建 backend 镜像。"
        ) from exc

    return MechanismSceneGenerator, MechanismSceneGeneratorError


@lru_cache(maxsize=1)
def _get_scene_generator():
    MechanismSceneGenerator, _ = _get_scene_generator_types()
    return MechanismSceneGenerator(
        api_base=settings.LLM_API_BASE,
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL,
    )


@router.post("/explain", response_model=SandboxExplainResponse)
async def explain_current_mechanism(req: SandboxExplainRequest):
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")

    try:
        _, MechanismExplainerError = _get_explainer_types()
        explainer = _get_explainer()
        result = await explainer.explain(
            mechanism_state=req.mechanism_state.model_dump(),
            question=req.question,
        )
    except MechanismExplainerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"实战工坊 AI 服务内部错误：{str(exc)}") from exc

    return SandboxExplainResponse(**result)


@router.post("/generate-scene", response_model=SandboxSceneGenerateResponse)
async def generate_mechanism_scene(req: SandboxSceneGenerateRequest):
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY 未配置")
    if not settings.LLM_MODEL:
        raise HTTPException(status_code=503, detail="OPENAI_MODEL 未配置")

    try:
        _, MechanismSceneGeneratorError = _get_scene_generator_types()
        generator = _get_scene_generator()
        result = await generator.generate(req.description)
    except MechanismSceneGeneratorError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"实战工坊场景生成服务内部错误：{str(exc)}") from exc

    return SandboxSceneGenerateResponse(**result)
