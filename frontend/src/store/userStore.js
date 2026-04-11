import { create } from 'zustand'

const useUserStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('cyberlinkage_token') || null,
  theme: localStorage.getItem('cyberlinkage_theme') || 'light',
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

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('cyberlinkage_theme', next)
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