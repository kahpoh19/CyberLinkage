"""实战工坊机械机构解释器。"""

import json
import os
from typing import Any, Dict

import httpx


PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


MECHANISM_EXPLAINER_PROMPT = _load_prompt("mechanism_explainer.txt")


class MechanismExplainerError(Exception):
    """上游 LLM 服务调用失败。"""


class MechanismExplainer:
    """根据当前机构状态解释动画、约束与异常。"""

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

    async def explain(self, mechanism_state: Dict[str, Any], question: str) -> Dict[str, str]:
        messages = [
            {
                "role": "system",
                "content": MECHANISM_EXPLAINER_PROMPT or (
                    "你是 CyberLinkage 的机械原理实战工坊助手。"
                    "请结合用户提供的机构状态 JSON，解释当前机构类型、驱动关系、"
                    "输出运动趋势、死点/非法位置原因，并给出简洁操作建议。"
                ),
            },
            {
                "role": "user",
                "content": self._build_user_prompt(mechanism_state, question),
            },
        ]
        response_text = await self._call_llm(messages)
        return {"response": response_text}

    def _build_user_prompt(self, mechanism_state: Dict[str, Any], question: str) -> str:
        safe_question = (question or "").strip() or "请解释当前动画。"
        state_json = json.dumps(mechanism_state, ensure_ascii=False, indent=2)
        return (
            f"用户问题：{safe_question}\n\n"
            "下面是实战工坊当前机构状态，请只基于这些数据解释：\n"
            f"```json\n{state_json}\n```"
        )

    async def _call_llm(self, messages):
        if not self.api_key:
            raise MechanismExplainerError("OPENAI_API_KEY 未配置")

        if not self.model:
            raise MechanismExplainerError("OPENAI_MODEL 未配置")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 900,
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
            raise MechanismExplainerError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise MechanismExplainerError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise MechanismExplainerError(f"上游 LLM 响应格式异常: {str(exc)}") from exc
