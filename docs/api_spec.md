# 📡 API 接口文档 —— 知路 ZhiPath

Base URL: `http://localhost:8000/api`

所有需要认证的接口需在 Header 中携带：
```
Authorization: Bearer <token>
```

---

## 一、认证模块 `/api/auth`

### POST `/api/auth/register` — 注册

**Request:**
```json
{
  "username": "zhangsan",
  "email": "zhangsan@buaa.edu.cn",
  "password": "123456"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### POST `/api/auth/login` — 登录

**Request:**
```json
{
  "username": "zhangsan",
  "password": "123456"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### GET `/api/auth/me` — 获取当前用户 🔒

**Response (200):**
```json
{
  "id": 1,
  "username": "zhangsan",
  "email": "zhangsan@buaa.edu.cn",
  "created_at": "2026-04-08T12:00:00"
}
```

---

## 二、诊断测评模块 `/api/diagnosis`

### GET `/api/diagnosis/start` — 开始诊断 🔒

**Query Parameters:**
- `course` (string, default: "c_language") — 课程标识
- `count` (int, default: 10) — 题目数量

**Response (200):**
```json
[
  {
    "id": 1,
    "knowledge_point_id": "data_type",
    "question_text": "在C语言中，int类型在32位系统上通常占用多少字节？",
    "options": {"A": "1字节", "B": "2字节", "C": "4字节", "D": "8字节"},
    "difficulty": 1
  }
]
```

### POST `/api/diagnosis/submit` — 提交诊断 🔒

**Request:**
```json
{
  "answers": [
    {"exercise_id": 1, "answer": "C"},
    {"exercise_id": 2, "answer": "A"}
  ]
}
```

**Response (200):**
```json
{
  "total": 10,
  "correct": 7,
  "accuracy": 0.7,
  "mastery_map": {
    "data_type": 0.82,
    "var": 0.65,
    "io": 0.45,
    "operator": 0.73
  },
  "weak_points": ["io", "var"]
}
```

---

## 三、知识图谱模块 `/api/graph`

### GET `/api/graph/{course}` — 获取知识图谱

**Path Parameters:**
- `course` (string) — 课程标识，如 "c_language"

**Response (200):**
```json
{
  "course": "c_language",
  "nodes": [
    {
      "id": "var",
      "name": "变量与常量",
      "category": "基础语法",
      "difficulty": 1,
      "chapter": 2,
      "description": "变量定义、初始化...",
      "estimated_minutes": 25,
      "mastery": 0.65
    }
  ],
  "edges": [
    {
      "source": "data_type",
      "target": "var",
      "relation": "prerequisite"
    }
  ]
}
```

### GET `/api/graph/{course}/mastery` — 获取掌握度 🔒

**Response (200):**
```json
[
  {
    "knowledge_point_id": "var",
    "mastery": 0.65,
    "attempt_count": 5,
    "correct_count": 3
  }
]
```

---

## 四、学习路径模块 `/api/path`

### GET `/api/path/recommend` — 推荐学习路径 🔒

**Query Parameters:**
- `course` (string, default: "c_language")

**Response (200):**
```json
{
  "path": [
    {
      "id": "operator",
      "name": "运算符与表达式",
      "category": "基础语法",
      "mastery": 0.35,
      "estimated_minutes": 35,
      "difficulty": 2,
      "status": "locked"
    },
    {
      "id": "if_else",
      "name": "条件语句(if/else)",
      "category": "控制结构",
      "mastery": 0.42,
      "estimated_minutes": 30,
      "difficulty": 2,
      "status": "in-progress"
    }
  ],
  "total_minutes": 185,
  "weak_count": 4
}
```

---

## 五、学习报告模块 `/api/report`

### GET `/api/report/summary` — 学习概况 🔒

**Response (200):**
```json
{
  "total_exercises": 47,
  "total_correct": 31,
  "accuracy": 0.6596,
  "mastery_distribution": {"high": 8, "medium": 12, "low": 5},
  "recent_activity": [
    {"date": "2026-04-07", "count": 15},
    {"date": "2026-04-08", "count": 8}
  ],
  "days_active": 5
}
```

### GET `/api/report/progress` — 知识点进度 🔒

**Response (200):**
```json
[
  {"knowledge_point_id": "ptr_basic", "mastery": 0.25, "attempt_count": 3},
  {"knowledge_point_id": "for_loop", "mastery": 0.45, "attempt_count": 8}
]
```

---

## 六、AI 答疑模块 `/api/chat`

### POST `/api/chat` — AI对话

**Request:**
```json
{
  "message": "指针和数组有什么区别？",
  "mode": "socratic",
  "history": [
    {"role": "user", "content": "什么是指针？"},
    {"role": "assistant", "content": "你知道变量存储在内存的什么位置吗？"}
  ]
}
```

**Response (200):**
```json
{
  "response": "好问题！让我反问你一下：你觉得 int arr[5] 和 int *p 在内存中的存储方式有什么不同？",
  "knowledge_points": ["ptr_array"]
}
```

---

## 错误响应格式

```json
{
  "detail": "用户名或密码错误"
}
```

常见状态码：
- `400` — 请求参数错误
- `401` — 未认证 / Token 无效
- `404` — 资源不存在
- `500` — 服务器内部错误
