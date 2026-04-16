import { create } from 'zustand'

<<<<<<< HEAD
const THEME_STORAGE_KEY = 'cyberlinkage_theme'
const VALID_THEMES = new Set(['auto', 'light', 'dark'])
const CHAT_WELCOME_MESSAGE = '你好！我是CyberLinkage助教 🧠\n\n我可以帮你解答 C 语言学习中遇到的问题。默认使用「苏格拉底式引导」—— 我会通过提问帮你自己发现答案，而不是直接告诉你。\n\n如果你想要直接解释，可以关闭引导模式。\n\n有什么想问的？'

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'auto'
}
=======
// ⭐ 初始化 user（从本地读取）
const savedUser = JSON.parse(localStorage.getItem('user') || 'null')

const useUserStore = create((set, get) => ({
  // ========================
  // 👤 用户 & 登录
  // ========================
  user: savedUser,
  token: localStorage.getItem('cyberlinkage_token') || null,

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user)) // ⭐ 持久化
    set({ user })
  },
>>>>>>> 16d1217 (use remote App.jsx)

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

<<<<<<< HEAD
function resolveTheme(theme) {
  const normalized = normalizeTheme(theme)
  return normalized === 'auto' ? getSystemTheme() : normalized
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'auto'
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY) || 'auto')
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

const useUserStore = create((set, get) => {
  const initialTheme = getInitialTheme()

  return {
    theme: initialTheme,
    resolvedTheme: resolveTheme(initialTheme),
    user: null,
    token: localStorage.getItem('cyberlinkage_token') || null,
    discoMode: false,
    chatMessages: createInitialChatMessages(),
    chatLoading: false,
    socraticMode: true,
    showAuthModal: false,          // ← add
    openAuthModal: () => set({ showAuthModal: true }),   // ← add
    closeAuthModal: () => set({ showAuthModal: false }),  // ← add
=======
  login: (user, token) => {
    localStorage.setItem('cyberlinkage_token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('cyberlinkage_token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().token,
  isTeacher: () => get().user?.role === 'teacher',

  // ========================
  // 🎨 主题 / 外观
  // ========================
  theme: localStorage.getItem('cyberlinkage_theme') || 'light',

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('cyberlinkage_theme', next)
    document.body.setAttribute('data-theme', next) // ⭐ 关键
    set({ theme: next })
  },

  // ========================
  // 🔤 字体设置
  // ========================
  fontSize: parseInt(localStorage.getItem('cyberlinkage_font_size') || '14'),
  fontFamily: localStorage.getItem('cyberlinkage_font_family') || 'default',

  setFontSize: (size) => {
    localStorage.setItem('cyberlinkage_font_size', String(size))
    document.documentElement.style.setProperty('--font-size', `${size}px`) // ⭐ 用变量
    set({ fontSize: size })
  },

  setFontFamily: (family) => {
    const fontMap = {
      default: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: '"Fira Code", "Courier New", monospace',
    }

    localStorage.setItem('cyberlinkage_font_family', family)

    document.documentElement.style.setProperty(
      '--font-family',
      fontMap[family] || fontMap.default
    )

    set({ fontFamily: family })
  },

  // ========================
  // 🕺 Disco Mode
  // ========================
  discoMode: false,
  _discoTimer: null,

  activateDisco: () => {
    if (get().discoMode) return

    const timer = setTimeout(() => {
      set({ discoMode: false, _discoTimer: null })
    }, 10000)

    set({ discoMode: true, _discoTimer: timer })
  },

  deactivateDisco: () => {
    clearTimeout(get()._discoTimer)
    set({ discoMode: false, _discoTimer: null })
  },

  // ========================
  // 🔐 弹窗
  // ========================
  showAuthModal: false,

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => set({ showAuthModal: false }),
}))
>>>>>>> 16d1217 (use remote App.jsx)

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
      const order = ['auto', 'light', 'dark']
      const current = normalizeTheme(get().theme)
      const next = order[(order.indexOf(current) + 1) % order.length]
      persistTheme(next)
      set({ theme: next, resolvedTheme: resolveTheme(next) })
    },

    syncSystemTheme: () => {
      set({ resolvedTheme: resolveTheme(get().theme) })
    },

    setSocraticMode: (socraticMode) => set({ socraticMode }),

    setChatLoading: (chatLoading) => set({ chatLoading }),

    addChatMessage: (message) => {
      set((state) => ({ chatMessages: [...state.chatMessages, message] }))
    },

    setChatMessages: (chatMessages) => set({ chatMessages }),

    resetChatMessages: () => set({ chatMessages: createInitialChatMessages(), chatLoading: false }),

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
