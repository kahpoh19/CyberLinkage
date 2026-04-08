"""苏格拉底式 AI 辅导 Agent —— 引导学生自主发现答案"""

import os
from typing import Dict, List, Optional

import httpx

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
        model: str = "gpt-4",
    ):
        self.api_base = api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = model
        self.rag = RAGPipeline(api_base=self.api_base, api_key=self.api_key)

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
        context_chunks = self.rag.query(user_message, k=3) if self.rag.ready else []
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
        base = SOCRATIC_PROMPT if SOCRATIC_PROMPT else "你是知路助教，一个C语言学习辅导AI。"

        mode_instruction = ""
        if mode == "socratic":
            mode_instruction = (
                "\n\n【当前模式：苏格拉底式引导】\n"
                "- 不要直接给出答案\n"
                "- 通过提问引导学生思考\n"
                "- 如果学生多次回答错误，逐步增加提示力度"
            )
        else:
            mode_instruction = (
                "\n\n【当前模式：直接解释】\n"
                "- 详细解释概念和解题过程\n"
                "- 举例说明\n"
                "- 总结要点"
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
        url = f"{self.api_base}/chat/completions"
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
        except Exception as e:
            return f"抱歉，AI 服务暂时不可用：{str(e)}"


# 全局单例
tutor = SocraticTutor()
