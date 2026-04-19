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

export const startDiagnosis = (course = 'c_language', count = 10, options = {}) => {
  const params = { course }

  if (typeof count === 'number') {
    params.count = count
  }

  if (options.knowledgePointId) {
    params.knowledge_point_id = options.knowledgePointId
  }

  return api.get('/diagnosis/start', { params })
}

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

export const getPathExercises = (knowledgePointId, count = 5, course = 'c_language') =>
  api.get('/path/exercises', { params: { knowledge_point_id: knowledgePointId, count, course } })

// ─── 学习报告 ─────────────────────────────────────

export const getReport = (course) =>
  api.get('/report/summary', { params: { course } })

export const getProgress = (course) =>
  api.get('/report/progress', { params: { course } })

// ─── AI 答疑 ──────────────────────────────────────

export const chatWithAI = (message, mode = 'socratic', history = []) =>
  api.post('/chat', { message, mode, history })

export default api

// ─── 个人信息 ──────────────────────────────────────────

export const getProfile = () => api.get('/profile/me')
export const updateProfile = (data) => api.patch('/profile/me', data)
export const uploadAvatar = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/profile/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const deleteAvatar = () => api.delete('/profile/avatar')
export const getDocuments = () => api.get('/profile/documents')
export const uploadDocument = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/profile/documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const deleteDocument = (id) => api.delete(`/profile/documents/${id}`)