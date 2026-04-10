import React, { useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Space, Tooltip } from 'antd'
import {
  DashboardOutlined, ExperimentOutlined, ApartmentOutlined,
  NodeIndexOutlined, RobotOutlined, LogoutOutlined,
  SunOutlined, MoonOutlined,
} from '@ant-design/icons'

import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import useUserStore from './store/userStore'

const { Sider, Content, Header } = Layout
const { Title } = Typography

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/diagnosis', icon: <ExperimentOutlined />, label: '诊断测评' },
  { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
  { key: '/path', icon: <NodeIndexOutlined />, label: '学习路径' },
  { key: '/chat', icon: <RobotOutlined />, label: 'AI 答疑' },
]

const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isAuthenticated, theme, toggleTheme, discoMode, activateDisco } = useUserStore()

  const isDark = theme === 'dark'
  const longPressTimer = useRef(null)
  const discoIntervalRef = useRef(null)
  const overlayRef = useRef(null)
  const colorIndexRef = useRef(0)

  // Disco color flash loop
  useEffect(() => {
    if (discoMode) {
      let i = 0
      discoIntervalRef.current = setInterval(() => {
        if (overlayRef.current) {
          overlayRef.current.style.background = DISCO_COLORS[i % DISCO_COLORS.length]
          overlayRef.current.style.opacity = '0.18'
        }
        i++
      }, 150)
    } else {
      clearInterval(discoIntervalRef.current)
      if (overlayRef.current) overlayRef.current.style.opacity = '0'
    }
    return () => clearInterval(discoIntervalRef.current)
  }, [discoMode])

  const handlePressStart = () => {
    longPressTimer.current = setTimeout(() => {
      activateDisco()
    }, 800)
  }

  const handlePressEnd = () => {
    clearTimeout(longPressTimer.current)
  }

  const handleClick = () => {
    // short click = normal theme toggle
    clearTimeout(longPressTimer.current)
    toggleTheme()
  }

  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>

      {/* Disco overlay — fixed, pointer-events none so it doesn't block clicks */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed', inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          transition: 'background 0.12s ease, opacity 0.3s ease',
          mixBlendMode: 'screen',
        }}
      />

      {/* Disco banner */}
      {discoMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 10000, textAlign: 'center',
          padding: '6px 0',
          background: 'linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#00cfff,#bf00ff,#ff0080)',
          backgroundSize: '200% 100%',
          animation: 'discoSlide 1s linear infinite',
          fontSize: 14, fontWeight: 600, color: '#fff',
          letterSpacing: 4,
          pointerEvents: 'none',
        }}>
          🕺 DISCO MODE 🕺
        </div>
      )}

      <style>{`
        @keyframes discoSlide {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes discoPulse {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.3) rotate(-15deg); }
          75% { transform: scale(1.3) rotate(15deg); }
        }
        .disco-btn-icon {
          animation: ${discoMode ? 'discoPulse 0.4s ease-in-out infinite' : 'none'};
          display: inline-flex;
        }
      `}</style>

      <Sider
        breakpoint="lg"
        collapsedWidth="80"
        theme={isDark ? 'dark' : 'light'}
        style={discoMode ? { filter: 'hue-rotate(var(--disco-hue, 0deg))' } : {}}
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Title level={4} style={{ margin: 0, color: discoMode ? '#ff0080' : '#1677ff', transition: 'color 0.15s' }}>
            {discoMode ? '🕺 CyberLinkage' : '🧠 CyberLinkage'}
          </Title>
        </div>
        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: isDark ? '#141414' : '#fff',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
          position: 'relative',
          zIndex: 10,
        }}>
          <Title level={5} style={{ margin: 0 }}>
            基于知识图谱的个性化学习伴侣
          </Title>
          <Space>
            <Tooltip title={discoMode ? '🕺 DISCO!' : isDark ? '切换浅色模式（长按开派对）' : '切换深色模式（长按开派对）'}>
              <Button
                type="text"
                shape="circle"
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                onClick={handleClick}
                icon={
                  <span className="disco-btn-icon">
                    {discoMode
                      ? <span style={{ fontSize: 18 }}>🪩</span>
                      : isDark
                        ? <SunOutlined style={{ fontSize: 18, color: '#faad14' }} />
                        : <MoonOutlined style={{ fontSize: 18, color: '#595959' }} />
                    }
                  </span>
                }
                style={{
                  transition: 'transform 0.3s ease',
                  transform: isDark && !discoMode ? 'rotate(180deg)' : 'rotate(0deg)',
                  outline: discoMode ? '2px solid #ff0080' : 'none',
                  borderRadius: '50%',
                }}
              />
            </Tooltip>

            {isAuthenticated() ? (
              <>
                <Avatar style={{ backgroundColor: discoMode ? '#ff0080' : '#1677ff', transition: 'background 0.15s' }}>
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <span>{user?.username}</span>
                <Button type="text" icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/') }} />
              </>
            ) : (
              <Button type="primary" onClick={() => navigate('/')}>登录</Button>
            )}
          </Space>
        </Header>

        <Content style={{ margin: '24px', minHeight: 280 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/path" element={<LearningPath />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}