"""苏格拉底式 AI 辅导 Agent —— 引导学生自主发现答案"""

import json
import os
from typing import AsyncIterator, Dict, List, Optional

import httpx

try:
    from .rag_pipeline import RAGPipeline
except ImportError:
    from rag_pipeline import RAGPipeline


# 加载提示词
PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


SOCRATIC_PROMPT = _load_prompt("socratic_tutor.txt")
PATH_PROMPT = _load_prompt("path_explainer.txt")
CHAT_HISTORY_ROUNDS = 6
RAG_TOP_K = 2
CHAT_MAX_TOKENS = 420

SUBJECT_PROFILES = {
    "mechanics": {
        "label": "机械原理",
        "guidance": (
            "- 重点解释构件、运动副、自由度、约束关系、运动传递、死点和位移曲线。\n"
            "- 如果用户提到实战工坊，优先结合固定点、驱动点、输出点和机构运动来说明。\n"
            "- 不要默认给出代码示例，优先解释机构含义和分析步骤。"
        ),
    },
    "c_language": {
        "label": "C 语言程序设计",
        "guidance": (
            "- 重点解释语法、指针、数组、函数、结构体、内存和调试思路。\n"
            "- 如果适合，请使用 ```c 代码块给出示例代码。"
        ),
    },
    "data_structure": {
        "label": "数据结构",
        "guidance": (
            "- 重点解释数据结构特点、操作流程、时间复杂度和空间复杂度。\n"
            "- 如果需要示例，可以使用伪代码或简洁代码说明，但不要只给结论。"
        ),
    },
    "calculus": {
        "label": "高等数学",
        "guidance": (
            "- 重点解释定义、推导逻辑、公式适用条件和解题思路。\n"
            "- 可以给出简洁公式，但要解释每一步为什么成立。"
        ),
    },
    "aerospace": {
        "label": "航空航天概论",
        "guidance": (
            "- 重点解释飞行原理、飞行器构型、任务流程和系统组成。\n"
            "- 回答时优先讲清概念之间的关系，不要把内容写得过于抽象。"
        ),
    },
    "thermo": {
        "label": "工程热力学",
        "guidance": (
            "- 重点解释状态参数、热力学定律、过程分析、循环效率和能量守恒。\n"
            "- 如果涉及公式，优先说明物理意义和适用前提。"
        ),
    },
    "physics": {
        "label": "大学物理",
        "guidance": (
            "- 重点解释物理图景、受力/场的关系、公式来源和单位量纲。\n"
            "- 如果用户卡在题目上，先帮他建立模型，再代入计算。"
        ),
    },
    "circuits": {
        "label": "电路原理",
        "guidance": (
            "- 重点解释等效电路、KCL/KVL、相量、暂态/稳态分析和器件作用。\n"
            "- 回答时优先说清电流电压关系和分析路径。"
        ),
    },
}


class LLMServiceError(Exception):
    """上游 LLM 服务调用失败。"""


class SocraticTutor:
    """
    苏格拉底式 AI 辅导 Agent

    支持两种模式：
    - socratic: 通过引导性提问帮助学生自主发现答案
    - explain: 直接给出详细解释
    """

    def __init__(
        self,
        api_base: str = None,
        api_key: str = None,
        model: str = None,
    ):
        self.api_base = api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = (model or os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "").strip()
        self.rag: Optional[RAGPipeline] = None

        if not self.model:
            raise ValueError("OPENAI_MODEL 未配置")

        try:
            self.rag = RAGPipeline(api_base=self.api_base, api_key=self.api_key)
        except Exception:
            # RAG 初始化失败时降级为纯对话，避免整个服务不可用。
            self.rag = None

    async def chat(
        self,
        user_message: str,
        history: List[Dict] = None,
        mode: str = "socratic",
        student_mastery: Dict[str, float] = None,
        current_topic: str = None,
        subject_id: str = None,
        subject_label: str = None,
    ) -> Dict:
        """
        与学生对话

        Args:
            user_message: 学生的问题
            history: 对话历史 [{"role": "user"|"assistant", "content": "..."}]
            mode: "socratic"（引导模式）或 "explain"（直接解释）
            student_mastery: 学生掌握度 {kp_id: mastery}
            current_topic: 当前讨论的知识点

        Returns:
            {"response": str, "knowledge_points": list}
        """
        if history is None:
            history = []
        if student_mastery is None:
            student_mastery = {}
        messages = self._build_messages(
            user_message=user_message,
            history=history,
            mode=mode,
            student_mastery=student_mastery,
            current_topic=current_topic,
            subject_id=subject_id,
            subject_label=subject_label,
        )
        response_text = self._format_response_text(await self._call_llm(messages))

        return {
            "response": response_text,
            "knowledge_points": [current_topic] if current_topic else [],
        }

    async def stream_chat(
        self,
        user_message: str,
        history: List[Dict] = None,
        mode: str = "socratic",
        student_mastery: Dict[str, float] = None,
        current_topic: str = None,
        subject_id: str = None,
        subject_label: str = None,
    ) -> AsyncIterator[str]:
        if history is None:
            history = []
        if student_mastery is None:
            student_mastery = {}

        messages = self._build_messages(
            user_message=user_message,
            history=history,
            mode=mode,
            student_mastery=student_mastery,
            current_topic=current_topic,
            subject_id=subject_id,
            subject_label=subject_label,
        )

        async for chunk in self._call_llm_stream(messages):
            yield chunk

    def _build_messages(
        self,
        user_message: str,
        history: List[Dict],
        mode: str,
        student_mastery: Dict[str, float],
        current_topic: Optional[str],
        subject_id: Optional[str],
        subject_label: Optional[str],
    ) -> List[Dict[str, str]]:
        subject_info = self._resolve_subject_info(subject_id, subject_label)
        context_text = self._load_context_text(user_message, subject_info)
        system_prompt = self._build_system_prompt(
            mode=mode,
            context=context_text,
            mastery=student_mastery,
            topic=current_topic,
            subject_info=subject_info,
        )

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-CHAT_HISTORY_ROUNDS:])
        messages.append({"role": "user", "content": user_message})
        return messages

    def _load_context_text(self, user_message: str, subject_info: Dict[str, str]) -> str:
        context_chunks = []
        enable_rag = subject_info["id"] in {"", "c_language"}
        if enable_rag and self.rag and self.rag.ready:
            try:
                context_chunks = self.rag.query(user_message, k=RAG_TOP_K)
            except Exception:
                context_chunks = []
        return "\n\n".join(context_chunks) if context_chunks else "（暂无教材参考资料）"

    def _build_system_prompt(
        self,
        mode: str,
        context: str,
        mastery: Dict[str, float],
        topic: Optional[str],
        subject_info: Dict[str, str],
    ) -> str:
        subject_name = subject_info["label"]
        generic_base = f"你是 CyberLinkage 助教，一个专注于 {subject_name} 的 AI 学习辅导老师。"
        base = (
            SOCRATIC_PROMPT
            if mode == "socratic" and subject_info["id"] == "c_language" and SOCRATIC_PROMPT
            else generic_base
        )

        mode_instruction = ""
        if mode == "socratic":
            mode_instruction = (
                "\n\n【当前模式：苏格拉底式引导】\n"
                "- 不要一上来直接给出最终答案或完整代码\n"
                "- 优先提出 1 到 2 个关键问题，引导学生自己思考\n"
                "- 只有在学生明确要求直接答案，或多轮引导仍无进展时，才逐步增加提示力度"
            )
        else:
            mode_instruction = (
                "\n\n【当前模式：直接解释】\n"
                "- 直接回答问题，不要把主要内容写成连续追问\n"
                "- 先给出结论，再解释原因、步骤和必要示例\n"
                "- 如果适合，可以直接给出代码、公式或操作方法\n"
                "- 除非必须澄清问题，否则不要只回一个反问句"
            )

        mastery_info = ""
        if mastery:
            weak = [f"{k}({v:.0%})" for k, v in mastery.items() if v < 0.6]
            if weak:
                mastery_info = f"\n\n学生薄弱点：{', '.join(weak)}"

        subject_context = (
            f"\n\n【当前科目】\n"
            f"- 当前科目：{subject_name}\n"
            f"{subject_info['guidance']}"
        )
        topic_info = f"\n当前讨论知识点：{topic}" if topic else ""
        format_instruction = (
            "\n\n【回答格式】\n"
            "- 必须使用 Markdown 输出\n"
            "- 先用 1 句话给出核心判断或下一步\n"
            "- 再用 2 到 4 个要点分段说明，避免贴成一整大段\n"
            "- 每个要点尽量控制在 1 到 2 句，默认保持简洁，用户追问再展开\n"
            "- 只有确实必要时才给 1 个简短代码块、公式块或示例\n"
            "- 不要重复题面，不要写空泛套话"
        )

        return (
            f"{base}\n{subject_context}\n{mode_instruction}\n{format_instruction}\n{mastery_info}\n{topic_info}\n\n"
            f"以下是相关教材内容供参考：\n{context}"
        )

    def _resolve_subject_info(self, subject_id: Optional[str], subject_label: Optional[str]) -> Dict[str, str]:
        normalized_id = (subject_id or "").strip().lower()
        profile = SUBJECT_PROFILES.get(normalized_id, {})
        label = (subject_label or "").strip() or profile.get("label") or "当前科目"
        guidance = profile.get(
            "guidance",
            (
                "- 请围绕当前科目回答，不要默认切换到 C 语言或编程语境。\n"
                "- 优先解释概念、原理、步骤和常见误区，并根据用户问题给出对应示例。"
            ),
        )
        return {
            "id": normalized_id,
            "label": label,
            "guidance": guidance,
        }

    async def _call_llm(self, messages: List[Dict]) -> str:
        """调用 LLM API"""
        if not self.api_key:
            raise LLMServiceError("OPENAI_API_KEY 未配置")

        if not self.model:
            raise LLMServiceError("OPENAI_MODEL 未配置")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.45,
            "max_tokens": CHAT_MAX_TOKENS,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            detail = self._extract_error_detail(exc.response.text, exc.response.reason_phrase)
            raise LLMServiceError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise LLMServiceError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMServiceError(f"上游 LLM 响应格式异常: {str(exc)}") from exc

    async def _call_llm_stream(self, messages: List[Dict]) -> AsyncIterator[str]:
        if not self.api_key:
            raise LLMServiceError("OPENAI_API_KEY 未配置")

        if not self.model:
            raise LLMServiceError("OPENAI_MODEL 未配置")

        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.45,
            "max_tokens": CHAT_MAX_TOKENS,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    resp.raise_for_status()

                    async for line in resp.aiter_lines():
                        if not line:
                            continue

                        raw_line = line.strip()
                        if raw_line.startswith("data:"):
                            raw_line = raw_line[5:].strip()

                        if raw_line == "[DONE]":
                            break

                        try:
                            data = json.loads(raw_line)
                        except ValueError:
                            continue

                        chunk = self._extract_stream_chunk(data)
                        if chunk:
                            yield chunk
        except httpx.HTTPStatusError as exc:
            detail = exc.response.reason_phrase
            try:
                raw = await exc.response.aread()
                text = raw.decode("utf-8", errors="ignore").strip()
                if text:
                    detail = self._extract_error_detail(text, detail)
            except Exception:
                pass
            raise LLMServiceError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise LLMServiceError(f"无法连接到上游 LLM: {str(exc)}") from exc

    def _extract_stream_chunk(self, data: Dict) -> str:
        choices = data.get("choices") or []
        if not choices:
            return ""

        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict)
            )
        return ""

    def _format_response_text(self, text: str) -> str:
        return "\n\n".join(
            segment.strip()
            for segment in text.replace("\r\n", "\n").strip().split("\n\n")
            if segment.strip()
        )

    def _extract_error_detail(self, text: str, fallback: str) -> str:
        raw = (text or "").strip()
        if not raw:
            return fallback

        try:
            data = json.loads(raw)
        except ValueError:
            return raw[:300]

        error = data.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            metadata = error.get("metadata")
            if isinstance(metadata, dict) and metadata.get("raw"):
                return str(metadata["raw"])[:300]
            if message:
                return str(message)[:300]
        if isinstance(error, str):
            return error[:300]
        return raw[:300]


_tutor: Optional[SocraticTutor] = None


def get_tutor() -> SocraticTutor:
    global _tutor

    if _tutor is None:
        _tutor = SocraticTutor()

    return _tutor
