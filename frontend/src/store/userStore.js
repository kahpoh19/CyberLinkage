import { create } from 'zustand'

const THEME_STORAGE_KEY = 'cyberlinkage_theme'

const safeGetItem = (key, fallback = null) => {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

const safeSetItem = (key, value) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore storage errors
  }
}

const safeRemoveItem = (key) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

const useUserStore = create((set, get) => ({
  user: null,
  token: safeGetItem('cyberlinkage_token', null),
  theme: safeGetItem(THEME_STORAGE_KEY, 'light'),
  discoMode: false,
  showAuthModal: false,
  _discoTimer: null,

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => set({ showAuthModal: false }),

  setUser: (user) => set({ user }),

  setToken: (token) => {
    safeSetItem('cyberlinkage_token', token)
    set({ token })
  },

  login: (user, token) => {
    safeSetItem('cyberlinkage_token', token)
    set({ user, token })
  },

  logout: () => {
    clearTimeout(get()._discoTimer)
    safeRemoveItem('cyberlinkage_token')
    set({
      user: null,
      token: null,
      discoMode: false,
      _discoTimer: null,
    })
  },

  isAuthenticated: () => !!get().token,
  isTeacher: () => get().user?.role === 'teacher',

  setTheme: (theme) => {
    const next = theme === 'dark' ? 'dark' : 'light'
    safeSetItem(THEME_STORAGE_KEY, next)
    set({ theme: next })
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    safeSetItem(THEME_STORAGE_KEY, next)
    set({ theme: next })
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
}))

export default useUserStore