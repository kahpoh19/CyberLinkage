"""CyberLinkage —— FastAPI 应用入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from database import engine, Base
<<<<<<< HEAD
from routers import auth, chat, diagnosis, graph, path, report
=======
from routers import auth, diagnosis, graph, path, report, profile
>>>>>>> 16d1217 (use remote App.jsx)

# 创建数据库表
Base.metadata.create_all(bind=engine)


def ensure_user_profile_columns():
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as conn:
        if "theme" not in columns:
          conn.execute(text("ALTER TABLE users ADD COLUMN theme VARCHAR(10) DEFAULT 'light'"))
          columns.add("theme")

        if "font_size" in columns:
            conn.execute(text("UPDATE users SET font_size = 14 WHERE font_size IS NULL"))

        if "font_family" in columns:
            conn.execute(text("UPDATE users SET font_family = 'default' WHERE font_family IS NULL"))

        if "theme" in columns:
            conn.execute(text("UPDATE users SET theme = 'light' WHERE theme IS NULL"))


ensure_user_profile_columns()

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

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


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