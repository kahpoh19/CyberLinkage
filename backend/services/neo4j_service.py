"""Neo4j 知识图谱服务 —— 封装图数据库操作，支持 JSON 文件后备"""

import json
import os
from typing import Dict, List, Optional

from config import settings


class Neo4jService:
    """知识图谱数据访问层，优先使用 Neo4j，不可用时回退到 JSON 文件"""

    def __init__(self):
        self._driver = None
        self._try_connect()

    def _try_connect(self):
        """尝试连接 Neo4j，失败则使用 JSON 后备"""
        try:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )
            # 验证连接
            self._driver.verify_connectivity()
        except Exception:
            self._driver = None

    @property
    def available(self) -> bool:
        return self._driver is not None

    def close(self):
        if self._driver:
            self._driver.close()

    # ─── 知识图谱查询 ───────────────────────────────────────

    def get_knowledge_graph(self, course: str) -> Dict:
        """获取完整知识图谱（节点 + 边）"""
        if self.available:
            data = self._get_graph_from_neo4j(course)
            if data.get("nodes"):
                return data
        return self._get_graph_from_json(course)

    def get_prerequisites(self, kp_id: str) -> List[str]:
        """获取某知识点的所有前置知识点"""
        if self.available:
            prereqs = self._get_prereqs_from_neo4j(kp_id)
            if prereqs:
                return prereqs
        return self._get_prereqs_from_json(kp_id)

    def get_all_prerequisites(self, course: str) -> Dict[str, List[str]]:
        """获取课程中所有知识点的前置关系映射"""
        graph = self.get_knowledge_graph(course)
        prereqs: Dict[str, List[str]] = {}
        for edge in graph.get("edges", []):
            target = edge["to"]
            source = edge["from"]
            prereqs.setdefault(target, []).append(source)
        return prereqs

    def save_knowledge_graph(self, course: str, data: Dict) -> List[str]:
        """保存知识图谱到 JSON，并在可用时同步写入 Neo4j。"""
        normalized = {
            "course": course,
            "name": data.get("name", course),
            "nodes": data.get("nodes", []),
            "edges": data.get("edges", []),
        }
        self._save_graph_to_json(course, normalized)

        warnings: List[str] = []
        if self.available:
            try:
                self._save_graph_to_neo4j(course, normalized)
            except Exception as exc:
                self._driver = None
                warnings.append(f"Neo4j 同步失败，已保留 JSON 后备：{str(exc)}")

        return warnings

    # ─── Neo4j 实现 ─────────────────────────────────────────

    def _get_graph_from_neo4j(self, course: str) -> Dict:
        with self._driver.session() as session:
            # 查询节点
            nodes_result = session.run(
                "MATCH (n:KnowledgePoint {course: $course}) "
                "RETURN n.id AS id, n.name AS name, n.category AS category, "
                "n.difficulty AS difficulty, n.chapter AS chapter, "
                "n.description AS description, n.estimated_minutes AS estimated_minutes",
                course=course,
            )
            nodes = [dict(record) for record in nodes_result]

            # 查询边
            edges_result = session.run(
                "MATCH (a:KnowledgePoint {course: $course})"
                "-[r:PREREQUISITE]->"
                "(b:KnowledgePoint {course: $course}) "
                "RETURN a.id AS `from`, b.id AS `to`, type(r) AS relation",
                course=course,
            )
            edges = [dict(record) for record in edges_result]

        return {"course": course, "nodes": nodes, "edges": edges}

    def _get_prereqs_from_neo4j(self, kp_id: str) -> List[str]:
        with self._driver.session() as session:
            result = session.run(
                "MATCH (a:KnowledgePoint)-[:PREREQUISITE]->(b:KnowledgePoint {id: $id}) "
                "RETURN a.id AS id",
                id=kp_id,
            )
            return [record["id"] for record in result]

    # ─── JSON 后备实现 ──────────────────────────────────────

    def _load_json(self, course: str) -> Optional[Dict]:
        filepath = os.path.join(settings.KNOWLEDGE_DATA_DIR, f"{course}.json")
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def _get_graph_from_json(self, course: str) -> Dict:
        data = self._load_json(course)
        if data is None:
            return {"course": course, "nodes": [], "edges": []}
        return data

    def _get_prereqs_from_json(self, kp_id: str) -> List[str]:
        # 遍历所有课程文件查找
        data_dir = settings.KNOWLEDGE_DATA_DIR
        if not os.path.isdir(data_dir):
            return []
        for filename in os.listdir(data_dir):
            if not filename.endswith(".json"):
                continue
            filepath = os.path.join(data_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            for edge in data.get("edges", []):
                if edge["to"] == kp_id:
                    return [
                        e["from"]
                        for e in data["edges"]
                        if e["to"] == kp_id
                    ]
        return []

    def _save_graph_to_json(self, course: str, data: Dict):
        os.makedirs(settings.KNOWLEDGE_DATA_DIR, exist_ok=True)
        filepath = os.path.join(settings.KNOWLEDGE_DATA_DIR, f"{course}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _save_graph_to_neo4j(self, course: str, data: Dict):
        with self._driver.session() as session:
            session.run(
                "MATCH (n:KnowledgePoint {course: $course}) DETACH DELETE n",
                course=course,
            )

            for node in data.get("nodes", []):
                session.run(
                    """
                    CREATE (n:KnowledgePoint {
                        id: $id,
                        name: $name,
                        course: $course,
                        category: $category,
                        difficulty: $difficulty,
                        chapter: $chapter,
                        description: $description,
                        estimated_minutes: $estimated_minutes
                    })
                    """,
                    id=node["id"],
                    name=node.get("name", node["id"]),
                    course=course,
                    category=node.get("category", ""),
                    difficulty=node.get("difficulty", 3),
                    chapter=node.get("chapter", 0),
                    description=node.get("description", ""),
                    estimated_minutes=node.get("estimated_minutes", 30),
                )

            for edge in data.get("edges", []):
                session.run(
                    """
                    MATCH (a:KnowledgePoint {id: $from_id, course: $course})
                    MATCH (b:KnowledgePoint {id: $to_id, course: $course})
                    CREATE (a)-[:PREREQUISITE]->(b)
                    """,
                    from_id=edge["from"],
                    to_id=edge["to"],
                    course=course,
                )

            session.run(
                "CREATE INDEX IF NOT EXISTS FOR (n:KnowledgePoint) ON (n.id, n.course)"
            )


# 全局单例
neo4j_service = Neo4jService()
