"""苏格拉底式 AI 辅导 Agent —— 引导学生自主发现答案"""

import os
from typing import Dict, List, Optional

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

        # RAG 检索相关内容
        context_chunks = []
        if self.rag and self.rag.ready:
            try:
                context_chunks = self.rag.query(user_message, k=3)
            except Exception:
                context_chunks = []
        context_text = "\n\n".join(context_chunks) if context_chunks else "（暂无教材参考资料）"

        # 构建系统提示
        system_prompt = self._build_system_prompt(
            mode=mode,
            context=context_text,
            mastery=student_mastery,
            topic=current_topic,
        )

        # 构建消息列表
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-10:])  # 保留最近 10 轮对话
        messages.append({"role": "user", "content": user_message})

        # 调用 LLM
        response_text = await self._call_llm(messages)

        return {
            "response": response_text,
            "knowledge_points": [current_topic] if current_topic else [],
        }

    def _build_system_prompt(
        self,
        mode: str,
        context: str,
        mastery: Dict[str, float],
        topic: Optional[str],
    ) -> str:
        generic_base = "你是 CyberLinkage 助教，一个专注于 C 语言程序设计的 AI 学习辅导老师。"
        base = SOCRATIC_PROMPT if mode == "socratic" and SOCRATIC_PROMPT else generic_base

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

        topic_info = f"\n当前讨论知识点：{topic}" if topic else ""

        return (
            f"{base}\n{mode_instruction}\n{mastery_info}\n{topic_info}\n\n"
            f"以下是相关教材内容供参考：\n{context}"
        )

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
            "temperature": 0.7,
            "max_tokens": 1000,
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
            raise LLMServiceError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise LLMServiceError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMServiceError(f"上游 LLM 响应格式异常: {str(exc)}") from exc


_tutor: Optional[SocraticTutor] = None


def get_tutor() -> SocraticTutor:
    global _tutor

    if _tutor is None:
        _tutor = SocraticTutor()

    return _tutor
