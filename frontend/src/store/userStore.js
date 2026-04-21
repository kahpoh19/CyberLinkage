import { create } from 'zustand'

const THEME_STORAGE_KEY = 'cyberlinkage_theme'
const CHAT_STORAGE_PREFIX = 'cyberlinkage_chat_messages'
const SUBJECT_STORAGE_KEY = 'cyberlinkage_subject'
const CUSTOM_SUBJECTS_KEY = 'cyberlinkage_custom_subjects'
const APP_BUILD_ID = typeof __CYBERLINKAGE_BUILD_ID__ === 'string' ? __CYBERLINKAGE_BUILD_ID__ : 'dev'
const CHAT_STORAGE_KEY = `${CHAT_STORAGE_PREFIX}_${APP_BUILD_ID}`
const VALID_THEMES = new Set(['light', 'dark'])

const SUBJECT_CHAT_PRESETS = {
  mechanics: {
    description: '分析机构运动、副、自由度、死点和位移曲线等问题',
    placeholder: '输入你的机械原理问题...',
  },
  c_language: {
    description: '解答 C 语言语法、指针、数组、函数和调试问题',
    placeholder: '输入你的 C 语言问题...',
  },
  data_structure: {
    description: '讲解线性表、树、图、查找排序与算法复杂度',
    placeholder: '输入你的数据结构问题...',
  },
  calculus: {
    description: '讲解极限、导数、积分、级数和常见解题思路',
    placeholder: '输入你的高等数学问题...',
  },
  aerospace: {
    description: '讨论航空航天基础概念、飞行原理和系统组成',
    placeholder: '输入你的航空航天问题...',
  },
  thermo: {
    description: '讲解热力学定律、状态参数、循环过程和能量分析',
    placeholder: '输入你的工程热力学问题...',
  },
  physics: {
    description: '讲解力学、电磁学、振动波动和常见物理建模',
    placeholder: '输入你的大学物理问题...',
  },
  circuits: {
    description: '分析电路定律、暂态响应、交流稳态与器件特性',
    placeholder: '输入你的电路原理问题...',
  },
}

// ── 内置科目（不可删除） ──────────────────────────────────────────
export const BUILTIN_SUBJECTS = [
  { id: 'mechanics',      label: '机械原理',       builtin: false },
  { id: 'c_language',     label: 'C 语言程序设计',  builtin: false },
  { id: 'data_structure', label: '数据结构',        builtin: false },
  { id: 'calculus',       label: '高等数学',        builtin: false },
  { id: 'aerospace',      label: '航空航天概论',    builtin: false },
  { id: 'thermo',         label: '工程热力学',      builtin: false },
  { id: 'physics',        label: '大学物理',        builtin: false },
  { id: 'circuits',       label: '电路原理',        builtin: false },
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

export function getSubjectLabel(subjectId, subjects = SUBJECTS) {
  return subjects.find((subject) => subject.id === subjectId)?.label || subjectId || '当前科目'
}

export function getSubjectChatConfig(subjectId, subjects = SUBJECTS) {
  const label = getSubjectLabel(subjectId, subjects)
  const preset = SUBJECT_CHAT_PRESETS[subjectId] || {}

  return {
    subjectId,
    label,
    pageTitle: `${label} AI 答疑`,
    placeholder: preset.placeholder || `输入你的${label}问题...`,
    description: preset.description || `解答 ${label} 学习中遇到的问题`,
    welcomeMessage:
      `你好！我是CyberLinkage助教 🧠\n\n` +
      `当前科目：${label}\n\n` +
      `我可以帮你${preset.description || `解答 ${label} 学习中遇到的问题`}。` +
      `默认使用「苏格拉底式引导」—— 我会通过提问帮你自己发现答案，而不是直接告诉你。\n\n` +
      `如果你想要直接解释，可以关闭引导模式。\n\n` +
      `有什么想问的？`,
  }
}

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

function createInitialChatMessages(subjectId = 'mechanics', subjects = SUBJECTS) {
  return [
    {
      role: 'ai',
      content: getSubjectChatConfig(subjectId, subjects).welcomeMessage,
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

function getStoredChatSessions(initialSubject, subjects) {
  if (typeof window === 'undefined') return null
  clearStaleChatMessages()
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)

    // 兼容旧版本：之前只保存了一套默认的 C 语言聊天记录
    if (Array.isArray(parsed) && parsed.every(isValidChatMessage)) {
      return { c_language: parsed }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const sessions = {}
    Object.entries(parsed).forEach(([subjectId, messages]) => {
      if (Array.isArray(messages) && messages.every(isValidChatMessage)) {
        sessions[subjectId] = messages
      }
    })

    if (!Object.keys(sessions).length) return null
    return sessions
  } catch {
    return null
  }
}

function persistChatSessions(chatSessions) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatSessions))
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

function ensureSubjectChatSession(chatSessions, subjectId, subjects) {
  const nextSessions = { ...(chatSessions || {}) }
  if (!Array.isArray(nextSessions[subjectId]) || !nextSessions[subjectId].length) {
    nextSessions[subjectId] = createInitialChatMessages(subjectId, subjects)
  }
  return nextSessions
}

const useUserStore = create((set, get) => {
  const initialTheme = getInitialTheme()
  const initialCustomSubjects = loadCustomSubjects()
  const initialSubjects = buildSubjectList(initialCustomSubjects)
  const initialCurrentSubject = getInitialSubject()
  const initialChatSessions = ensureSubjectChatSession(
    getStoredChatSessions(initialCurrentSubject, initialSubjects) || {},
    initialCurrentSubject,
    initialSubjects,
  )

  return {
    theme: initialTheme,
    resolvedTheme: resolveTheme(initialTheme),
    user: null,
    token: localStorage.getItem('cyberlinkage_token') || null,
    discoMode: false,
    chatSessions: initialChatSessions,
    chatMessages: initialChatSessions[initialCurrentSubject],
    chatLoading: false,
    socraticMode: true,
    showAuthModal: false,

    // 科目列表（内置 + 自定义）
    subjects: initialSubjects,

    // 当前科目 — 默认机械原理
    currentSubject: initialCurrentSubject,

    openAuthModal: () => set({ showAuthModal: true }),
    closeAuthModal: () => set({ showAuthModal: false }),

    setCurrentSubject: (id) => {
      persistSubject(id)
      set((state) => {
        const nextSessions = ensureSubjectChatSession(state.chatSessions, id, state.subjects)
        persistChatSessions(nextSessions)
        return {
          currentSubject: id,
          chatSessions: nextSessions,
          chatMessages: nextSessions[id],
          chatLoading: false,
        }
      })
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
      const { subjects, currentSubject, chatSessions } = get()
      const target = subjects.find(s => s.id === subjectId)
      if (!target) return { success: false, error: '科目不存在' }

      const updated = subjects.filter(s => s.id !== subjectId)
      saveCustomSubjects(updated)

      // 如果删除的是当前选中科目，切换到机械原理
      const nextSubject = currentSubject === subjectId ? 'mechanics' : currentSubject
      if (nextSubject !== currentSubject) persistSubject(nextSubject)

      const nextSessions = { ...chatSessions }
      delete nextSessions[subjectId]
      const ensuredSessions = ensureSubjectChatSession(nextSessions, nextSubject, updated)
      persistChatSessions(ensuredSessions)

      set({
        subjects: updated,
        currentSubject: nextSubject,
        chatSessions: ensuredSessions,
        chatMessages: ensuredSessions[nextSubject],
      })
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
      const nextSubject = get().currentSubject
      const nextSubjects = get().subjects
      const nextSessions = ensureSubjectChatSession({}, nextSubject, nextSubjects)
      set({
        user: null,
        token: null,
        chatSessions: nextSessions,
        chatMessages: nextSessions[nextSubject],
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
        const chatSessions = {
          ...state.chatSessions,
          [state.currentSubject]: chatMessages,
        }
        persistChatSessions(chatSessions)
        return { chatMessages, chatSessions }
      })
    },

    setChatMessages: (chatMessages) => {
      set((state) => {
        const chatSessions = {
          ...state.chatSessions,
          [state.currentSubject]: chatMessages,
        }
        persistChatSessions(chatSessions)
        return { chatMessages, chatSessions }
      })
    },

    resetChatMessages: () => {
      const { currentSubject, subjects, chatSessions } = get()
      const chatMessages = createInitialChatMessages(currentSubject, subjects)
      const nextSessions = {
        ...chatSessions,
        [currentSubject]: chatMessages,
      }
      persistChatSessions(nextSessions)
      set({ chatMessages, chatSessions: nextSessions, chatLoading: false })
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
