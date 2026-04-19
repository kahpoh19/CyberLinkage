"""AI 题库生成器。"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Sequence

import httpx

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
DEFAULT_KNOWLEDGE_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "knowledge",
    "data",
)


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


QUESTION_BANK_PROMPT = _load_prompt("question_bank_generator.txt")


class QuestionBankGeneratorError(Exception):
    """题库生成失败。"""


class QuestionBankGeneratorInputError(QuestionBankGeneratorError):
    """题库生成输入不合法。"""


class QuestionBankGeneratorLLMError(QuestionBankGeneratorError):
    """上游 LLM 调用或输出格式异常。"""


class QuestionBankGenerator:
    """为知识点生成结构化题库。"""

    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        knowledge_data_dir: Optional[str] = None,
    ):
        self.api_base = api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = (model or os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "").strip()
        self.knowledge_data_dir = knowledge_data_dir or DEFAULT_KNOWLEDGE_DATA_DIR

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY 未配置")
        if not self.model:
            raise ValueError("OPENAI_MODEL 未配置")

    async def generate_for_subject(
        self,
        subject_id: str,
        knowledge_point_ids: Optional[Sequence[str]] = None,
        questions_per_point: int = 3,
        max_points: Optional[int] = None,
    ) -> Dict[str, Any]:
        if questions_per_point <= 0:
            raise QuestionBankGeneratorInputError("questions_per_point 必须大于 0")
        if max_points is not None and max_points <= 0:
            raise QuestionBankGeneratorInputError("max_points 必须大于 0")

        graph = self._load_subject_graph(subject_id)
        subject_name = graph.get("name", subject_id)
        nodes = graph.get("nodes", [])
        node_map = {node["id"]: node for node in nodes}

        if not node_map:
            raise QuestionBankGeneratorInputError(f"科目 '{subject_id}' 没有可用知识点")

        selected_ids = self._normalize_selected_kp_ids(knowledge_point_ids)
        if selected_ids:
            missing_ids = [kp_id for kp_id in selected_ids if kp_id not in node_map]
            if missing_ids:
                raise QuestionBankGeneratorInputError(
                    f"以下知识点不存在于科目 '{subject_id}' 中: {', '.join(missing_ids)}"
                )
            selected_nodes = [node_map[kp_id] for kp_id in selected_ids]
        else:
            selected_nodes = list(nodes)

        if max_points is not None:
            selected_nodes = selected_nodes[:max_points]

        questions: List[Dict[str, Any]] = []
        for node in selected_nodes:
            questions.extend(
                await self.generate_for_knowledge_point(
                    subject_id=subject_id,
                    subject_name=subject_name,
                    knowledge_point=node,
                    graph=graph,
                    questions_per_point=questions_per_point,
                )
            )

        return {
            "subject_id": subject_id,
            "subject_name": subject_name,
            "knowledge_points": [node["id"] for node in selected_nodes],
            "questions": questions,
        }

    async def generate_for_knowledge_point(
        self,
        subject_id: str,
        subject_name: str,
        knowledge_point: Dict[str, Any],
        graph: Dict[str, Any],
        questions_per_point: int = 3,
        max_attempts: int = 3,
    ) -> List[Dict[str, Any]]:
        kp_id = knowledge_point["id"]
        node_map = {node["id"]: node for node in graph.get("nodes", [])}
        prereq_ids = [
            edge["from"]
            for edge in graph.get("edges", [])
            if edge.get("to") == kp_id
        ]
        prereq_names = [node_map.get(prereq_id, {}).get("name", prereq_id) for prereq_id in prereq_ids]
        retry_hint = ""

        for _ in range(max_attempts):
            messages = self._build_messages(
                subject_id=subject_id,
                subject_name=subject_name,
                knowledge_point=knowledge_point,
                prereq_names=prereq_names,
                questions_per_point=questions_per_point,
                retry_hint=retry_hint,
            )
            raw_text = await self._call_llm(messages, questions_per_point)
            try:
                questions = self._parse_questions(
                    raw_text=raw_text,
                    expected_knowledge_point_id=kp_id,
                    expected_count=questions_per_point,
                )
                return questions[:questions_per_point]
            except QuestionBankGeneratorLLMError as exc:
                retry_hint = str(exc)

        raise QuestionBankGeneratorLLMError(
            f"知识点 '{kp_id}' 生成失败：多次重试后仍无法得到合法题目。最后错误：{retry_hint}"
        )

    def _load_subject_graph(self, subject_id: str) -> Dict[str, Any]:
        filepath = os.path.join(self.knowledge_data_dir, f"{subject_id}.json")
        if not os.path.exists(filepath):
            raise QuestionBankGeneratorInputError(
                f"找不到科目 '{subject_id}' 的知识图谱文件：{filepath}"
            )

        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def _build_messages(
        self,
        subject_id: str,
        subject_name: str,
        knowledge_point: Dict[str, Any],
        prereq_names: Sequence[str],
        questions_per_point: int,
        retry_hint: str = "",
    ) -> List[Dict[str, str]]:
        system_prompt = QUESTION_BANK_PROMPT or (
            "你是题库生成助手，只能输出合法 JSON 数组，每个元素都是单选题对象。"
        )
        prerequisite_text = "、".join(prereq_names) if prereq_names else "无"
        knowledge_snapshot = json.dumps(
            {
                "knowledge_point_id": knowledge_point.get("id"),
                "knowledge_point_name": knowledge_point.get("name"),
                "category": knowledge_point.get("category", ""),
                "chapter": knowledge_point.get("chapter"),
                "difficulty": knowledge_point.get("difficulty"),
                "description": knowledge_point.get("description", ""),
                "estimated_minutes": knowledge_point.get("estimated_minutes"),
                "prerequisites": list(prereq_names),
            },
            ensure_ascii=False,
            indent=2,
        )

        user_prompt = (
            f"请为科目“{subject_name}”（subject_id={subject_id}）的知识点"
            f"“{knowledge_point.get('name', knowledge_point.get('id'))}”"
            f"（knowledge_point_id={knowledge_point.get('id')}）生成 {questions_per_point} 道单选题。\n"
            f"前置知识点：{prerequisite_text}\n\n"
            "请严格只返回 JSON 数组，数组长度必须与要求数量一致。\n\n"
            f"知识点上下文：\n{knowledge_snapshot}"
        )

        if retry_hint:
            user_prompt += (
                "\n\n上一次输出存在问题，请修正后重新生成。"
                f"错误信息：{retry_hint}\n"
                "再次强调：不要输出任何解释性文字，只返回合法 JSON 数组。"
            )

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    async def _call_llm(self, messages: List[Dict[str, str]], questions_per_point: int) -> str:
        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": min(2200, max(800, questions_per_point * 350)),
        }

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()[:300] or exc.response.reason_phrase
            raise QuestionBankGeneratorLLMError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise QuestionBankGeneratorLLMError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise QuestionBankGeneratorLLMError(f"上游 LLM 响应格式异常: {str(exc)}") from exc

    def _parse_questions(
        self,
        raw_text: str,
        expected_knowledge_point_id: str,
        expected_count: int,
    ) -> List[Dict[str, Any]]:
        payload = self._extract_json_payload(raw_text)

        if isinstance(payload, dict):
            payload = payload.get("questions")

        if not isinstance(payload, list):
            raise QuestionBankGeneratorLLMError("模型输出不是 JSON 数组")
        if not payload:
            raise QuestionBankGeneratorLLMError("模型输出的题目数组为空")

        questions: List[Dict[str, Any]] = []
        seen_question_texts = set()

        for index, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                raise QuestionBankGeneratorLLMError(f"第 {index} 题不是对象")

            question_text = str(item.get("question_text", "")).strip()
            if not question_text:
                raise QuestionBankGeneratorLLMError(f"第 {index} 题缺少 question_text")

            normalized_text = re.sub(r"\s+", " ", question_text).strip().casefold()
            if normalized_text in seen_question_texts:
                continue
            seen_question_texts.add(normalized_text)

            options = self._normalize_options(item.get("options"), index)
            correct_answer = str(item.get("correct_answer", "")).strip().upper()[:1]
            if correct_answer not in {"A", "B", "C", "D"}:
                raise QuestionBankGeneratorLLMError(
                    f"第 {index} 题的 correct_answer 必须是 A/B/C/D"
                )

            difficulty = item.get("difficulty", 3)
            try:
                difficulty = int(difficulty)
            except (TypeError, ValueError) as exc:
                raise QuestionBankGeneratorLLMError(
                    f"第 {index} 题的 difficulty 不是整数"
                ) from exc
            difficulty = max(1, min(5, difficulty))

            explanation = str(item.get("explanation", "")).strip()

            questions.append(
                {
                    "knowledge_point_id": expected_knowledge_point_id,
                    "question_text": question_text,
                    "options": options,
                    "correct_answer": correct_answer,
                    "difficulty": difficulty,
                    "explanation": explanation,
                }
            )

        if len(questions) < expected_count:
            raise QuestionBankGeneratorLLMError(
                f"模型输出有效题目数量不足，期望 {expected_count} 道，实际 {len(questions)} 道"
            )

        return questions

    def _extract_json_payload(self, raw_text: str) -> Any:
        text = raw_text.strip()
        if not text:
            raise QuestionBankGeneratorLLMError("模型返回内容为空")

        candidates = [text]
        fenced_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
        if fenced_match:
            candidates.insert(0, fenced_match.group(1).strip())

        bracket_start = text.find("[")
        bracket_end = text.rfind("]")
        if bracket_start != -1 and bracket_end != -1 and bracket_end > bracket_start:
            candidates.append(text[bracket_start:bracket_end + 1].strip())

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

        raise QuestionBankGeneratorLLMError(
            f"模型输出无法解析为 JSON: {str(last_error)}"
        ) from last_error

    def _normalize_options(self, raw_options: Any, index: int) -> Dict[str, str]:
        if isinstance(raw_options, list):
            if len(raw_options) != 4:
                raise QuestionBankGeneratorLLMError(f"第 {index} 题的 options 必须包含 4 个选项")
            option_map = {
                label: str(value).strip()
                for label, value in zip(["A", "B", "C", "D"], raw_options)
            }
        elif isinstance(raw_options, dict):
            normalized_raw = {
                str(key).strip().upper(): str(value).strip()
                for key, value in raw_options.items()
            }
            option_map = {
                label: normalized_raw.get(label, "").strip()
                for label in ["A", "B", "C", "D"]
            }
        else:
            raise QuestionBankGeneratorLLMError(f"第 {index} 题的 options 格式不正确")

        if any(not option_map[label] for label in ["A", "B", "C", "D"]):
            raise QuestionBankGeneratorLLMError(
                f"第 {index} 题的 options 必须完整包含 A/B/C/D 四个非空选项"
            )
        return option_map

    def _normalize_selected_kp_ids(
        self,
        knowledge_point_ids: Optional[Sequence[str]],
    ) -> List[str]:
        if not knowledge_point_ids:
            return []

        normalized: List[str] = []
        seen = set()
        for kp_id in knowledge_point_ids:
            kp_id = str(kp_id).strip()
            if not kp_id or kp_id in seen:
                continue
            seen.add(kp_id)
            normalized.append(kp_id)
        return normalized
