"""AI 知识图谱生成器。"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


GRAPH_GENERATOR_PROMPT = _load_prompt("graph_generator.txt")


class GraphGeneratorError(Exception):
    """知识图谱生成失败。"""


class GraphGeneratorInputError(GraphGeneratorError):
    """知识图谱生成输入不合法。"""


class GraphGeneratorLLMError(GraphGeneratorError):
    """上游 LLM 调用或输出格式异常。"""


class GraphGenerator:
    """根据课程大纲生成结构化知识图谱。"""

    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_base = api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.model = (model or os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "").strip()

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY 未配置")
        if not self.model:
            raise ValueError("OPENAI_MODEL 未配置")

    async def generate_graph(
        self,
        subject_id: str,
        subject_name: str,
        source_text: str,
        expected_node_count: int = 15,
        max_attempts: int = 3,
    ) -> Dict[str, Any]:
        normalized_subject_id = self._normalize_subject_id(subject_id)
        normalized_source = str(source_text or "").strip()
        normalized_name = str(subject_name or normalized_subject_id).strip()

        if len(normalized_source) < 20:
            raise GraphGeneratorInputError("课程大纲或课程说明至少需要 20 个字符")
        if expected_node_count < 5:
            raise GraphGeneratorInputError("expected_node_count 不能小于 5")

        retry_hint = ""
        for _ in range(max_attempts):
            messages = self._build_messages(
                subject_id=normalized_subject_id,
                subject_name=normalized_name,
                source_text=normalized_source,
                expected_node_count=expected_node_count,
                retry_hint=retry_hint,
            )
            raw_text = await self._call_llm(messages, expected_node_count)
            try:
                return self._parse_graph(
                    raw_text=raw_text,
                    subject_id=normalized_subject_id,
                    subject_name=normalized_name,
                )
            except GraphGeneratorLLMError as exc:
                retry_hint = str(exc)

        raise GraphGeneratorLLMError(
            "多次重试后仍无法得到合法知识图谱。"
            f"最后错误：{retry_hint or '未知错误'}"
        )

    def _build_messages(
        self,
        subject_id: str,
        subject_name: str,
        source_text: str,
        expected_node_count: int,
        retry_hint: str = "",
    ) -> List[Dict[str, str]]:
        system_prompt = GRAPH_GENERATOR_PROMPT or (
            "你是课程知识图谱生成助手，只能输出合法 JSON。"
        )

        user_prompt = (
            f"请为科目“{subject_name}”（subject_id={subject_id}）生成一份知识图谱。\n"
            f"目标知识点数量大约为 {expected_node_count} 个。\n"
            "请按课程逻辑梳理章节、核心概念和前置依赖关系。\n\n"
            f"课程材料如下：\n{source_text}"
        )

        if retry_hint:
            user_prompt += (
                "\n\n上一次输出存在问题，请修正后重新生成。"
                f"\n错误信息：{retry_hint}"
                "\n再次强调：只能输出合法 JSON 对象。"
            )

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    async def _call_llm(self, messages: List[Dict[str, str]], expected_node_count: int) -> str:
        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": min(3200, max(1400, expected_node_count * 180)),
        }

        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()[:300] or exc.response.reason_phrase
            raise GraphGeneratorLLMError(
                f"上游 LLM 返回 {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.RequestError as exc:
            raise GraphGeneratorLLMError(f"无法连接到上游 LLM: {str(exc)}") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise GraphGeneratorLLMError(f"上游 LLM 响应格式异常: {str(exc)}") from exc

    def _parse_graph(
        self,
        raw_text: str,
        subject_id: str,
        subject_name: str,
    ) -> Dict[str, Any]:
        payload = self._extract_json_payload(raw_text)
        if not isinstance(payload, dict):
            raise GraphGeneratorLLMError("模型输出不是 JSON 对象")

        raw_nodes = payload.get("nodes")
        raw_edges = payload.get("edges")

        if not isinstance(raw_nodes, list) or len(raw_nodes) < 3:
            raise GraphGeneratorLLMError("模型输出的 nodes 数量过少或格式错误")
        if not isinstance(raw_edges, list):
            raise GraphGeneratorLLMError("模型输出的 edges 格式错误")

        nodes, lookup_map = self._normalize_nodes(raw_nodes)
        edges, warnings = self._normalize_edges(raw_edges, nodes, lookup_map)
        sorted_nodes = sorted(
            nodes,
            key=lambda node: (
                node.get("chapter", 0),
                node.get("difficulty", 0),
                node.get("name", ""),
            ),
        )

        if not edges and len(sorted_nodes) > 1:
            edges = [
                {
                    "from": prev["id"],
                    "to": curr["id"],
                    "relation": "prerequisite",
                }
                for prev, curr in zip(sorted_nodes, sorted_nodes[1:])
            ]
            warnings.append("模型未提供有效依赖关系，已按章节顺序补全默认学习路径。")

        return {
            "graph": {
                "course": subject_id,
                "name": str(payload.get("name") or subject_name).strip() or subject_name,
                "nodes": sorted_nodes,
                "edges": edges,
            },
            "warnings": warnings,
        }

    def _normalize_nodes(self, raw_nodes: List[Any]) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
        nodes: List[Dict[str, Any]] = []
        used_ids = set()
        lookup_map: Dict[str, str] = {}

        for index, item in enumerate(raw_nodes, start=1):
            if not isinstance(item, dict):
                raise GraphGeneratorLLMError(f"第 {index} 个节点不是对象")

            raw_id = str(item.get("id", "")).strip()
            raw_name = str(item.get("name", "")).strip()
            if not raw_name:
                raise GraphGeneratorLLMError(f"第 {index} 个节点缺少 name")

            base_id = self._slugify(raw_id or raw_name) or f"kp_{index}"
            node_id = self._dedupe_id(base_id, used_ids)

            category = str(item.get("category", "")).strip()
            description = str(item.get("description", "")).strip()

            difficulty = self._coerce_int(item.get("difficulty", 3), fallback=3)
            difficulty = max(1, min(5, difficulty))

            chapter = self._coerce_int(item.get("chapter", 1), fallback=1)
            chapter = max(1, chapter)

            estimated_minutes = self._coerce_int(item.get("estimated_minutes", 30), fallback=30)
            estimated_minutes = max(10, min(180, estimated_minutes))

            node = {
                "id": node_id,
                "name": raw_name,
                "category": category,
                "difficulty": difficulty,
                "chapter": chapter,
                "description": description,
                "estimated_minutes": estimated_minutes,
            }
            nodes.append(node)

            for candidate in (raw_id, raw_name, node_id, self._slugify(raw_name)):
                normalized = self._normalize_lookup_key(candidate)
                if normalized:
                    lookup_map[normalized] = node_id

        return nodes, lookup_map

    def _normalize_edges(
        self,
        raw_edges: List[Any],
        nodes: List[Dict[str, Any]],
        lookup_map: Dict[str, str],
    ) -> Tuple[List[Dict[str, str]], List[str]]:
        node_ids = {node["id"] for node in nodes}
        adjacency = {node_id: set() for node_id in node_ids}
        edges: List[Dict[str, str]] = []
        seen = set()
        invalid_count = 0
        cycle_count = 0

        for index, item in enumerate(raw_edges, start=1):
            if not isinstance(item, dict):
                invalid_count += 1
                continue

            raw_source = item.get("from", item.get("source"))
            raw_target = item.get("to", item.get("target"))
            source = self._resolve_node_id(raw_source, lookup_map)
            target = self._resolve_node_id(raw_target, lookup_map)

            if not source or not target or source not in node_ids or target not in node_ids:
                invalid_count += 1
                continue
            if source == target:
                invalid_count += 1
                continue

            edge_key = (source, target)
            if edge_key in seen:
                continue

            if self._would_create_cycle(adjacency, source, target):
                cycle_count += 1
                continue

            seen.add(edge_key)
            adjacency[source].add(target)
            edges.append(
                {
                    "from": source,
                    "to": target,
                    "relation": "prerequisite",
                }
            )

        warnings: List[str] = []
        if invalid_count:
            warnings.append(f"已忽略 {invalid_count} 条无效依赖关系。")
        if cycle_count:
            warnings.append(f"已剔除 {cycle_count} 条会导致循环依赖的关系。")

        return edges, warnings

    def _extract_json_payload(self, raw_text: str) -> Any:
        text = raw_text.strip()
        if not text:
            raise GraphGeneratorLLMError("模型返回内容为空")

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

        raise GraphGeneratorLLMError(
            f"模型输出无法解析为 JSON: {str(last_error)}"
        ) from last_error

    def _resolve_node_id(self, value: Any, lookup_map: Dict[str, str]) -> str:
        key = self._normalize_lookup_key(value)
        if not key:
            return ""
        return lookup_map.get(key, "")

    def _would_create_cycle(self, adjacency: Dict[str, set], source: str, target: str) -> bool:
        stack = [target]
        visited = set()

        while stack:
            current = stack.pop()
            if current == source:
                return True
            if current in visited:
                continue
            visited.add(current)
            stack.extend(adjacency.get(current, ()))
        return False

    def _normalize_subject_id(self, subject_id: str) -> str:
        normalized = self._slugify(subject_id)
        if not normalized:
            raise GraphGeneratorInputError("subject_id 不合法")
        return normalized

    def _slugify(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        text = re.sub(r"[^a-z0-9]+", "_", text)
        text = re.sub(r"_+", "_", text).strip("_")
        return text

    def _normalize_lookup_key(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text)
        slug = self._slugify(text)
        return slug or text

    def _dedupe_id(self, base_id: str, used_ids: set) -> str:
        candidate = base_id
        suffix = 2
        while candidate in used_ids:
            candidate = f"{base_id}_{suffix}"
            suffix += 1
        used_ids.add(candidate)
        return candidate

    def _coerce_int(self, value: Any, fallback: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback
