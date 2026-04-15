import { create } from 'zustand'

const THEME_STORAGE_KEY = 'cyberlinkage_theme'
const VALID_THEMES = new Set(['auto', 'light', 'dark'])

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'auto'
}

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

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

const useUserStore = create((set, get) => {
  const initialTheme = getInitialTheme()

  return {
    theme: initialTheme,
    resolvedTheme: resolveTheme(initialTheme),
    user: null,
    token: localStorage.getItem('cyberlinkage_token') || null,
    discoMode: false,
    showAuthModal: false,          // ← add
    openAuthModal: () => set({ showAuthModal: true }),   // ← add
    closeAuthModal: () => set({ showAuthModal: false }),  // ← add

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
      set({ user: null, token: null })
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
