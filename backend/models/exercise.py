"""练习题模型"""

from sqlalchemy import Column, Integer, String, Text, JSON

from database import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    course = Column(String(50), nullable=False, index=True)
    knowledge_point_id = Column(String(50), nullable=False, index=True)
    question_type = Column(String(20), nullable=False, default="single_choice")
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_answer = Column(String(1), nullable=False)  # 单选题使用 A-D，判断题使用 A/B
    difficulty = Column(Integer, default=3)  # 1-5
    explanation = Column(Text, nullable=True)  # 答案解析
