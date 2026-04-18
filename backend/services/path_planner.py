"""学习路径规划器 —— 基于拓扑排序 + 薄弱度优先"""

from collections import deque
from typing import Dict, List, Tuple

from services.neo4j_service import neo4j_service


class PathPlanner:
    """
    根据薄弱知识点和前置关系，生成最优学习路径。

    策略：
    1. 从薄弱知识点出发，向上追溯所有未掌握的前置依赖
    2. 拓扑排序确保先学前置知识
    3. 同级别内按薄弱程度排序（越薄弱越优先）
    """

    def generate(
        self,
        weak_points: List[Tuple[str, float]],
        course: str,
        mastery_map: Dict[str, float] = None,
    ) -> List[Dict]:
        """
        生成学习路径

        Args:
            weak_points: [(kp_id, mastery), ...] 薄弱知识点列表
            course: 课程标识
            mastery_map: 所有知识点掌握度 {kp_id: mastery}

        Returns:
            有序学习路径 [{"id", "name", "mastery", "estimated_minutes", "status"}, ...]
        """
        if mastery_map is None:
            mastery_map = {kp_id: m for kp_id, m in weak_points}

        graph_data = neo4j_service.get_knowledge_graph(course)
        nodes_info = {n["id"]: n for n in graph_data.get("nodes", [])}
        all_nodes = [n["id"] for n in graph_data.get("nodes", [])]

        if not all_nodes:
            return []

        for kp in all_nodes:
            mastery_map.setdefault(kp, 0.3)

        # 构建邻接表和入度表
        prereqs: Dict[str, List[str]] = {}  # kp -> [前置kp]
        successors: Dict[str, List[str]] = {}  # kp -> [后继kp]
        for edge in graph_data.get("edges", []):
            prereqs.setdefault(edge["to"], []).append(edge["from"])
            successors.setdefault(edge["from"], []).append(edge["to"])

        # 记录学习重点（薄弱点 + 未掌握的前置依赖），用于排序与前端聚焦。
        weak_ids = {kp_id for kp_id, _ in weak_points}
        target_ids = set(weak_ids)

        # BFS 向上追溯未掌握的前置依赖
        queue = deque(weak_ids)
        while queue:
            kp = queue.popleft()
            for prereq in prereqs.get(kp, []):
                if prereq not in target_ids and mastery_map.get(prereq, 0.3) < 0.7:
                    target_ids.add(prereq)
                    queue.append(prereq)

        def prereqs_mastered(kp: str) -> bool:
            return all(mastery_map.get(prereq, 0.3) >= 0.7 for prereq in prereqs.get(kp, []))

        def build_status(kp: str, mastery: float) -> str:
            if mastery >= 0.7:
                return "completed"
            if prereqs_mastered(kp):
                return "in-progress"
            return "locked"

        def sort_key(kp: str):
            mastery = mastery_map.get(kp, 0.3)
            info = nodes_info.get(kp, {})
            status = build_status(kp, mastery)
            return (
                0 if (kp in target_ids and status != "completed") else 1,
                0 if status == "in-progress" else 1 if status == "locked" else 2,
                mastery,
                info.get("chapter") if info.get("chapter") is not None else 999,
                info.get("difficulty", 3),
                info.get("name", kp),
            )

        # Kahn 拓扑排序：对整门课程做完整路径排序，不再只返回薄弱点子集。
        in_degree = {kp: 0 for kp in all_nodes}
        for kp in all_nodes:
            for prereq in prereqs.get(kp, []):
                if prereq in in_degree:
                    in_degree[kp] += 1

        ready = sorted([kp for kp, deg in in_degree.items() if deg == 0], key=sort_key)
        ready = deque(ready)

        path = []
        while ready:
            kp = ready.popleft()
            mastery = mastery_map.get(kp, 0.3)
            info = nodes_info.get(kp, {})

            status = build_status(kp, mastery)

            path.append({
                "id": kp,
                "name": info.get("name", kp),
                "category": info.get("category", ""),
                "description": info.get("description", ""),
                "chapter": info.get("chapter"),
                "mastery": round(mastery, 3),
                "estimated_minutes": info.get("estimated_minutes", 30),
                "difficulty": info.get("difficulty", 3),
                "status": status,
                "recommended": kp in target_ids and status != "completed",
            })

            # 释放后继节点
            next_ready = []
            for succ in successors.get(kp, []):
                if succ in in_degree:
                    in_degree[succ] -= 1
                    if in_degree[succ] == 0:
                        next_ready.append(succ)

            next_ready.sort(key=sort_key)
            ready = deque(sorted([*ready, *next_ready], key=sort_key))

        return path


# 全局单例
path_planner = PathPlanner()
