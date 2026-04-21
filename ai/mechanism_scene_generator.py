"""实战工坊机构场景生成器。"""

import json
import os
import re
from math import sqrt
from typing import Any, Dict, List, Optional, Tuple

import httpx


PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


MECHANISM_SCENE_GENERATOR_PROMPT = _load_prompt("mechanism_scene_generator.txt")


class MechanismSceneGeneratorError(Exception):
    """机构场景生成失败。"""


class MechanismSceneGenerator:
    """根据自然语言描述生成可加载到实战工坊的机构场景。"""

    def __init__(
        self,
        api_base: str = None,
        api_key: str = None,
        model: str = None,
    ):
        self.api_base = api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = (model or os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "").strip()

        if not self.model:
            raise ValueError("OPENAI_MODEL 未配置")

    async def generate(self, description: str) -> Dict[str, Any]:
        prompt = (description or "").strip()
        if not prompt:
            raise MechanismSceneGeneratorError("场景描述不能为空")

        messages = [
            {
                "role": "system",
                "content": MECHANISM_SCENE_GENERATOR_PROMPT or (
                    "你是 CyberLinkage 的机械原理机构生成助手。"
                    "请将用户的中文描述转换为受约束的 JSON 机构场景，"
                    "只使用 joints、links、theta_deg 这些字段。"
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ]

        built_in = self._match_builtin_scene(prompt)

        try:
            raw_text = await self._call_llm(messages)
            return self._parse_scene(raw_text, prompt)
        except MechanismSceneGeneratorError:
            if built_in:
                built_in["warnings"].append("模型输出不可用，已回退到内置机构模板。")
                return built_in
            raise

    async def _call_llm(self, messages: List[Dict[str, str]]) -> str:
        if not self.api_key:
            raise MechanismSceneGeneratorError("OPENAI_API_KEY 未配置")
        if not self.model:
            raise MechanismSceneGeneratorError("OPENAI_MODEL 未配置")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.25,
            "max_tokens": 1300,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()
            if detail:
                detail = detail[:300]
            else:
                detail = exc.response.reason_phrase
            raise MechanismSceneGeneratorError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise MechanismSceneGeneratorError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise MechanismSceneGeneratorError(f"上游 LLM 响应格式异常: {str(exc)}") from exc

    def _parse_scene(self, raw_text: str, description: str) -> Dict[str, Any]:
        payload = self._extract_json_payload(raw_text)
        if not isinstance(payload, dict):
            raise MechanismSceneGeneratorError("模型输出不是 JSON 对象")

        raw_joints = payload.get("joints")
        raw_links = payload.get("links")
        if not isinstance(raw_joints, list) or len(raw_joints) < 2:
            raise MechanismSceneGeneratorError("模型输出的 joints 数量过少或格式错误")
        if not isinstance(raw_links, list):
            raise MechanismSceneGeneratorError("模型输出的 links 格式错误")

        joints, lookup_map, warnings = self._normalize_joints(raw_joints)
        links, link_warnings = self._normalize_links(raw_links, joints, lookup_map)
        warnings.extend(link_warnings)

        if not links:
            fallback = self._match_builtin_scene(description)
            if fallback:
                fallback["warnings"].insert(0, "模型输出的连杆无效，已回退到内置机构模板。")
                return fallback
            raise MechanismSceneGeneratorError("模型没有生成有效连杆，暂时无法布置该机构")

        theta_deg = self._coerce_float(payload.get("theta_deg"), fallback=0.0)
        theta_deg = round(theta_deg % 360, 3)

        scene_name = str(payload.get("name") or payload.get("scene_name") or "AI 生成机构").strip()
        scene_description = str(payload.get("description") or description).strip() or description

        return {
            "scene": {
                "name": scene_name,
                "description": scene_description,
                "theta_deg": theta_deg,
                "joints": joints,
                "links": links,
            },
            "warnings": warnings,
        }

    def _normalize_joints(
        self,
        raw_joints: List[Any],
    ) -> Tuple[List[Dict[str, Any]], Dict[str, str], List[str]]:
        joints: List[Dict[str, Any]] = []
        used_ids = set()
        lookup_map: Dict[str, str] = {}
        warnings: List[str] = []

        for index, item in enumerate(raw_joints, start=1):
            if not isinstance(item, dict):
                warnings.append(f"第 {index} 个节点不是对象，已忽略。")
                continue

            raw_id = str(item.get("id") or item.get("name") or f"joint_{index}").strip()
            joint_id = self._dedupe_id(self._slugify(raw_id) or f"joint_{index}", used_ids)

            x = self._coerce_float(item.get("x"), fallback=(index - 1) * 80.0)
            y = self._coerce_float(item.get("y"), fallback=0.0)
            if item.get("x") is None or item.get("y") is None:
                warnings.append(f"节点 {joint_id} 缺少坐标，已自动补全。")

            constraint_type = self._normalize_constraint_type(
                item.get("constraint_type") or item.get("constraintType") or item.get("type")
            )

            joint = {
                "id": joint_id,
                "x": round(x, 3),
                "y": round(y, 3),
                "fixed": self._coerce_bool(item.get("fixed"), False),
                "driven": self._coerce_bool(item.get("driven"), False),
                "constraint_type": constraint_type,
                "pivot_id": None,
                "radius": None,
                "output": self._coerce_bool(item.get("output"), False),
                "axis_angle_deg": None,
                "axis_origin_x": None,
                "axis_origin_y": None,
            }

            raw_pivot = item.get("pivot_id", item.get("pivotId", item.get("pivot")))
            if raw_pivot is not None:
                joint["_raw_pivot"] = raw_pivot

            radius = self._coerce_float(item.get("radius"), fallback=None)
            if radius is not None and radius > 0:
                joint["radius"] = round(radius, 3)

            if constraint_type == "SLIDER":
                angle = self._coerce_float(item.get("axis_angle_deg", item.get("axisAngleDeg")), fallback=0.0)
                joint["axis_angle_deg"] = round(angle, 3)
                origin_x = self._coerce_float(item.get("axis_origin_x", item.get("axisOriginX")), fallback=x)
                origin_y = self._coerce_float(item.get("axis_origin_y", item.get("axisOriginY")), fallback=y)
                joint["axis_origin_x"] = round(origin_x, 3)
                joint["axis_origin_y"] = round(origin_y, 3)

            joints.append(joint)

            for candidate in (raw_id, joint_id, item.get("name")):
                normalized = self._normalize_lookup_key(candidate)
                if normalized:
                    lookup_map[normalized] = joint_id

        if len(joints) < 2:
            raise MechanismSceneGeneratorError("有效节点数量不足，暂时无法生成机构")

        id_to_joint = {joint["id"]: joint for joint in joints}
        for joint in joints:
            raw_pivot = joint.pop("_raw_pivot", None)
            resolved_pivot = self._resolve_joint_id(raw_pivot, lookup_map)
            if resolved_pivot and resolved_pivot in id_to_joint and resolved_pivot != joint["id"]:
                joint["pivot_id"] = resolved_pivot

        if not any(joint["fixed"] for joint in joints):
            joints[0]["fixed"] = True
            warnings.append("未检测到固定点，已将第一个节点设为固定点。")

        output_joints = [joint for joint in joints if joint["output"]]
        if not output_joints:
            candidate = next((joint for joint in reversed(joints) if not joint["fixed"]), joints[-1])
            candidate["output"] = True
            warnings.append("未检测到输出点，已自动标记一个输出节点。")
        elif len(output_joints) > 1:
            for joint in output_joints[1:]:
                joint["output"] = False
            warnings.append("检测到多个输出点，已仅保留第一个。")

        driven_joints = [joint for joint in joints if joint["driven"]]
        if len(driven_joints) > 1:
            for joint in driven_joints[1:]:
                joint["driven"] = False
            warnings.append("检测到多个驱动点，已仅保留第一个。")

        if not any(joint["driven"] for joint in joints):
            candidate = next(
                (joint for joint in joints if not joint["fixed"] and joint["constraint_type"] != "SLIDER"),
                None,
            )
            if candidate:
                candidate["driven"] = True
                warnings.append("未检测到驱动点，已自动选择一个转动节点作为驱动点。")

        self._finalize_driven_joints(joints, warnings)
        return joints, lookup_map, warnings

    def _finalize_driven_joints(self, joints: List[Dict[str, Any]], warnings: List[str]) -> None:
        id_to_joint = {joint["id"]: joint for joint in joints}

        for joint in joints:
            if not joint["driven"]:
                continue

            if joint["constraint_type"] == "SLIDER":
                joint["driven"] = False
                warnings.append(f"滑块节点 {joint['id']} 不支持作为驱动点，已取消其驱动状态。")
                continue

            fixed_candidates = [
                candidate for candidate in joints
                if candidate["fixed"] and candidate["id"] != joint["id"]
            ]

            if not fixed_candidates:
                replacement = next((candidate for candidate in joints if candidate["id"] != joint["id"]), None)
                if replacement:
                    replacement["fixed"] = True
                    fixed_candidates = [replacement]
                    warnings.append(f"驱动点 {joint['id']} 缺少固定支点，已自动固定 {replacement['id']}。")

            if not fixed_candidates:
                joint["driven"] = False
                warnings.append(f"驱动点 {joint['id']} 缺少可用支点，已取消驱动状态。")
                continue

            pivot_id = joint.get("pivot_id")
            if pivot_id not in id_to_joint or not id_to_joint[pivot_id]["fixed"] or pivot_id == joint["id"]:
                pivot_id = fixed_candidates[0]["id"]
                joint["pivot_id"] = pivot_id
                warnings.append(f"驱动点 {joint['id']} 的支点无效，已改为 {pivot_id}。")

            pivot = id_to_joint[pivot_id]
            if not joint.get("radius") or joint["radius"] <= 0:
                joint["radius"] = round(self._distance(joint, pivot), 3) or 40.0

        if not any(joint["driven"] for joint in joints):
            candidate = next(
                (
                    joint for joint in joints
                    if not joint["fixed"] and joint["constraint_type"] != "SLIDER"
                ),
                None,
            )
            fixed_candidate = next((joint for joint in joints if joint["fixed"] and joint["id"] != candidate["id"]), None) if candidate else None
            if candidate and fixed_candidate:
                candidate["driven"] = True
                candidate["pivot_id"] = fixed_candidate["id"]
                candidate["radius"] = round(self._distance(candidate, fixed_candidate), 3) or 40.0
                warnings.append("已自动补全一个驱动点与其固定支点。")

    def _normalize_links(
        self,
        raw_links: List[Any],
        joints: List[Dict[str, Any]],
        lookup_map: Dict[str, str],
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        id_to_joint = {joint["id"]: joint for joint in joints}
        links: List[Dict[str, Any]] = []
        warnings: List[str] = []
        used_ids = set()
        seen_pairs = set()

        for index, item in enumerate(raw_links, start=1):
            if not isinstance(item, dict):
                warnings.append(f"第 {index} 条连杆不是对象，已忽略。")
                continue

            a_id = self._resolve_joint_id(
                item.get("a_id", item.get("aId", item.get("from", item.get("source")))),
                lookup_map,
            )
            b_id = self._resolve_joint_id(
                item.get("b_id", item.get("bId", item.get("to", item.get("target")))),
                lookup_map,
            )

            if not a_id or not b_id or a_id == b_id:
                warnings.append(f"第 {index} 条连杆的端点无效，已忽略。")
                continue
            if a_id not in id_to_joint or b_id not in id_to_joint:
                warnings.append(f"第 {index} 条连杆引用了不存在的节点，已忽略。")
                continue

            pair = tuple(sorted((a_id, b_id)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            link_id = self._dedupe_id(
                self._slugify(item.get("id") or f"link_{index}") or f"link_{index}",
                used_ids,
            )

            length = self._coerce_float(item.get("length"), fallback=None)
            if length is None or length <= 0:
                length = self._distance(id_to_joint[a_id], id_to_joint[b_id])
            if length <= 0:
                warnings.append(f"连杆 {link_id} 长度无效，已忽略。")
                continue

            links.append(
                {
                    "id": link_id,
                    "a_id": a_id,
                    "b_id": b_id,
                    "length": round(length, 3),
                }
            )

        return links, warnings

    def _extract_json_payload(self, raw_text: str) -> Any:
        text = raw_text.strip()
        if not text:
            raise MechanismSceneGeneratorError("模型返回内容为空")

        candidates = [text]
        fenced_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
        if fenced_match:
            candidates.insert(0, fenced_match.group(1).strip())

        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
            candidates.append(text[brace_start:brace_end + 1].strip())

        last_error: Optional[Exception] = None
        for candidate in candidates:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError as exc:
                last_error = exc

        raise MechanismSceneGeneratorError(
            f"模型输出无法解析为 JSON: {str(last_error)}"
        ) from last_error

    def _match_builtin_scene(self, description: str) -> Optional[Dict[str, Any]]:
        text = (description or "").lower()

        if any(keyword in text for keyword in ("四连杆", "四杆", "fourbar", "four-bar")):
            return {
                "scene": {
                    "name": "AI 四连杆模板",
                    "description": description,
                    "theta_deg": 90.0,
                    "joints": [
                        {"id": "O", "x": -100.0, "y": 0.0, "fixed": True, "driven": False, "constraint_type": None, "pivot_id": None, "radius": None, "output": False, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                        {"id": "D", "x": 100.0, "y": 0.0, "fixed": True, "driven": False, "constraint_type": None, "pivot_id": None, "radius": None, "output": False, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                        {"id": "A", "x": -100.0, "y": 50.0, "fixed": False, "driven": True, "constraint_type": None, "pivot_id": "O", "radius": 50.0, "output": False, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                        {"id": "B", "x": 60.0, "y": 90.0, "fixed": False, "driven": False, "constraint_type": None, "pivot_id": None, "radius": None, "output": True, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                    ],
                    "links": [
                        {"id": "OA", "a_id": "O", "b_id": "A", "length": 50.0},
                        {"id": "AB", "a_id": "A", "b_id": "B", "length": 160.0},
                        {"id": "DB", "a_id": "D", "b_id": "B", "length": 110.0},
                    ],
                },
                "warnings": [],
            }

        if any(keyword in text for keyword in ("曲柄滑块", "滑块", "slider-crank", "slider crank")):
            return {
                "scene": {
                    "name": "AI 曲柄滑块模板",
                    "description": description,
                    "theta_deg": 0.0,
                    "joints": [
                        {"id": "O", "x": -100.0, "y": 0.0, "fixed": True, "driven": False, "constraint_type": None, "pivot_id": None, "radius": None, "output": False, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                        {"id": "A", "x": -20.0, "y": 0.0, "fixed": False, "driven": True, "constraint_type": None, "pivot_id": "O", "radius": 80.0, "output": False, "axis_angle_deg": None, "axis_origin_x": None, "axis_origin_y": None},
                        {"id": "S", "x": 180.0, "y": 0.0, "fixed": False, "driven": False, "constraint_type": "SLIDER", "pivot_id": None, "radius": None, "output": True, "axis_angle_deg": 0.0, "axis_origin_x": 0.0, "axis_origin_y": 0.0},
                    ],
                    "links": [
                        {"id": "OA", "a_id": "O", "b_id": "A", "length": 80.0},
                        {"id": "AS", "a_id": "A", "b_id": "S", "length": 200.0},
                    ],
                },
                "warnings": [],
            }

        return None

    def _distance(self, a: Dict[str, Any], b: Dict[str, Any]) -> float:
        dx = (a.get("x") or 0.0) - (b.get("x") or 0.0)
        dy = (a.get("y") or 0.0) - (b.get("y") or 0.0)
        return sqrt(dx * dx + dy * dy)

    def _coerce_float(self, value: Any, fallback: Optional[float]) -> Optional[float]:
        if value is None:
            return fallback
        try:
            result = float(value)
        except (TypeError, ValueError):
            return fallback
        return result if result == result and result not in (float("inf"), float("-inf")) else fallback

    def _coerce_bool(self, value: Any, fallback: bool) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "y"}:
                return True
            if normalized in {"false", "0", "no", "n"}:
                return False
        return fallback

    def _normalize_constraint_type(self, value: Any) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().upper().replace("-", "_")
        if normalized in {"SLIDER", "PRISMATIC"}:
            return "SLIDER"
        return None

    def _slugify(self, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        slug = re.sub(r"[^0-9A-Za-z_]+", "_", text)
        slug = re.sub(r"_+", "_", slug).strip("_").lower()
        return slug

    def _dedupe_id(self, base: str, used_ids: set) -> str:
        candidate = base or "item"
        if candidate not in used_ids:
            used_ids.add(candidate)
            return candidate

        index = 2
        while f"{candidate}_{index}" in used_ids:
            index += 1
        candidate = f"{candidate}_{index}"
        used_ids.add(candidate)
        return candidate

    def _normalize_lookup_key(self, value: Any) -> str:
        if value is None:
            return ""
        return self._slugify(value)

    def _resolve_joint_id(self, value: Any, lookup_map: Dict[str, str]) -> str:
        key = self._normalize_lookup_key(value)
        if not key:
            return ""
        return lookup_map.get(key, "")
