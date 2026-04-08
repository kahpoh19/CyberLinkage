import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// 请求拦截器：自动附带 JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cyberlinkage_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── 认证 ─────────────────────────────────────────

export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)
export const getMe = () => api.get('/auth/me')

// ─── 诊断测评 ─────────────────────────────────────

export const startDiagnosis = (course = 'c_language', count = 10) =>
  api.get('/diagnosis/start', { params: { course, count } })

export const submitDiagnosis = (answers) =>
  api.post('/diagnosis/submit', { answers })

// ─── 知识图谱 ─────────────────────────────────────

export const getGraph = (course = 'c_language') =>
  api.get(`/graph/${course}`)

export const getMastery = (course = 'c_language') =>
  api.get(`/graph/${course}/mastery`)

// ─── 学习路径 ─────────────────────────────────────

export const getPath = (course = 'c_language') =>
  api.get('/path/recommend', { params: { course } })

// ─── 学习报告 ─────────────────────────────────────

export const getReport = () => api.get('/report/summary')
export const getProgress = () => api.get('/report/progress')

// ─── AI 答疑 ──────────────────────────────────────

export const chatWithAI = (message, mode = 'socratic', history = []) =>
  api.post('/chat', { message, mode, history })

export default api
