import { create } from 'zustand'

const useUserStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('zhipath_token') || null,

  setUser: (user) => set({ user }),

  setToken: (token) => {
    localStorage.setItem('zhipath_token', token)
    set({ token })
  },

  login: (user, token) => {
    localStorage.setItem('zhipath_token', token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('zhipath_token')
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().token,
}))

export default useUserStore
