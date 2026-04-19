"""CyberLinkage —— FastAPI 应用入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from database import engine, Base
from routers import auth, chat, diagnosis, graph, path, profile, question_bank, report, subjects

# 创建数据库表
Base.metadata.create_all(bind=engine)


def ensure_user_profile_columns():
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as conn:
        if "avatar" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar VARCHAR(255)"))
            columns.add("avatar")

        if "display_name" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(50)"))
            columns.add("display_name")

        if "font_size" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN font_size INTEGER DEFAULT 14"))
            columns.add("font_size")

        if "font_family" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN font_family VARCHAR(20) DEFAULT 'default'"))
            columns.add("font_family")

        if "theme" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN theme VARCHAR(10) DEFAULT 'light'"))
            columns.add("theme")

        conn.execute(text("UPDATE users SET font_size = 14 WHERE font_size IS NULL"))
        conn.execute(text("UPDATE users SET font_family = 'default' WHERE font_family IS NULL"))
        conn.execute(text("UPDATE users SET theme = 'light' WHERE theme IS NULL"))


def ensure_learning_columns():
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    with engine.begin() as conn:
        if "exercises" in tables:
            columns = {col["name"] for col in inspector.get_columns("exercises")}
            if "course" not in columns:
                conn.execute(text("ALTER TABLE exercises ADD COLUMN course VARCHAR(50)"))
                conn.execute(text("UPDATE exercises SET course = 'c_language' WHERE course IS NULL"))

        if "practice_records" in tables:
            columns = {col["name"] for col in inspector.get_columns("practice_records")}
            if "course" not in columns:
                conn.execute(text("ALTER TABLE practice_records ADD COLUMN course VARCHAR(50)"))
                conn.execute(text("UPDATE practice_records SET course = 'c_language' WHERE course IS NULL"))

        if "knowledge_states" in tables:
            columns = {col["name"] for col in inspector.get_columns("knowledge_states")}
            if "course" not in columns:
                conn.execute(text("ALTER TABLE knowledge_states ADD COLUMN course VARCHAR(50)"))
                conn.execute(text("UPDATE knowledge_states SET course = 'c_language' WHERE course IS NULL"))


ensure_user_profile_columns()
ensure_learning_columns()

app = FastAPI(
    title="CyberLinkage API",
    description="基于知识图谱的个性化学习伴侣",
    version="0.1.0",
)

# CORS（开发环境允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(diagnosis.router)
app.include_router(graph.router)
app.include_router(path.router)
app.include_router(report.router)
app.include_router(profile.router)
app.include_router(subjects.router)
app.include_router(question_bank.router)

app.mount("/uploads", StaticFiles(directory=profile.UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {
        "name": "CyberLinkage",
        "version": "0.1.0",
        "description": "基于知识图谱的个性化学习伴侣",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
