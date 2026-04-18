import { create } from 'zustand'

const THEME_STORAGE_KEY = 'cyberlinkage_theme'
const CHAT_STORAGE_PREFIX = 'cyberlinkage_chat_messages'
const SUBJECT_STORAGE_KEY = 'cyberlinkage_subject'
const CUSTOM_SUBJECTS_KEY = 'cyberlinkage_custom_subjects'
const APP_BUILD_ID = typeof __CYBERLINKAGE_BUILD_ID__ === 'string' ? __CYBERLINKAGE_BUILD_ID__ : 'dev'
const CHAT_STORAGE_KEY = `${CHAT_STORAGE_PREFIX}_${APP_BUILD_ID}`
const VALID_THEMES = new Set(['light', 'dark'])
const CHAT_WELCOME_MESSAGE = '你好！我是CyberLinkage助教 🧠\n\n我可以帮你解答 C 语言学习中遇到的问题。默认使用「苏格拉底式引导」—— 我会通过提问帮你自己发现答案，而不是直接告诉你。\n\n如果你想要直接解释，可以关闭引导模式。\n\n有什么想问的？'

// ── 内置科目（不可删除） ──────────────────────────────────────────
export const BUILTIN_SUBJECTS = [
  { id: 'mechanics',      label: '机械原理',       builtin: true },
  { id: 'c_language',     label: 'C 语言程序设计',  builtin: true },
  { id: 'data_structure', label: '数据结构',        builtin: true },
  { id: 'calculus',       label: '高等数学',        builtin: true },
  { id: 'aerospace',      label: '航空航天概论',    builtin: true },
  { id: 'thermo',         label: '工程热力学',      builtin: true },
  { id: 'physics',        label: '大学物理',        builtin: true },
  { id: 'circuits',       label: '电路原理',        builtin: true },
]

// 从 localStorage 读取用户自定义科目
function loadCustomSubjects() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_SUBJECTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCustomSubjects(subjects) {
  if (typeof window === 'undefined') return
  const custom = subjects.filter(s => !s.builtin)
  window.localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(custom))
}

// 合并内置 + 自定义，返回完整列表
function buildSubjectList(customSubjects = []) {
  const ids = new Set(BUILTIN_SUBJECTS.map(s => s.id))
  const extras = customSubjects.filter(s => !ids.has(s.id))
  return [...BUILTIN_SUBJECTS, ...extras]
}

// 向后兼容：旧代码 import { SUBJECTS } from './userStore'
export const SUBJECTS = buildSubjectList(loadCustomSubjects())

// ─────────────────────────────────────────────────────────────────

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'light'
}

function resolveTheme(theme) {
  return normalizeTheme(theme)
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY) || 'light')
}

function persistTheme(theme) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

// ── 默认科目改为机械原理 ──────────────────────────────────────────
function getInitialSubject() {
  if (typeof window === 'undefined') return 'mechanics'
  return window.localStorage.getItem(SUBJECT_STORAGE_KEY) || 'mechanics'
}

function persistSubject(id) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SUBJECT_STORAGE_KEY, id)
}

// ── 聊天消息持久化工具 ────────────────────────────────────────────

function createInitialChatMessages() {
  return [
    {
      role: 'ai',
      content: CHAT_WELCOME_MESSAGE,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]
}

function isValidChatMessage(message) {
  return (
    message &&
    typeof message === 'object' &&
    ['ai', 'user'].includes(message.role) &&
    typeof message.content === 'string'
  )
}

function clearStaleChatMessages() {
  if (typeof window === 'undefined') return
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(CHAT_STORAGE_PREFIX) && key !== CHAT_STORAGE_KEY) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {}
}

function getStoredChatMessages() {
  if (typeof window === 'undefined') return null
  clearStaleChatMessages()
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isValidChatMessage)) return null
    return parsed
  } catch {
    return null
  }
}

function persistChatMessages(chatMessages) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages))
  } catch {}
}

function clearStoredChatMessages() {
  if (typeof window === 'undefined') return
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(CHAT_STORAGE_PREFIX)) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {}
}

// ── Store ─────────────────────────────────────────────────────────

const useUserStore = create((set, get) => {
  const initialTheme = getInitialTheme()
  const initialCustomSubjects = loadCustomSubjects()
  const initialSubjects = buildSubjectList(initialCustomSubjects)

  return {
    theme: initialTheme,
    resolvedTheme: resolveTheme(initialTheme),
    user: null,
    token: localStorage.getItem('cyberlinkage_token') || null,
    discoMode: false,
    chatMessages: getStoredChatMessages() || createInitialChatMessages(),
    chatLoading: false,
    socraticMode: true,
    showAuthModal: false,

    // 科目列表（内置 + 自定义）
    subjects: initialSubjects,

    // 当前科目 — 默认机械原理
    currentSubject: getInitialSubject(),

    openAuthModal: () => set({ showAuthModal: true }),
    closeAuthModal: () => set({ showAuthModal: false }),

    setCurrentSubject: (id) => {
      persistSubject(id)
      set({ currentSubject: id })
    },

    // ── 科目 CRUD ─────────────────────────────────────────────────

    /**
     * 添加自定义科目
     * @param {{ id: string, label: string }} subject
     * @returns {{ success: boolean, error?: string }}
     */
    addSubject: (subject) => {
      const { subjects } = get()
      if (!subject.id || !subject.label) {
        return { success: false, error: '科目 ID 和名称不能为空' }
      }
      const normalized = subject.id.trim().replace(/\s+/g, '_').toLowerCase()
      if (subjects.find(s => s.id === normalized)) {
        return { success: false, error: '该科目 ID 已存在' }
      }
      const newSubject = { id: normalized, label: subject.label.trim(), builtin: false }
      const updated = [...subjects, newSubject]
      saveCustomSubjects(updated)
      set({ subjects: updated })
      return { success: true, subject: newSubject }
    },

    /**
     * 删除自定义科目（内置科目不可删除）
     * @param {string} subjectId
     * @returns {{ success: boolean, error?: string }}
     */
    removeSubject: (subjectId) => {
      const { subjects, currentSubject } = get()
      const target = subjects.find(s => s.id === subjectId)
      if (!target) return { success: false, error: '科目不存在' }
      if (target.builtin) return { success: false, error: '内置科目不可删除' }

      const updated = subjects.filter(s => s.id !== subjectId)
      saveCustomSubjects(updated)

      // 如果删除的是当前选中科目，切换到机械原理
      const nextSubject = currentSubject === subjectId ? 'mechanics' : currentSubject
      if (nextSubject !== currentSubject) persistSubject(nextSubject)

      set({ subjects: updated, currentSubject: nextSubject })
      return { success: true }
    },

    // ── 用户认证 ──────────────────────────────────────────────────

    setUser: (user) => set({ user }),

    setToken: (token) => {
      localStorage.setItem('cyberlinkage_token', token)
      set({ token })
    },

    login: (user, token) => {
      localStorage.setItem('cyberlinkage_token', token)
      set({ user, token })
    },

    logout: () => {
      localStorage.removeItem('cyberlinkage_token')
      clearStoredChatMessages()
      set({
        user: null,
        token: null,
        chatMessages: createInitialChatMessages(),
        chatLoading: false,
        socraticMode: true,
      })
    },

    isAuthenticated: () => !!get().token,

    // ── 主题 ──────────────────────────────────────────────────────

    setTheme: (theme) => {
      const next = normalizeTheme(theme)
      persistTheme(next)
      set({ theme: next, resolvedTheme: resolveTheme(next) })
    },

    toggleTheme: () => {
      const current = normalizeTheme(get().theme)
      const next = current === 'light' ? 'dark' : 'light'
      persistTheme(next)
      set({ theme: next, resolvedTheme: next })
    },

    syncSystemTheme: () => {
      set({ resolvedTheme: normalizeTheme(get().theme) })
    },

    // ── 聊天 ──────────────────────────────────────────────────────

    setSocraticMode: (socraticMode) => set({ socraticMode }),
    setChatLoading: (chatLoading) => set({ chatLoading }),

    addChatMessage: (message) => {
      set((state) => {
        const chatMessages = [...state.chatMessages, message]
        persistChatMessages(chatMessages)
        return { chatMessages }
      })
    },

    setChatMessages: (chatMessages) => {
      persistChatMessages(chatMessages)
      set({ chatMessages })
    },

    resetChatMessages: () => {
      const chatMessages = createInitialChatMessages()
      persistChatMessages(chatMessages)
      set({ chatMessages, chatLoading: false })
    },

    // ── Disco Mode ────────────────────────────────────────────────

    activateDisco: () => {
      if (get().discoMode) return
      const timer = setTimeout(() => set({ discoMode: false, _discoTimer: null }), 10000)
      set({ discoMode: true, _discoTimer: timer })
    },

    deactivateDisco: () => {
      clearTimeout(get()._discoTimer)
      set({ discoMode: false, _discoTimer: null })
    },
  }
})

export default useUserStore