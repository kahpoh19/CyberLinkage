import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import useUserStore from './store/userStore'
import { getClientDeviceInfo } from './utils/device'
import './index.css'

function Root() {
  const themeMode = useUserStore((s) => s.theme)
  const resolvedTheme = useUserStore((s) => s.resolvedTheme)
  const syncSystemTheme = useUserStore((s) => s.syncSystemTheme)
  const setDeviceInfo = useUserStore((s) => s.setDeviceInfo)

  useEffect(() => {
    syncSystemTheme()

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => syncSystemTheme()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [themeMode, syncSystemTheme])

  useEffect(() => {
    const syncDevice = () => setDeviceInfo(getClientDeviceInfo())

    syncDevice()
    window.addEventListener('resize', syncDevice)
    window.addEventListener('orientationchange', syncDevice)

    return () => {
      window.removeEventListener('resize', syncDevice)
      window.removeEventListener('orientationchange', syncDevice)
    }
  }, [setDeviceInfo])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: resolvedTheme === 'dark'
          ? antTheme.darkAlgorithm
          : antTheme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff' },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
