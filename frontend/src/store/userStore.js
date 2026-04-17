import { create } from 'zustand'

const THEME_STORAGE_KEY = 'cyberlinkage_theme'
const CHAT_STORAGE_PREFIX = 'cyberlinkage_chat_messages'
const SUBJECT_STORAGE_KEY = 'cyberlinkage_subject'
const APP_BUILD_ID = typeof __CYBERLINKAGE_BUILD_ID__ === 'string' ? __CYBERLINKAGE_BUILD_ID__ : 'dev'
const CHAT_STORAGE_KEY = `${CHAT_STORAGE_PREFIX}_${APP_BUILD_ID}`
const VALID_THEMES = new Set(['light', 'dark'])
const CHAT_WELCOME_MESSAGE = '你好！我是CyberLinkage助教 🧠\n\n我可以帮你解答 C 语言学习中遇到的问题。默认使用「苏格拉底式引导」—— 我会通过提问帮你自己发现答案，而不是直接告诉你。\n\n如果你想要直接解释，可以关闭引导模式。\n\n有什么想问的？'

export const SUBJECTS = [
  { id: 'c_language', label: 'C 语言程序设计' },
  { id: 'calculus',   label: '高等数学'         },
  { id: 'aerospace',  label: '航空航天概论'       },
  { id: 'thermo',     label: '工程热力学'         },
  { id: 'physics',    label: '大学物理'           },
  { id: 'circuits',   label: '电路原理'           },
]

function getInitialSubject() {
  if (typeof window === 'undefined') return 'c_language'
  return window.localStorage.getItem(SUBJECT_STORAGE_KEY) || 'c_language'
}

function persistSubject(id) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SUBJECT_STORAGE_KEY, id)
}

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

const useUserStore = create((set, get) => {
  const initialTheme = getInitialTheme()

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
    openAuthModal: () => set({ showAuthModal: true }),
    closeAuthModal: () => set({ showAuthModal: false }),

    currentSubject: getInitialSubject(),

    setCurrentSubject: (id) => {
      persistSubject(id)
      set({ currentSubject: id })
    },

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