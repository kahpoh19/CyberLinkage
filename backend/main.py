"""CyberLinkage —— FastAPI 应用入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import engine, Base
<<<<<<< HEAD
from routers import auth, chat, diagnosis, graph, path, report
=======
from routers import auth, diagnosis, graph, path, report, profile
>>>>>>> 16d1217 (use remote App.jsx)

# 创建数据库表
Base.metadata.create_all(bind=engine)

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
