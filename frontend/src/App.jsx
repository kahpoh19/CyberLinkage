import React, { useRef, useEffect, useState } from 'react'
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
import BookOutlined from '@ant-design/icons/es/icons/BookOutlined'
import ToolOutlined from '@ant-design/icons/es/icons/ToolOutlined'
import FileTextOutlined from '@ant-design/icons/es/icons/FileTextOutlined'

import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import TeacherUpload from './pages/TeacherUpload'
import StudentResources from './pages/StudentResources'
import useUserStore from './store/userStore'
import { login, register, getMe } from './api'
import Sandbox from './pages/Sandbox'
import Profile from './pages/Profile'
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined'
import { getAvatarUrl, getDisplayName } from './utils/user'

const { Sider, Content, Header } = Layout
const { Title } = Typography
const SIDER_WIDTH = 200
const SIDER_COLLAPSED_WIDTH = 80

const menuItems = [
  { key: '/',                   icon: <DashboardOutlined />,  label: '仪表盘'  },
  { key: '/diagnosis',          icon: <ExperimentOutlined />, label: '诊断测评' },
  { key: '/graph',              icon: <ApartmentOutlined />,  label: '知识图谱' },
  { key: '/path',               icon: <NodeIndexOutlined />,  label: '学习路径' },
  { key: '/chat',               icon: <RobotOutlined />,      label: 'AI 答疑'  },
  { key: '/student-resources',  icon: <FileTextOutlined />,   label: '学生资料' },
  { key: '/teacher',            icon: <BookOutlined />,       label: '教师上传' },
  { key: '/sandbox',            icon: <ToolOutlined />,       label: '实战工坊' },
  { key: '/profile',            icon: <UserOutlined />,       label: '个人中心' },
]

const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

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

// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal() {
  const { showAuthModal, closeAuthModal, login: storeLogin, setUser } = useUserStore()
  const [isRegister, setIsRegister] = useState(false)
  const [form] = Form.useForm()

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
    <Modal
      title={isRegister ? '注册' : '登录'}
      open={showAuthModal}
      onCancel={handleClose}
      footer={null}
      destroyOnClose
    >
      <Form form={form} onFinish={handleAuth} layout="vertical" style={{ marginTop: 8 }} initialValues={{ role: 'student' }}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input />
        </Form.Item>
        {isRegister && (
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input />
          </Form.Item>
        )}
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
          <Input.Password />
        </Form.Item>

        {isRegister && (
          <Form.Item name="role" label="身份">
            <Radio.Group>
              <Radio.Button value="student">👨‍🎓 学生 (Student)</Radio.Button>
              <Radio.Button value="teacher">👨‍🏫 教师 (Teacher)</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}

        <Button type="primary" htmlType="submit" block>
          {isRegister ? '注册' : '登录'}
        </Button>
        <Button type="link" block onClick={() => { form.resetFields(); setIsRegister(!isRegister) }}>
          {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
        </Button>
      </Form>
    </Modal>
  )
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
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

  const [siderCollapsed, setSiderCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 992
  )
  const isDark = resolvedTheme === 'dark'
  const longPressTimer = useRef(null)
  const longPressTriggered = useRef(false)
  const discoIntervalRef = useRef(null)
  const overlayRef = useRef(null)
  const hasToken = isAuthenticated()
  const isTeacher = user?.role === 'teacher'

  // ── Sidebar visibility rules ──────────────────────────────────────────────
  // /teacher           → teachers only
  // /student-resources → non-teachers (students + guests)
  // /profile           → authenticated users only
  // everything else    → always visible
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.key === '/teacher')           return isTeacher
    if (item.key === '/student-resources') return !isTeacher
    if (item.key === '/profile')           return hasToken
    return true
  })

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

  const handleThemePressStart = () => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      activateDisco()
    }, 800)
  }

  const handleThemePressEnd = () => {
    clearTimeout(longPressTimer.current)
  }

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

  const currentThemeLabel = isDark ? 'Dark' : 'Light'
  const nextThemeLabel = isDark ? 'Light' : 'Dark'
  const themeButtonTitle = discoMode
    ? 'DISCO!'
    : `${currentThemeLabel}，点击切换到 ${nextThemeLabel}，长按开启 DISCO MODE`
  const themeButtonIcon = discoMode
    ? <span style={{ fontSize: 18 }}>🪩</span>
    : isDark
      ? <MoonOutlined style={{ fontSize: 18, color: '#f0f0f0' }} />
      : <SunOutlined style={{ fontSize: 18, color: '#faad14' }} />
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
  const siderWidth = siderCollapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH
  const siderStyle = {
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    height: '100vh',
    overflowY: 'auto',
    zIndex: 20,
    ...(discoMode ? { filter: 'hue-rotate(var(--disco-hue, 0deg))' } : {}),
  }
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: (
        <div style={{ minWidth: 120, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600 }}>{getDisplayName(user) || 'User'}</div>
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

  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>

      {/* Disco overlay */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed', inset: 0,
          opacity: 0,
          pointerEvents: discoMode ? 'auto' : 'none',
          zIndex: 9999,
          transition: 'background 0.12s ease, opacity 0.3s ease',
          mixBlendMode: 'screen',
          cursor: discoMode ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (discoMode) useUserStore.getState().deactivateDisco()
        }}
      />

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

      {discoMode && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998,
          pointerEvents: 'none',
        }}>
          <img
            src="/disco.gif"
            alt="disco"
            style={{ width: 320, borderRadius: 16, opacity: 0.92 }}
          />
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
        width={SIDER_WIDTH}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        collapsed={siderCollapsed}
        onCollapse={setSiderCollapsed}
        theme={isDark ? 'dark' : 'light'}
        style={siderStyle}
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
          items={visibleMenuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout
        style={{
          marginLeft: siderWidth,
          minHeight: '100vh',
          transition: 'margin-left 0.2s',
        }}
      >
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
            />

            {isAuthenticated() ? (
              <>
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
                      if (key === 'profile') navigate('/profile')
                      if (key === 'logout') handleLogout()
                    },
                  }}
                >
                  <Avatar
                    src={getAvatarUrl(user?.avatar)}
                    style={{
                      backgroundColor: discoMode ? '#ff0080' : '#1677ff',
                      transition: 'background 0.15s',
                      flex: '0 0 auto',
                      cursor: 'pointer',
                    }}
                  >
                    {!user?.avatar && (getDisplayName(user)?.[0]?.toUpperCase() || 'U')}
                  </Avatar>
                </Dropdown>
              </>
            ) : (
              <Button type="primary" onClick={openAuthModal}>登录</Button>
            )}
          </div>
        </Header>

        <Content style={{ margin: '24px', minHeight: 280 }}>
          <Routes>
            <Route path="/"                    element={<Dashboard />} />
            <Route path="/diagnosis"           element={<Diagnosis />} />
            <Route path="/graph"               element={<KnowledgeGraph />} />
            <Route path="/path"                element={<LearningPath />} />
            <Route path="/chat"                element={<Chat />} />
            <Route path="/student-resources"   element={<StudentResources />} />
            <Route
              path="/profile"
              element={isAuthenticated() ? <Profile /> : <Navigate to="/" replace />}
            />
            <Route
              path="/teacher"
              element={(
                <TeacherOnlyRoute>
                  <TeacherUpload />
                </TeacherOnlyRoute>
              )}
            />
            <Route path="/sandbox" element={<Sandbox />} />
          </Routes>
        </Content>
      </Layout>

      {/* Single AuthModal instance for the whole app */}
      <AuthModal />
    </Layout>
  )
}