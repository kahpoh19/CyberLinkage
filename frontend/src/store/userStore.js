import { create } from 'zustand'

const useUserStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('cyberlinkage_token') || null,

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
}))

export default useUserStore
