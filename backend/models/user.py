"""用户模型 & 知识掌握状态模型"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    knowledge_states = relationship("KnowledgeState", back_populates="user")
    practice_records = relationship("PracticeRecord", back_populates="user")


class KnowledgeState(Base):
    """用户对每个知识点的掌握状态（BKT 追踪）"""
    __tablename__ = "knowledge_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    knowledge_point_id = Column(String(50), nullable=False, index=True)
    mastery_probability = Column(Float, default=0.3)  # P(mastery), BKT 初始值
    attempt_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    last_practiced = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="knowledge_states")
