"""科目数据模型"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime

from database import Base


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(String(50), unique=True, index=True, nullable=False)  # 如 'mechanics'
    label = Column(String(100), nullable=False)                                # 如 '机械原理'
    builtin = Column(Boolean, default=False, nullable=False)                   # 内置科目不可删
    created_at = Column(DateTime, default=datetime.utcnow)