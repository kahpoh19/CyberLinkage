import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout, Menu, Typography, Avatar, Button, Modal, Form, Input,
  message, Radio, Tag, Dropdown, Select, Popconfirm, Tooltip,
} from 'antd'
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
import ReadOutlined from '@ant-design/icons/es/icons/ReadOutlined'
import PlusOutlined from '@ant-design/icons/es/icons/PlusOutlined'
import DeleteOutlined from '@ant-design/icons/es/icons/DeleteOutlined'
import WarningOutlined from '@ant-design/icons/es/icons/WarningOutlined'

import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import TeacherUpload from './pages/TeacherUpload'
import StudentResources from './pages/StudentResources'
import Sandbox from './pages/Sandbox'
import Profile from './pages/Profile'
import useUserStore from './store/userStore'
import { getSubjectTheme, getSubjectTagStyle } from './utils/subjectTheme'
import { login, register, getMe } from './api'
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined'
import { getAvatarUrl, getDisplayName } from './utils/user'

const { Sider, Content, Header } = Layout
const { Title, Text } = Typography
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
  // 实战工坊 — 仅机械原理科目下可见（在 visibleMenuItems 中过滤）
  { key: '/sandbox',            icon: <ToolOutlined />,       label: '实战工坊' },
  { key: '/profile',            icon: <UserOutlined />,       label: '个人中心' },
]

const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

function getPageThemeKey(pathname) {
  if (pathname === '/') return 'dashboard'
  if (pathname.startsWith('/diagnosis')) return 'diagnosis'
  if (pathname.startsWith('/graph')) return 'graph'
  if (pathname.startsWith('/path')) return 'path'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/student-resources')) return 'student-resources'
  if (pathname.startsWith('/teacher')) return 'teacher'
  if (pathname.startsWith('/sandbox')) return 'sandbox'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'dashboard'
}

// ── 实战工坊路由守卫 ──────────────────────────────────────────────
function SandboxRoute({ children }) {
  const currentSubject = useUserStore(s => s.currentSubject)
  if (currentSubject !== 'mechanics') {
    return (
      <div style={{ textAlign: 'center', marginTop: 120, padding: '0 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
        <Title level={3}>实战工坊仅限机械原理学科</Title>
        <Text type="secondary" style={{ fontSize: 15 }}>
          请在顶部科目栏切换至「机械原理」后再进入实战工坊。
        </Text>
        <br /><br />
        <Navigate to="/" replace />
      </div>
    )
  }
  return children
}

function TeacherOnlyRoute({ children }) {
  const { user, isAuthenticated } = useUserStore()
  if (isAuthenticated() && !user) {
    return <div style={{ textAlign: 'center', marginTop: 100 }}>正在验证身份...</div>
  }
  return user?.role === 'teacher' ? children : <Navigate to="/" replace />
}

// ── 新增科目弹窗 ──────────────────────────────────────────────────
function AddSubjectModal({ open, onClose, onAdd }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values) => {
    setLoading(true)
    const result = onAdd({ id: values.subject_id, label: values.label })
    setLoading(false)
    if (result?.success) {
      message.success(`科目「${values.label}」已添加`)
      form.resetFields()
      onClose()
    } else {
      message.error(result?.error || '添加失败')
    }
  }

  return (
    <Modal
      title="➕ 新增学科"
      open={open}
      onCancel={() => { form.resetFields(); onClose() }}
      footer={null}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 8 }}>
        <Form.Item
          name="label"
          label="学科名称"
          rules={[{ required: true, message: '请输入学科名称' }]}
        >
          <Input placeholder="例如：控制工程基础" />
        </Form.Item>
        <Form.Item
          name="subject_id"
          label="学科 ID（英文小写，用于系统标识）"
          rules={[
            { required: true, message: '请输入学科 ID' },
            { pattern: /^[a-z0-9_]+$/, message: '只能使用英文小写字母、数字和下划线' },
          ]}
        >
          <Input placeholder="例如：control_engineering" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          确认添加
        </Button>
      </Form>
    </Modal>
  )
}

// ── 科目栏组件（带渐变色、增删） ──────────────────────────────────
function SubjectBar({ subjects, currentSubject, onSelect, onAdd, onRemove, isDark }) {
  const [addModalOpen, setAddModalOpen] = useState(false)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      flex: 1,
      minWidth: 0,
    }}>
      <ReadOutlined style={{
        color: isDark ? 'rgba(255,255,255,0.45)' : '#6366f1',
        fontSize: 15,
        flexShrink: 0,
        marginRight: 2,
      }} />

      {subjects.map((s, idx) => {
        const isSelected = s.id === currentSubject
        const theme = getSubjectTheme(s.id, idx)
        const isBuiltin = s.builtin !== false  // builtin 默认视为 true

        return (
          <div key={s.id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              onClick={() => onSelect(s.id)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer',
                border: `1px solid ${theme.border}`,
                transition: 'all 0.22s ease',
                position: 'relative',
                overflow: 'hidden',
                // 渐变背景
                ...(isSelected ? {
                  background: theme.gradient,
                  color: '#ffffff',
                  boxShadow: `0 0 14px ${theme.glow}, 0 0 28px ${theme.glowSoft}`,
                } : {
                  background: isDark ? theme.glowSoft : `${theme.glowSoft}`,
                  color: theme.primary,
                }),
                paddingRight: !isBuiltin ? '28px' : '14px',
              }}
            >
              {s.label}
            </button>

            {/* 删除按钮（仅自定义科目显示） */}
            {!isBuiltin && (
              <Popconfirm
                title="删除学科"
                description={`确认删除「${s.label}」吗？`}
                onConfirm={() => onRemove(s.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <button
                  style={{
                    position: 'absolute',
                    right: 5,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(239,68,68,0.2)',
                    color: '#f87171',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    padding: 0,
                    zIndex: 1,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  ×
                </button>
              </Popconfirm>
            )}
          </div>
        )
      })}

      {/* 添加科目按钮 */}
      <Tooltip title="新增学科">
        <button
          onClick={() => setAddModalOpen(true)}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `1px dashed ${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(99,102,241,0.4)'}`,
            background: 'transparent',
            color: isDark ? 'rgba(255,255,255,0.45)' : '#6366f1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          +
        </button>
      </Tooltip>

      <AddSubjectModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={onAdd}
      />
    </div>
  )
}

// ── Auth Modal ────────────────────────────────────────────────────
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

// ── 主应用 ────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user, logout, setUser, isAuthenticated,
    theme, resolvedTheme, toggleTheme,
    discoMode, activateDisco, openAuthModal,
    currentSubject, setCurrentSubject,
    subjects, addSubject, removeSubject,
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

  // 实战工坊仅机械原理可见
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.key === '/teacher')           return isTeacher
    if (item.key === '/student-resources') return !isTeacher
    if (item.key === '/profile')           return hasToken
    if (item.key === '/sandbox')           return currentSubject === 'mechanics'
    return true
  })

  useEffect(() => {
    let cancelled = false
    if (!hasToken || user) return undefined
    getMe()
      .then((res) => { if (!cancelled) setUser(res.data) })
      .catch(() => { if (!cancelled) logout() })
    return () => { cancelled = true }
  }, [hasToken, user, setUser, logout])

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
  const handleThemePressEnd = () => clearTimeout(longPressTimer.current)
  const handleThemeClick = () => {
    clearTimeout(longPressTimer.current)
    if (longPressTriggered.current) { longPressTriggered.current = false; return }
    toggleTheme()
  }
  const handleLogout = () => { logout(); navigate('/') }

  // 删除科目时同步跳转
  const handleRemoveSubject = useCallback((subjectId) => {
    const result = removeSubject(subjectId)
    if (result.success) {
      message.success('科目已删除')
      if (location.pathname === '/sandbox' && subjectId === 'mechanics') {
        navigate('/')
      }
    } else {
      message.error(result.error || '删除失败')
    }
  }, [removeSubject, location.pathname, navigate])

  const themeButtonTitle = discoMode
    ? 'DISCO!'
    : `${isDark ? 'Dark' : 'Light'}，点击切换，长按开启 DISCO MODE`
  const themeButtonIcon = discoMode
    ? <span style={{ fontSize: 18 }}>🪩</span>
    : isDark
      ? <MoonOutlined style={{ fontSize: 18, color: '#f0f0f0' }} />
      : <SunOutlined style={{ fontSize: 18, color: '#faad14' }} />

  const siderWidth = siderCollapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH

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
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
  ]

  const pageThemeKey = getPageThemeKey(location.pathname)
  const currentTheme = getSubjectTheme(currentSubject)

  return (
    <Layout
      className={`cy-app-shell page-theme-${pageThemeKey}`}
      style={{ minHeight: '100vh', position: 'relative' }}
    >
      <div
        ref={overlayRef}
        style={{
          position: 'fixed', inset: 0, opacity: 0,
          pointerEvents: discoMode ? 'auto' : 'none',
          zIndex: 9999, transition: 'background 0.12s ease, opacity 0.3s ease',
          mixBlendMode: 'screen', cursor: discoMode ? 'pointer' : 'default',
        }}
        onClick={() => { if (discoMode) useUserStore.getState().deactivateDisco() }}
      />

      {discoMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
          textAlign: 'center', padding: '6px 0',
          background: 'linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#00cfff,#bf00ff,#ff0080)',
          backgroundSize: '200% 100%', animation: 'discoSlide 1s linear infinite',
          fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 4, pointerEvents: 'none',
        }}>
          🕺 DISCO MODE 🕺
        </div>
      )}

      {discoMode && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9998, pointerEvents: 'none',
        }}>
          <img src="/disco.gif" alt="disco" style={{ width: 320, borderRadius: 16, opacity: 0.92 }} />
        </div>
      )}

      <style>{`
        @keyframes discoSlide { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes discoPulse {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.3) rotate(-15deg); }
          75% { transform: scale(1.3) rotate(15deg); }
        }
        @keyframes subjectGlow {
          0%,100% { box-shadow: 0 0 10px ${currentTheme.glow}, 0 0 20px ${currentTheme.glowSoft}; }
          50%      { box-shadow: 0 0 22px ${currentTheme.glow}, 0 0 44px ${currentTheme.glowSoft}; }
        }
        @keyframes flowLight {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .disco-btn-icon { animation: ${discoMode ? 'discoPulse 0.4s ease-in-out infinite' : 'none'}; display: inline-flex; }
        /* 选中科目标签呼吸灯 */
        .subject-btn-selected {
          animation: subjectGlow 1.8s ease-in-out infinite !important;
        }
        /* 科目标签悬停流光 */
        .subject-btn:hover:not(.subject-btn-selected) {
          filter: brightness(1.18);
          transform: translateY(-1px);
        }
      `}</style>

      <Sider
        className="cy-app-sider"
        breakpoint="lg"
        width={SIDER_WIDTH}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        collapsed={siderCollapsed}
        onCollapse={setSiderCollapsed}
        theme={isDark ? 'dark' : 'light'}
        style={{ position: 'fixed', top: 0, bottom: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 20 }}
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
        className="cy-main-layout"
        style={{ marginLeft: siderWidth, minHeight: '100vh', transition: 'margin-left 0.2s' }}
      >
        <Header
          className="cy-app-header"
          style={{
            background: 'var(--cy-header-bg)',
            padding: '0 16px 0 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--cy-header-border)',
            position: 'relative',
            zIndex: 10,
            height: 'auto',
            minHeight: 64,
            lineHeight: 1,
          }}
        >
          {/* ── 科目栏（带渐变色 + 增删） ───────────────────────── */}
          <SubjectBar
            subjects={subjects}
            currentSubject={currentSubject}
            onSelect={(id) => {
              setCurrentSubject(id)
              // 如果当前在实战工坊但切换到非机械原理，重定向
              if (location.pathname === '/sandbox' && id !== 'mechanics') {
                navigate('/')
                message.info('实战工坊功能目前仅针对机械原理学科开放，已自动返回首页。')
              }
            }}
            onAdd={addSubject}
            onRemove={handleRemoveSubject}
            isDark={isDark}
          />

          {/* ── 右侧操作区 ─────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Button
              type="text"
              shape="circle"
              title={themeButtonTitle}
              onMouseDown={handleThemePressStart}
              onMouseUp={handleThemePressEnd}
              onMouseLeave={handleThemePressEnd}
              onTouchStart={handleThemePressStart}
              onTouchEnd={handleThemePressEnd}
              onClick={handleThemeClick}
              icon={<span className="disco-btn-icon">{themeButtonIcon}</span>}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, lineHeight: 1, padding: 0, borderRadius: '50%',
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
                      transition: 'background 0.15s', flex: '0 0 auto', cursor: 'pointer',
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

        <Content className="cy-route-content" style={{ minHeight: 280 }}>
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
              element={<TeacherOnlyRoute><TeacherUpload /></TeacherOnlyRoute>}
            />
            {/* 实战工坊 — 带科目守卫 */}
            <Route
              path="/sandbox"
              element={
                <SandboxRoute>
                  <Sandbox />
                </SandboxRoute>
              }
            />
          </Routes>
        </Content>
      </Layout>

      <AuthModal />
    </Layout>
  )
}