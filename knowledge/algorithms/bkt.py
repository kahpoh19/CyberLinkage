"""贝叶斯知识追踪 (BKT) —— 完整实现

独立算法模块，可用于离线分析和参数调优。
后端 services/knowledge_tracing.py 是其精简版。
"""

from typing import Dict, List, Tuple


class BKTModel:
    """
    贝叶斯知识追踪模型

    每个知识点维护一个掌握概率 P(mastery)，根据学生做题
    结果进行贝叶斯更新。

    参数:
        p_init:  初始掌握概率
        p_learn: 学习转移概率（每次练习后从未掌握变为掌握的概率）
        p_guess: 猜对概率（未掌握但答对）
        p_slip:  手滑概率（已掌握但答错）
    """

    def __init__(
        self,
        p_init: float = 0.3,
        p_learn: float = 0.1,
        p_guess: float = 0.25,
        p_slip: float = 0.1,
    ):
        self.p_init = p_init
        self.p_learn = p_learn
        self.p_guess = p_guess
        self.p_slip = p_slip

    def update(self, mastery: float, is_correct: bool) -> float:
        """
        根据一道题的答题结果，贝叶斯更新掌握概率

        Args:
            mastery: 当前掌握概率
            is_correct: 是否答对

        Returns:
            更新后的掌握概率
        """
        if is_correct:
            p_obs_mastered = 1 - self.p_slip
            p_obs_not_mastered = self.p_guess
        else:
            p_obs_mastered = self.p_slip
            p_obs_not_mastered = 1 - self.p_guess

        # 贝叶斯后验
        numerator = mastery * p_obs_mastered
        denominator = numerator + (1 - mastery) * p_obs_not_mastered

        if denominator == 0:
            posterior = mastery
        else:
            posterior = numerator / denominator

        # 学习效应
        updated = posterior + (1 - posterior) * self.p_learn
        return min(updated, 0.99)

    def batch_update(self, mastery: float, responses: List[bool]) -> float:
        """批量更新"""
        for is_correct in responses:
            mastery = self.update(mastery, is_correct)
        return mastery

    def predict_correct(self, mastery: float) -> float:
        """预测答对下一题的概率"""
        return mastery * (1 - self.p_slip) + (1 - mastery) * self.p_guess

    def diagnose(
        self,
        mastery_dict: Dict[str, float],
        threshold: float = 0.6,
    ) -> List[Tuple[str, float]]:
        """
        诊断薄弱知识点

        Args:
            mastery_dict: {kp_id: mastery_probability}
            threshold: 薄弱阈值

        Returns:
            薄弱知识点列表（按掌握度升序）
        """
        weak = [
            (kp, m) for kp, m in mastery_dict.items() if m < threshold
        ]
        return sorted(weak, key=lambda x: x[1])

    def recommend_exercises(
        self,
        weak_points: List[Tuple[str, float]],
        graph_edges: List[Dict],
    ) -> List[str]:
        """
        推荐练习的知识点顺序

        策略：优先练前置依赖中最薄弱的，再练目标知识点

        Args:
            weak_points: [(kp_id, mastery)]
            graph_edges: [{"from": ..., "to": ...}]

        Returns:
            推荐练习的知识点ID有序列表
        """
        # 建立前置关系映射
        prereqs: Dict[str, List[str]] = {}
        for edge in graph_edges:
            prereqs.setdefault(edge["to"], []).append(edge["from"])

        # 收集所有需要练习的知识点（包括前置）
        weak_set = {kp for kp, _ in weak_points}
        to_practice = set(weak_set)

        for kp, _ in weak_points:
            for prereq in prereqs.get(kp, []):
                to_practice.add(prereq)

        # 按薄弱度排序
        weak_dict = dict(weak_points)
        result = sorted(to_practice, key=lambda k: weak_dict.get(k, 0.5))
        return result


# ─── 演示 ─────────────────────────────────────────

if __name__ == "__main__":
    model = BKTModel()

    print("=== BKT 模型演示 ===\n")

    # 模拟学生做5道题：对 错 对 对 错
    mastery = model.p_init
    responses = [True, False, True, True, False]

    print(f"初始掌握概率: {mastery:.4f}")
    for i, correct in enumerate(responses):
        mastery = model.update(mastery, correct)
        symbol = "✅" if correct else "❌"
        print(f"  第{i+1}题 {symbol} → 掌握概率: {mastery:.4f}")

    print(f"\n最终掌握概率: {mastery:.4f}")
    print(f"预测下题答对概率: {model.predict_correct(mastery):.4f}")
