"""学习路径生成器 —— 独立算法模块"""

import json
import os
from collections import deque
from typing import Dict, List, Optional, Tuple

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


class PathGenerator:
    """
    基于知识图谱的学习路径生成器

    使用拓扑排序确保学习顺序满足前置依赖，
    同时按薄弱程度优先安排复习。
    """

    def __init__(self, course: str = "c_language"):
        self.course = course
        self.graph = self._load_graph()

    def _load_graph(self) -> Dict:
        filepath = os.path.join(DATA_DIR, f"{self.course}.json")
        if not os.path.exists(filepath):
            return {"nodes": [], "edges": []}
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def generate(
        self,
        weak_points: List[Tuple[str, float]],
        mastery_map: Optional[Dict[str, float]] = None,
    ) -> List[Dict]:
        """
        生成学习路径

        Args:
            weak_points: [(kp_id, mastery)] 薄弱知识点列表
            mastery_map: 所有知识点掌握度映射

        Returns:
            有序学习路径
        """
        if mastery_map is None:
            mastery_map = {kp: m for kp, m in weak_points}

        nodes_info = {n["id"]: n for n in self.graph.get("nodes", [])}
        all_nodes = [n["id"] for n in self.graph.get("nodes", [])]

        if not all_nodes:
            return []

        for kp in all_nodes:
            mastery_map.setdefault(kp, 0.3)

        # 构建前置关系
        prereqs: Dict[str, List[str]] = {}
        successors: Dict[str, List[str]] = {}
        for edge in self.graph.get("edges", []):
            prereqs.setdefault(edge["to"], []).append(edge["from"])
            successors.setdefault(edge["from"], []).append(edge["to"])

        # 扩展：纳入未掌握的前置依赖，形成推荐学习子集。
        weak_ids = {kp for kp, _ in weak_points}
        target_ids = set(weak_ids)

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

        # 对整门课程做完整拓扑排序，推荐项优先但不删除已掌握节点。
        in_degree = {kp: 0 for kp in all_nodes}
        for kp in all_nodes:
            for prereq in prereqs.get(kp, []):
                if prereq in in_degree:
                    in_degree[kp] += 1

        ready = deque(sorted([kp for kp, d in in_degree.items() if d == 0], key=sort_key))

        path = []

        while ready:
            kp = ready.popleft()
            info = nodes_info.get(kp, {})
            mastery = mastery_map.get(kp, 0.3)
            est_min = info.get("estimated_minutes", 30)

            path.append({
                "id": kp,
                "name": info.get("name", kp),
                "category": info.get("category", ""),
                "mastery": round(mastery, 3),
                "estimated_minutes": est_min,
                "difficulty": info.get("difficulty", 3),
                "status": build_status(kp, mastery),
                "recommended": kp in target_ids and mastery < 0.7,
            })

            # 释放后继
            next_ready = []
            for succ in successors.get(kp, []):
                if succ in in_degree:
                    in_degree[succ] -= 1
                    if in_degree[succ] == 0:
                        next_ready.append(succ)
            next_ready.sort(key=sort_key)
            ready = deque(sorted([*ready, *next_ready], key=sort_key))

        return path

    def get_estimated_time(self, path: List[Dict]) -> int:
        """计算路径总预计时间（分钟）"""
        return sum(item.get("estimated_minutes", 30) for item in path)


# ─── 演示 ─────────────────────────────────────────

if __name__ == "__main__":
    gen = PathGenerator("c_language")

    # 模拟：指针和循环相关知识点薄弱
    weak = [
        ("ptr_basic", 0.2),
        ("for_loop", 0.35),
        ("ptr_array", 0.15),
    ]

    mastery = {
        "intro": 0.9, "data_type": 0.85, "var": 0.8,
        "io": 0.75, "operator": 0.7, "if_else": 0.65,
        "for_loop": 0.35, "while_loop": 0.5,
        "array_1d": 0.4, "func_def": 0.55,
        "func_param": 0.45, "ptr_basic": 0.2,
        "ptr_array": 0.15,
    }

    path = gen.generate(weak, mastery)

    print("=== 学习路径 ===\n")
    for i, item in enumerate(path, 1):
        print(f"{i}. {item['name']} (掌握度: {item['mastery']:.0%}, 预计: {item['estimated_minutes']}分钟)")

    print(f"\n总预计时间: {gen.get_estimated_time(path)} 分钟")
