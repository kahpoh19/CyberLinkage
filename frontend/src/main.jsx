import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import useUserStore from './store/userStore'

function Root() {
  const themeMode = useUserStore((s) => s.theme)
  const fontSize = useUserStore((s) => s.fontSize)
  const fontFamily = useUserStore((s) => s.fontFamily)

  useEffect(() => {
    document.body.style.minHeight = '100vh'
    document.body.style.backgroundColor = themeMode === 'dark' ? '#141414' : '#f5f5f5'
    document.body.style.color = themeMode === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)'
    document.documentElement.style.colorScheme = themeMode === 'dark' ? 'dark' : 'light'
  }, [themeMode])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: themeMode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
        },
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
