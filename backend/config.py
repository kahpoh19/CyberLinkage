"""应用配置 —— 从环境变量读取，提供合理的开发默认值"""

import os


class Settings:
    # 数据库
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./zhipath.db")

    # Neo4j 图数据库
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "zhipath2026")

    # JWT 认证
    JWT_SECRET: str = os.getenv("JWT_SECRET", "zhipath-dev-secret-key")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24小时

    # LLM 服务
    LLM_API_BASE: str = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    LLM_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # 知识图谱 JSON 后备路径
    KNOWLEDGE_DATA_DIR: str = os.getenv(
        "KNOWLEDGE_DATA_DIR",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge", "data"),
    )


settings = Settings()
