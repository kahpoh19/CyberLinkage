import { create } from 'zustand'

const useUserStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('cyberlinkage_token') || null,
  theme: localStorage.getItem('cyberlinkage_theme') || 'light',
  discoMode: false,

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
    set({ discoMode: true })
    setTimeout(() => set({ discoMode: false }), 5000)
  },
}))

export default useUserStore