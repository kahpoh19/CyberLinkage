# 🧠 CyberLinkage —— 基于知识图谱的个性化学习伴侣

> 北航冯如杯参赛作品 | 智能学伴方向

## 📖 项目简介

**CyberLinkage** 是一个面向大学生的智能学习伴侣系统，通过知识图谱、自适应诊断和AI辅导，为每位学生量身定制学习路径。

当前大学生在学习中面临三大痛点：
- 🔴 **难以自我诊断** —— 不知道自己哪里薄弱
- 🟡 **学习路径模糊** —— 不知道先学什么后学什么
- 🟢 **缺乏个性化指导** —— 一刀切的教学模式

CyberLinkage 通过 **诊断 → 可视化 → 规划 → 辅导 → 复测** 的完整闭环，解决这些问题。

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 📊 知识图谱可视化 | 力导向图展示知识点关联，红绿灯显示掌握程度 |
| 🩺 智能诊断测评 | 基于BKT算法的自适应知识追踪 |
| 🛤️ 个性化学习路径 | 拓扑排序 + 薄弱度优先的推荐路径 |
| 🤖 AI苏格拉底式答疑 | LLM + RAG，引导式提问而非直接给答案 |
| 📈 学习报告 | 掌握度变化曲线、学习统计 |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│              前端展示层                           │
│        React + Ant Design + ECharts              │
├─────────────────────────────────────────────────┤
│              API 网关层                           │
│            FastAPI (Python)                       │
├──────────┬──────────┬──────────┬────────────────┤
│ 知识图谱  │ 学生画像  │ 推荐引擎  │   LLM 服务    │
│ (Neo4j)  │(行为日志) │(路径规划) │ (RAG + Agent) │
├──────────┴──────────┴──────────┴────────────────┤
│         数据层 (SQLite/MySQL + FAISS)            │
└─────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 前置要求

- Python 3.11
- Node.js 18+
- Docker / Docker Compose（用于一键启动，或手动启动 Neo4j/Redis）

### 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`，填入 `OPENAI_API_KEY`、`OPENAI_API_BASE` 和 `OPENAI_MODEL`。

### Docker 一键启动

```bash
docker compose up -d --build
```

### 手动启动

**1. 启动依赖服务：**

```bash
docker compose up -d neo4j redis
```

**2. 安装后端与 AI 依赖：**

```bash
pip install -r backend/requirements.txt
pip install -r ai/requirements.txt
```

**3. 初始化题库数据：**

先创建 SQLite 数据表：

```bash
cd backend
python -c "import main"
```

然后导入题库：

```bash
python knowledge/scripts/import_exercises.py
```

如果已有题库并询问是否清空重导，按需输入 `y` 或直接回车取消。

**4. 导入知识图谱到 Neo4j（可选）：**

后端在 Neo4j 不可用时会自动读取 `knowledge/data` 下的 JSON 文件；如果要使用 Neo4j 数据库，运行：

```bash
python ../knowledge/scripts/import_to_neo4j.py --course c_language
```

**5. 启动后端：**

另开一个终端，从项目根目录运行：

```bash
cd backend
uvicorn main:app --reload --port 8000
```

**6. 启动前端：**

另开一个终端，从项目根目录运行：

```bash
cd frontend
npm install
npm run dev
```

访问：

```bash
http://localhost:3000
```

## 📁 项目结构

```
CyberLinkage/
├── frontend/          # React 前端
├── backend/           # FastAPI 后端
├── ai/                # AI/LLM 模块（RAG + Agent）
├── knowledge/         # 知识图谱数据 + 算法
├── docs/              # 文档 + 答辩材料
└── docker-compose.yml # 容器编排
```

## 🛠️ 技术栈

- **前端**: React 18 + Vite + Ant Design + ECharts
- **后端**: Python 3.11 + FastAPI + SQLAlchemy
- **AI**: LangChain + FAISS + OpenAI API
- **图数据库**: Neo4j 5
- **数据库**: SQLite (开发) / MySQL (生产)

## 👥 团队

> _（待填写）_

## 📄 许可证

MIT License
