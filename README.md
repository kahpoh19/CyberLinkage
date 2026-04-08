# 🧠 知路 ZhiPath —— 基于知识图谱的个性化学习伴侣

> 北航冯如杯参赛作品 | 智能学伴方向

## 📖 项目简介

**知路**是一个面向大学生的智能学习伴侣系统，通过知识图谱、自适应诊断和AI辅导，为每位学生量身定制学习路径。

当前大学生在学习中面临三大痛点：
- 🔴 **难以自我诊断** —— 不知道自己哪里薄弱
- 🟡 **学习路径模糊** —— 不知道先学什么后学什么
- 🟢 **缺乏个性化指导** —— 一刀切的教学模式

知路通过 **诊断 → 可视化 → 规划 → 辅导 → 复测** 的完整闭环，解决这些问题。

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

### Docker 一键启动

```bash
docker-compose up -d
```

### 手动启动

**后端：**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
npm run dev
```

### 导入知识图谱

```bash
cd knowledge/scripts
python import_to_neo4j.py --course c_language
```

## 📁 项目结构

```
zhipath/
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
