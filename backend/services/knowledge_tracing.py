"""贝叶斯知识追踪 (BKT) —— 核心诊断算法

基于简化版 BKT 模型，追踪学生对每个知识点的掌握概率。
"""

from typing import Dict, List, Tuple


class SimpleKnowledgeTracing:
    """
    简化版贝叶斯知识追踪模型

    参数说明：
    - p_init:  初始掌握概率（先验）
    - p_learn: 每次练习后学会的转移概率
    - p_guess: 未掌握但猜对的概率
    - p_slip:  已掌握但做错的概率（手滑）
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

    def update(self, p_mastery: float, is_correct: bool) -> float:
        """
        学生做了一道题后，贝叶斯更新该知识点的掌握概率。

        Args:
            p_mastery: 当前掌握概率
            is_correct: 是否答对

        Returns:
            更新后的掌握概率
        """
        if is_correct:
            p_obs_given_mastery = 1 - self.p_slip
            p_obs_given_not = self.p_guess
        else:
            p_obs_given_mastery = self.p_slip
            p_obs_given_not = 1 - self.p_guess

        # 贝叶斯后验
        numerator = p_mastery * p_obs_given_mastery
        denominator = numerator + (1 - p_mastery) * p_obs_given_not

        if denominator == 0:
            p_posterior = p_mastery
        else:
            p_posterior = numerator / denominator

        # 学习转移：即使这次没掌握，练习本身也有学习效果
        p_mastery_new = p_posterior + (1 - p_posterior) * self.p_learn

        return min(p_mastery_new, 0.99)  # 上限 0.99，永远留一点不确定性

    def batch_update(self, p_mastery: float, responses: List[bool]) -> float:
        """批量更新：连续多道题"""
        for is_correct in responses:
            p_mastery = self.update(p_mastery, is_correct)
        return p_mastery

    def predict_correct(self, p_mastery: float) -> float:
        """预测学生答对下一题的概率"""
        return p_mastery * (1 - self.p_slip) + (1 - p_mastery) * self.p_guess

    def diagnose_weak_points(
        self,
        user_states: Dict[str, float],
        threshold: float = 0.6,
    ) -> List[Tuple[str, float]]:
        """
        诊断薄弱知识点

        Args:
            user_states: {knowledge_point_id: mastery_probability}
            threshold: 低于此阈值判定为薄弱

        Returns:
            薄弱知识点列表，按掌握度升序排列 [(kp_id, mastery), ...]
        """
        weak = [
            (kp_id, mastery)
            for kp_id, mastery in user_states.items()
            if mastery < threshold
        ]
        weak.sort(key=lambda x: x[1])  # 最薄弱的排前面
        return weak


# 全局单例
bkt = SimpleKnowledgeTracing()
