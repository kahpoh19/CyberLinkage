"""应用配置 —— 从环境变量读取，提供合理的开发默认值"""

import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
ENV_FILE = os.path.join(PROJECT_ROOT, ".env")


def _load_env_file(path: str):
    try:
        from dotenv import load_dotenv
    except ImportError:
        if not os.path.exists(path):
            return

        with open(path, encoding="utf-8") as env_file:
            for line in env_file:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue

                key, value = stripped.split("=", 1)
                key = key.strip()
                value = value.strip().strip("'\"")
                if key:
                    os.environ.setdefault(key, value)
        return

    load_dotenv(path)


_load_env_file(ENV_FILE)


class Settings:
    # 数据库
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./cyberlinkage.db")

    # Neo4j 图数据库
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "cyberlinkage2026")

    # JWT 认证
    JWT_SECRET: str = os.getenv("JWT_SECRET", "cyberlinkage-dev-secret-key")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24小时

    # LLM 服务
    LLM_API_BASE: str = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    LLM_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL: str = os.getenv("OPENAI_MODEL", os.getenv("LLM_MODEL", "")).strip()

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # 知识图谱 JSON 后备路径
    KNOWLEDGE_DATA_DIR: str = os.getenv(
        "KNOWLEDGE_DATA_DIR",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge", "data"),
    )


settings = Settings()
