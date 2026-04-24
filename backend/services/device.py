"""客户端设备识别工具。"""

from __future__ import annotations

from typing import Mapping, Optional

VALID_DEVICE_TYPES = {"mobile", "tablet", "desktop"}


def _normalize_header_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _parse_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def detect_device_context(headers: Mapping[str, str]) -> dict:
    lowered_headers = {str(key).lower(): value for key, value in headers.items()}
    user_agent = lowered_headers.get("user-agent", "") or ""
    normalized_ua = user_agent.lower()

    requested_device_type = _normalize_header_value(lowered_headers.get("x-cy-device-type"))
    viewport_width = _parse_int(lowered_headers.get("x-cy-viewport-width"))
    viewport_height = _parse_int(lowered_headers.get("x-cy-viewport-height"))
    touch_capable = _normalize_header_value(lowered_headers.get("x-cy-touch-capable")) == "true"

    is_tablet_ua = any(
        token in normalized_ua
        for token in ("ipad", "tablet", "playbook", "kindle", "silk")
    ) or ("android" in normalized_ua and "mobile" not in normalized_ua)
    is_mobile_ua = any(
        token in normalized_ua
        for token in ("iphone", "ipod", "windows phone", "opera mini")
    ) or ("android" in normalized_ua and "mobile" in normalized_ua)

    if requested_device_type in VALID_DEVICE_TYPES:
        device_type = requested_device_type
        detected_from = "client-header"
    elif is_tablet_ua:
        device_type = "tablet"
        detected_from = "user-agent"
    elif is_mobile_ua:
        device_type = "mobile"
        detected_from = "user-agent"
    elif viewport_width is not None:
        if viewport_width <= 768:
            device_type = "mobile"
        elif viewport_width <= 1180:
            device_type = "tablet"
        else:
            device_type = "desktop"
        detected_from = "viewport"
    else:
        device_type = "desktop"
        detected_from = "fallback"

    if "iphone" in normalized_ua or "ipad" in normalized_ua or "ipod" in normalized_ua:
        platform = "ios"
    elif "android" in normalized_ua:
        platform = "android"
    elif "windows" in normalized_ua:
        platform = "windows"
    elif "mac os x" in normalized_ua or "macintosh" in normalized_ua:
        platform = "macos"
    elif "linux" in normalized_ua:
        platform = "linux"
    else:
        platform = "unknown"

    if "edg/" in normalized_ua:
        browser = "edge"
    elif "chrome/" in normalized_ua and "edg/" not in normalized_ua:
        browser = "chrome"
    elif "firefox/" in normalized_ua:
        browser = "firefox"
    elif "safari/" in normalized_ua and "chrome/" not in normalized_ua:
        browser = "safari"
    else:
        browser = "unknown"

    return {
        "device_type": device_type,
        "platform": platform,
        "browser": browser,
        "viewport_width": viewport_width,
        "viewport_height": viewport_height,
        "is_touch": touch_capable or is_mobile_ua or is_tablet_ua,
        "detected_from": detected_from,
        "user_agent": user_agent,
    }
