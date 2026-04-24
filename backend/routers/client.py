"""客户端上下文与设备识别接口。"""

from fastapi import APIRouter, Request

from services.device import detect_device_context

router = APIRouter(prefix="/api/client", tags=["客户端"])


@router.get("/device")
def get_device_context(request: Request):
    return detect_device_context(request.headers)
