import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout, Menu, Typography, Avatar, Button, Modal, Form, Input, Drawer,
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
import DownOutlined from '@ant-design/icons/es/icons/DownOutlined'
import MenuOutlined from '@ant-design/icons/es/icons/MenuOutlined'

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
import { login, register, getDeviceContext, getMe } from './api'
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined'
import { getAvatarUrl, getDisplayName } from './utils/user'

const { Sider, Content, Header } = Layout
const { Title, Text } = Typography
const SIDER_WIDTH = 200
const SIDER_COLLAPSED_WIDTH = 80
const BANANA_SLIDES_PATH = '/banana-slides/'

const menuItems = [
  { key: '/', icon: <DashboardOutlined style={{ background: 'linear-gradient(135deg,#60a5fa,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />, label: '仪表盘' },
  { key: '/diagnosis', icon: <ExperimentOutlined />, label: '诊断测评' },
  { key: '/graph', icon: <ApartmentOutlined style={{ background: 'linear-gradient(135deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />, label: '知识图谱' },
  { key: '/path', icon: <NodeIndexOutlined />, label: '学习路径' },
  { key: '/chat', icon: <RobotOutlined />, label: 'AI 答疑' },
  { key: BANANA_SLIDES_PATH, icon: <ReadOutlined />, label: '蕉幻 PPT' },
  { key: '/student-resources', icon: <FileTextOutlined style={{ background: 'linear-gradient(135deg,#fb923c,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />, label: '学生资料' },
  { key: '/teacher', icon: <BookOutlined />, label: '教师上传' },
  { key: '/sandbox', icon: <ToolOutlined />, label: '实战工坊' },
  { key: '/profile', icon: <UserOutlined />, label: '个人中心' },
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
  const navigate = useNavigate()
  const currentSubject = useUserStore(s => s.currentSubject)
  const isMobileLayout = useUserStore(s => s.deviceInfo?.isMobileLayout)
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
  if (isMobileLayout) {
    return (
      <div style={{ textAlign: 'center', marginTop: 80, padding: '0 24px' }}>
        <div style={{ fontSize: 46, marginBottom: 16 }}>📱</div>
        <Title level={3}>实战工坊暂不建议在移动端编辑</Title>
        <Text type="secondary" style={{ fontSize: 15 }}>
          该模块包含拖拽建模、画布缩放和机构参数面板，当前已对全站做移动端适配，但实战工坊编辑器仍建议在桌面端使用。
        </Text>
        <div style={{ marginTop: 20 }}>
          <Button type="primary" onClick={() => navigate('/')}>返回首页</Button>
        </div>
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


function SubjectBar({ subjects, currentSubject, onSelect, onAdd, onRemove, isDark, isMobileLayout }) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState(null)
  const wrapperRef = useRef(null)

  const activeIndex = Math.max(subjects.findIndex(s => s.id === currentSubject), 0)
  const activeSubject = subjects[activeIndex] || subjects[0]
  const activeTheme = getSubjectTheme(activeSubject?.id, activeIndex)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={wrapperRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <ReadOutlined
        style={{
          color: isDark ? 'rgba(255,255,255,0.45)' : '#6366f1',
          fontSize: 15,
          flexShrink: 0,
          marginRight: 2,
          display: isMobileLayout ? 'none' : 'inline-flex',
        }}
      />

      {/* 当前选中学科按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minWidth: isMobileLayout ? 0 : 180,
          maxWidth: isMobileLayout ? '100%' : 260,
          width: isMobileLayout ? '100%' : 'auto',
          height: 36,
          padding: '0 14px',
          borderRadius: 12,
          cursor: 'pointer',
          border: `1px solid ${activeTheme.border}`,
          background: activeTheme.gradient,
          color: '#fff',
          boxShadow: `0 0 14px ${activeTheme.glow}, 0 0 28px ${activeTheme.glowSoft}`,
          fontSize: 14,
          fontWeight: 700,
          transition: 'all 0.2s ease',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            textAlign: 'left',
          }}
        >
          {activeSubject?.label || '机械原理'}
        </span>
        <DownOutlined
          style={{
            fontSize: 12,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* 下拉展开面板 */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: isMobileLayout ? 0 : 24,
            right: isMobileLayout ? 0 : 'auto',
            width: isMobileLayout ? '100%' : 320,
            maxHeight: 420,
            overflowY: 'auto',
            padding: 12,
            borderRadius: 16,
            background: isDark ? 'rgba(10,14,28,0.96)' : 'rgba(255,255,255,0.96)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(99,102,241,0.14)'}`,
            boxShadow: isDark
              ? '0 18px 50px rgba(0,0,0,0.45)'
              : '0 18px 50px rgba(15,23,42,0.16)',
            backdropFilter: 'blur(14px)',
            zIndex: 200,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 10,
              color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(55,65,81,0.7)',
            }}
          >
            选择学科
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subjects.map((s, idx) => {
              const isSelected = s.id === currentSubject
              const isHovered = hoveredId === s.id
              const theme = getSubjectTheme(s.id, idx)

              return (
                <div
                  key={s.id}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    <button
                      onClick={() => {
                        onSelect(s.id)
                        setOpen(false)
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minWidth: 0,
                        height: 46,
                        padding: '0 44px 0 14px', // 右边留空间给叉号
                        borderRadius: 999,
                        border: `1px solid ${theme.border}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        ...(isSelected
                          ? {
                            background: theme.gradient,
                            color: '#fff',
                            boxShadow: `0 0 12px ${theme.glow}, 0 0 24px ${theme.glowSoft}`,
                            fontWeight: 700,
                          }
                          : {
                            background: theme.glowSoft,
                            color: theme.primary,
                            fontWeight: 600,
                          }),
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textAlign: 'left',
                        }}
                      >
                        {s.label}
                      </span>
                    </button>

                    <Popconfirm
                      title={<span style={{ color: '#f87171' }}>⚠ 删除学科「{s.label}」</span>}
                      description={
                        <div style={{ maxWidth: 260 }}>
                          <div style={{ color: isDark ? '#fca5a5' : '#b91c1c', marginBottom: 6 }}>
                            删除后该学科下的所有数据将被清空，且无法恢复。
                          </div>
                          <div style={{ color: isDark ? '#d1d5db' : '#374151', fontSize: 12 }}>
                            确定要删除吗？
                          </div>
                        </div>
                      }
                      onConfirm={() => {
                        onRemove(s.id)
                        if (s.id === currentSubject) {
                          setOpen(false)
                        }
                      }}
                      okText="确认删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: 'none',
                          background: isHovered ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.14)',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: 14,
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        ×
                      </button>
                    </Popconfirm>
                  </div>
                </div>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.10)'}`,
            }}
          >
            <button
              onClick={() => setAddModalOpen(true)}
              style={{
                width: '100%',
                height: 38,
                borderRadius: 12,
                border: `1px dashed ${isDark ? 'rgba(255,255,255,0.20)' : 'rgba(99,102,241,0.35)'}`,
                background: 'transparent',
                color: isDark ? 'rgba(255,255,255,0.78)' : '#4f46e5',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.18s ease',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
              添加新学科
            </button>
          </div>
        </div>
      )}

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
    deviceInfo, setDeviceInfo,
  } = useUserStore()

  const [siderCollapsed, setSiderCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 992
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isDark = resolvedTheme === 'dark'
  const longPressTimer = useRef(null)
  const longPressTriggered = useRef(false)
  const discoIntervalRef = useRef(null)
  const overlayRef = useRef(null)
  const hasToken = isAuthenticated()
  const isTeacher = user?.role === 'teacher'
  const isMobileLayout = deviceInfo?.isMobileLayout
  const isCompactLayout = deviceInfo?.isCompactLayout

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
    let cancelled = false

    getDeviceContext()
      .then((res) => {
        if (cancelled) return
        setDeviceInfo({
          serverDeviceType: res.data?.device_type,
          serverPlatform: res.data?.platform,
          serverBrowser: res.data?.browser,
          detectionSource: res.data?.detected_from,
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [setDeviceInfo])

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

  useEffect(() => {
    setMobileNavOpen(false)
    if (isMobileLayout) {
      setSiderCollapsed(true)
    }
  }, [location.pathname, isMobileLayout])

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
  const desktopMarginLeft = isMobileLayout ? 0 : siderWidth

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
  const handleMenuNavigate = ({ key }) => {
    setMobileNavOpen(false)
    if (key === BANANA_SLIDES_PATH) {
      window.location.assign(BANANA_SLIDES_PATH)
      return
    }
    navigate(key)
  }
  const menuNode = (
    <Menu
      mode="inline"
      theme={isDark ? 'dark' : 'light'}
      selectedKeys={[location.pathname]}
      items={visibleMenuItems}
      onClick={handleMenuNavigate}
    />
  )

  return (
    <Layout
      className={`cy-app-shell page-theme-${pageThemeKey}`}
      style={{ minHeight: '100dvh', position: 'relative' }}
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
          fontSize: isMobileLayout ? 12 : 14,
          fontWeight: 600,
          color: '#fff',
          letterSpacing: isMobileLayout ? 2 : 4,
          pointerEvents: 'none',
        }}>
          🕺 DISCO MODE 🕺
        </div>
      )}

      {discoMode && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9998, pointerEvents: 'none',
        }}>
          <img src="/disco.gif" alt="disco" style={{ width: isMobileLayout ? 220 : 320, borderRadius: 16, opacity: 0.92 }} />
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

  /* ========================================= */
  /* 新增：侧边栏菜单项的高级渐变色 (不重复色系) */
  /* ========================================= */
  
  /* 仪表盘：Auroral Blue 到 Deep Purple 渐变 */
  .menu-item-dashboard .anticon, .menu-item-dashboard .ant-menu-title-content {
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  /* 知识图谱：Neon Green 到 Cyan 渐变 */
  .menu-item-graph .anticon, .menu-item-graph .ant-menu-title-content {
    background: linear-gradient(135deg, #34d399, #22d3ee);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  /* 学生资料：Bright Orange 到 Magenta 渐变 */
  .menu-item-resources .anticon, .menu-item-resources .ant-menu-title-content {
    background: linear-gradient(135deg, #fb923c, #f472b6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .cy-mobile-drawer .ant-drawer-body {
    padding: 0;
    background: ${isDark ? 'rgba(10,13,20,0.96)' : 'rgba(255,255,255,0.96)'};
  }
`}</style>

      {!isMobileLayout && (
        <Sider
          className="cy-app-sider"
          breakpoint="lg"
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          theme={isDark ? 'dark' : 'light'}
          style={{ position: 'fixed', top: 0, bottom: 0, left: 0, height: '100dvh', overflowY: 'auto', zIndex: 20 }}
        >
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Title level={4} style={{ margin: 0, color: discoMode ? '#ff0080' : '#1677ff', transition: 'color 0.15s' }}>
              {discoMode ? '🕺 CyberLinkage' : '🧠 CyberLinkage'}
            </Title>
          </div>
          {menuNode}
        </Sider>
      )}

      {isMobileLayout && (
        <Drawer
          className="cy-mobile-drawer"
          placement="left"
          width={284}
          closable={false}
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ padding: '18px 18px 12px' }}>
            <Title level={4} style={{ margin: 0, color: discoMode ? '#ff0080' : '#1677ff' }}>
              {discoMode ? '🕺 CyberLinkage' : '🧠 CyberLinkage'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {deviceInfo?.deviceLabel || '移动端'}
            </Text>
          </div>
          {menuNode}
        </Drawer>
      )}

      <Layout
        className="cy-main-layout"
        style={{ marginLeft: desktopMarginLeft, minHeight: '100dvh', transition: 'margin-left 0.2s' }}
      >
        <Header
          className="cy-app-header"
          style={{
            background: 'var(--cy-header-bg)',
            padding: isMobileLayout ? '12px' : '0 16px 0 20px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, width: isMobileLayout ? '100%' : 'auto' }}>
            {isMobileLayout && (
              <Button
                type="text"
                shape="circle"
                icon={<MenuOutlined />}
                onClick={() => setMobileNavOpen(true)}
                style={{ flexShrink: 0 }}
              />
            )}
            <SubjectBar
              subjects={subjects}
              currentSubject={currentSubject}
              onSelect={(id) => {
                setCurrentSubject(id)
                if (location.pathname === '/sandbox' && id !== 'mechanics') {
                  navigate('/')
                  message.info('实战工坊功能目前仅针对机械原理学科开放，已自动返回首页。')
                }
              }}
              onAdd={addSubject}
              onRemove={handleRemoveSubject}
              isDark={isDark}
              isMobileLayout={isMobileLayout}
            />
          </div>

          {/* ── 右侧操作区 ─────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: isMobileLayout ? 'auto' : 0 }}>
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
                {user?.role === 'teacher' && !isCompactLayout && (
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
              <Button type="primary" onClick={openAuthModal} size={isMobileLayout ? 'middle' : 'middle'}>
                登录
              </Button>
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
