import React, { useRef, useEffect, useState } from 'react'
<<<<<<< HEAD
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Modal, Form, Input, message, Radio, Tag, Dropdown } from 'antd'
import DashboardOutlined from '@ant-design/icons/es/icons/DashboardOutlined'
import ExperimentOutlined from '@ant-design/icons/es/icons/ExperimentOutlined'
import ApartmentOutlined from '@ant-design/icons/es/icons/ApartmentOutlined'
import NodeIndexOutlined from '@ant-design/icons/es/icons/NodeIndexOutlined'
import RobotOutlined from '@ant-design/icons/es/icons/RobotOutlined'
import LogoutOutlined from '@ant-design/icons/es/icons/LogoutOutlined'
import SunOutlined from '@ant-design/icons/es/icons/SunOutlined'
import MoonOutlined from '@ant-design/icons/es/icons/MoonOutlined'
import SyncOutlined from '@ant-design/icons/es/icons/SyncOutlined'
import BookOutlined from '@ant-design/icons/es/icons/BookOutlined'
import ToolOutlined from '@ant-design/icons/es/icons/ToolOutlined'
=======
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Space, Tooltip, Modal, Form, Input, message, Radio, Tag } from 'antd'
import {
  DashboardOutlined, ExperimentOutlined, ApartmentOutlined,
  NodeIndexOutlined, RobotOutlined, LogoutOutlined,
  SunOutlined, MoonOutlined,
  TeamOutlined, BarChartOutlined, UserOutlined,
} from '@ant-design/icons'
>>>>>>> 16d1217 (use remote App.jsx)

import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import useUserStore from './store/userStore'
import { login, register, getMe } from './api'
<<<<<<< HEAD
import Sandbox from './pages/Sandbox'
=======
import Profile from './pages/Profile'
>>>>>>> 16d1217 (use remote App.jsx)

const { Sider, Content, Header } = Layout
const { Title } = Typography

<<<<<<< HEAD
const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/diagnosis', icon: <ExperimentOutlined />, label: '诊断测评' },
  { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
  { key: '/path', icon: <NodeIndexOutlined />, label: '学习路径' },
  { key: '/chat', icon: <RobotOutlined />, label: 'AI 答疑' },
  { key: '/teacher', icon: <BookOutlined />, label: '教师上传' },
  { key: '/sandbox', icon: <ToolOutlined />, label: '实战工坊' },
]

=======
>>>>>>> 16d1217 (use remote App.jsx)
const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

<<<<<<< HEAD
function TeacherOnlyRoute({ children }) {
  const { user, isAuthenticated } = useUserStore()

  if (isAuthenticated() && !user) {
    return (
      <div style={{ textAlign: 'center', marginTop: 100 }}>
        正在验证身份...
      </div>
    )
  }

  return user?.role === 'teacher' ? children : <Navigate to="/" replace />
}

// ── Auth Modal (lifted here so both header button and Dashboard can open it) ──
=======
/* ---------------- Auth Modal ---------------- */
>>>>>>> 16d1217 (use remote App.jsx)
function AuthModal() {
  const { showAuthModal, closeAuthModal, login: storeLogin, setUser } = useUserStore()
  const [isRegister, setIsRegister] = useState(false)
  const [form] = Form.useForm()
  const [discoMode, setDiscoMode] = useState(false)

  const handleClose = () => {
    form.resetFields()
    setIsRegister(false)
    closeAuthModal()
  }

  const handleAuth = async (values) => {
    try {
      const fn = isRegister ? register : login
      const res = await fn(values)
      storeLogin(null, res.data.access_token)
      const me = await getMe()
      setUser(me.data)
      handleClose()
      message.success(isRegister ? '注册成功！' : '登录成功！')
    } catch (e) {
      message.error(e.response?.data?.detail || '操作失败')
    }
  }

  return (
    <Modal title={isRegister ? '注册' : '登录'} open={showAuthModal} onCancel={handleClose} footer={null}>
      <Form form={form} onFinish={handleAuth} layout="vertical">
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        {isRegister && (
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
        )}

        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
          <Input.Password />
        </Form.Item>

        {isRegister && (
          <Form.Item name="role" label="身份">
            <Radio.Group>
              <Radio.Button value="student">学生</Radio.Button>
              <Radio.Button value="teacher">教师</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}

        <Button type="primary" htmlType="submit" block>
          {isRegister ? '注册' : '登录'}
        </Button>

        <Button type="link" block onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? '去登录' : '去注册'}
        </Button>
      </Form>
    </Modal>
  )
}

/* ---------------- App ---------------- */
export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
<<<<<<< HEAD
  const {
    user,
    logout,
    setUser,
    isAuthenticated,
    theme,
    resolvedTheme,
    toggleTheme,
    discoMode,
    activateDisco,
    openAuthModal,
  } = useUserStore()

  const isDark = resolvedTheme === 'dark'
=======

  const {
    user, logout, isAuthenticated,
    theme, toggleTheme,
    discoMode, activateDisco
  } = useUserStore()

  const isDark = theme === 'dark'

>>>>>>> 16d1217 (use remote App.jsx)
  const longPressTimer = useRef(null)
  const longPressTriggered = useRef(false)
  const discoIntervalRef = useRef(null)
  const discoTimeoutRef = useRef(null)
  const overlayRef = useRef(null)
  const hasToken = isAuthenticated()
  const isTeacher = user?.role === 'teacher'
  const visibleMenuItems = isTeacher
    ? menuItems
    : menuItems.filter((item) => item.key !== '/teacher')

  useEffect(() => {
    let cancelled = false

    if (!hasToken || user) return undefined

    getMe()
      .then((res) => {
        if (!cancelled) setUser(res.data)
      })
      .catch(() => {
        if (!cancelled) logout()
      })

    return () => {
      cancelled = true
    }
  }, [hasToken, user, setUser, logout])

  /* ---------- Disco颜色 ---------- */
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

      // ✅ 10秒自动关闭
      discoTimeoutRef.current = setTimeout(() => {
        useUserStore.getState().deactivateDisco()
      }, 10000)

    } else {
      clearInterval(discoIntervalRef.current)
      clearTimeout(discoTimeoutRef.current)
      if (overlayRef.current) overlayRef.current.style.opacity = '0'
    }

    return () => {
      clearInterval(discoIntervalRef.current)
      clearTimeout(discoTimeoutRef.current)
    }
  }, [discoMode])

<<<<<<< HEAD
  const handleThemePressStart = () => {
    longPressTriggered.current = false
=======
  useEffect(() => {
    const exit = (e) => {
      if (e.key === 'Escape' || e.type === 'click') {
        setDiscoMode(false)
      }
    }

    if (discoMode) {
      window.addEventListener('click', exit)
      window.addEventListener('keydown', exit)
    }

    return () => {
      window.removeEventListener('click', exit)
      window.removeEventListener('keydown', exit)
    }
  }, [discoMode])

  useEffect(() => {
    const exitDisco = (e) => {
      // 点击任何地方 或 按ESC
      if (e.type === 'click' || e.key === 'Escape') {
        setDiscoMode(false)
      }
    }

    if (discoMode) {
      window.addEventListener('click', exitDisco)
      window.addEventListener('keydown', exitDisco)
    }

    return () => {
      window.removeEventListener('click', exitDisco)
      window.removeEventListener('keydown', exitDisco)
    }
  }, [discoMode])

  useEffect(() => {
    const size = localStorage.getItem('fontSize')
    const font = localStorage.getItem('fontFamily')

    if (size) {
      document.documentElement.style.setProperty('--font-size', size + 'px')
    }
    if (font) {
      document.documentElement.style.setProperty('--font-family', font)
    }
  }, [])
  
  /* ---------- 长按触发 ---------- */
  const handlePressStart = () => {
    if (discoMode) return
>>>>>>> 16d1217 (use remote App.jsx)
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      activateDisco()
    }, 800)
  }

  const handleThemePressEnd = () => {
    clearTimeout(longPressTimer.current)
  }

<<<<<<< HEAD
  const handleThemeClick = () => {
    clearTimeout(longPressTimer.current)
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    toggleTheme()
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const currentThemeLabel = theme === 'auto'
    ? `Auto（当前 ${isDark ? 'Dark' : 'Light'}）`
    : theme === 'light'
      ? 'Light'
      : 'Dark'
  const nextThemeLabel = theme === 'auto' ? 'Light' : theme === 'light' ? 'Dark' : 'Auto'
  const themeButtonTitle = discoMode
    ? 'DISCO!'
    : `${currentThemeLabel}，点击切换到 ${nextThemeLabel}，长按开启 DISCO MODE`
  const themeButtonIcon = discoMode
    ? <span style={{ fontSize: 18 }}>🪩</span>
    : theme === 'auto'
      ? <SyncOutlined style={{ fontSize: 18, color: '#1677ff' }} />
      : theme === 'light'
        ? <SunOutlined style={{ fontSize: 18, color: '#faad14' }} />
        : <MoonOutlined style={{ fontSize: 18, color: '#f0f0f0' }} />
  const headerIconButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    lineHeight: 1,
    padding: 0,
    borderRadius: '50%',
  }
  const headerActionsStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    lineHeight: 1,
  }
  const userMenuItems = [
    {
      key: 'profile',
      disabled: true,
      label: (
        <div style={{ minWidth: 120, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600 }}>{user?.username || 'User'}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {user?.role === 'teacher' ? 'Teacher' : 'Student'}
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
  ]

=======
>>>>>>> 16d1217 (use remote App.jsx)
  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>

      {/* 背景闪光 */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'screen'
        }}
      />

      {/* 顶部提示 */}
      {discoMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          width: '100%',
          zIndex: 10000,
          textAlign: 'center',
          background: 'linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#00cfff)',
          color: '#fff'
        }}>
          🕺 DISCO MODE 🕺
        </div>
      )}

      {/* 🎯 GIF 主动画 */}
      {discoMode && (
        <img
          src={`/disco.gif?t=${Date.now()}`}
          alt="disco"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 260,
            zIndex: 10001,
            pointerEvents: 'none'
          }}
        />
      )}

      <Sider theme={isDark ? 'dark' : 'light'}>
        <Menu
          selectedKeys={[location.pathname]}
<<<<<<< HEAD
          items={visibleMenuItems}
=======
>>>>>>> 16d1217 (use remote App.jsx)
          onClick={({ key }) => navigate(key)}
          items={[
            { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
            { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
            { key: '/diagnosis', icon: <ExperimentOutlined />, label: '诊断测评' },
            { key: '/learning', icon: <NodeIndexOutlined />, label: '学习路径' },
            { key: '/profile', icon: <UserOutlined />, label: '个人中心' },
          ]}
        />
      </Sider>

      <Layout>
<<<<<<< HEAD
        <Header style={{
          background: isDark ? '#141414' : '#fff',
          padding: '0 24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
          position: 'relative',
          zIndex: 10,
          height: 'auto',
          minHeight: 64,
          lineHeight: 1,
        }}>
          <Title level={5} style={{ margin: 0, lineHeight: 1.3 }}>
            基于知识图谱的个性化学习伴侣
          </Title>
          <div style={headerActionsStyle}>
            <Button
              type="text"
              shape="circle"
              title={themeButtonTitle}
              aria-label={themeButtonTitle}
              onMouseDown={handleThemePressStart}
              onMouseUp={handleThemePressEnd}
              onMouseLeave={handleThemePressEnd}
              onTouchStart={handleThemePressStart}
              onTouchEnd={handleThemePressEnd}
              onClick={handleThemeClick}
              icon={
                <span className="disco-btn-icon">
                  {themeButtonIcon}
                </span>
              }
              style={{
                ...headerIconButtonStyle,
                transition: 'transform 0.3s ease',
                transform: discoMode ? 'rotate(12deg)' : 'rotate(0deg)',
                outline: discoMode ? '2px solid #ff0080' : 'none',
              }}
=======
        <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5}>CyberLinkage</Title>

          <Space>
            <Button
              shape="circle"
              onMouseDown={handlePressStart}
              onMouseUp={handlePressEnd}
              onClick={toggleTheme}
              icon={
                discoMode
                  ? <img src="/disco.gif" style={{ width: 20 }} />
                  : isDark
                    ? <SunOutlined />
                    : <MoonOutlined />
              }
>>>>>>> 16d1217 (use remote App.jsx)
            />

            {isAuthenticated() ? (
              <>
<<<<<<< HEAD
                {user?.role === 'teacher' && (
                    <Tag color="blue" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', height: 24 }}>
                      👨‍🏫 Teacher Mode
                    </Tag>
                )}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: userMenuItems,
                    onClick: ({ key }) => {
                      if (key === 'logout') handleLogout()
                    },
                  }}
                >
                  <Avatar
                    style={{
                      backgroundColor: discoMode ? '#ff0080' : '#1677ff',
                      transition: 'background 0.15s',
                      flex: '0 0 auto',
                      cursor: 'pointer',
                    }}
                  >
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </Avatar>
                </Dropdown>
=======
                <Avatar src={user?.avatar}>
                  {!user?.avatar && user?.username?.[0]}
                </Avatar>
                <Button icon={<LogoutOutlined />} onClick={logout} />
>>>>>>> 16d1217 (use remote App.jsx)
              </>
            ) : (
              <Button>登录</Button>
            )}
          </div>
        </Header>

        <Content style={{ margin: 24 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
<<<<<<< HEAD
            <Route path="/path" element={<LearningPath />} />
            <Route path="/chat" element={<Chat />} />
            <Route
              path="/teacher"
              element={(
                <TeacherOnlyRoute>
                  <TeacherUpload />
                </TeacherOnlyRoute>
              )}
            />
            <Route path="/sandbox" element={<Sandbox />} />
=======
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/learning" element={<LearningPath />} />
            <Route path="/profile" element={<Profile />} />
>>>>>>> 16d1217 (use remote App.jsx)
          </Routes>
        </Content>
      </Layout>

      <AuthModal />
    </Layout>
  )
}
