import React, { useRef, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Space, Tooltip, Modal, Form, Input, message, Radio, Tag } from 'antd'
import {
  DashboardOutlined, ExperimentOutlined, ApartmentOutlined,
  NodeIndexOutlined, RobotOutlined, LogoutOutlined,
  SunOutlined, MoonOutlined,BookOutlined
} from '@ant-design/icons'


import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import TeacherUpload from './pages/TeacherUpload'
import useUserStore from './store/userStore'
import { login, register, getMe } from './api'

const { Sider, Content, Header } = Layout
const { Title } = Typography

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/diagnosis', icon: <ExperimentOutlined />, label: '诊断测评' },
  { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
  { key: '/path', icon: <NodeIndexOutlined />, label: '学习路径' },
  { key: '/chat', icon: <RobotOutlined />, label: 'AI 答疑' },
  { key: '/teacher', icon: <BookOutlined />, label: '教师上传' },
]

const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

// ── Auth Modal (lifted here so both header button and Dashboard can open it) ──
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
  const { user, logout, isAuthenticated, theme, toggleTheme, discoMode, activateDisco, openAuthModal } = useUserStore()

  const isDark = theme === 'dark'
  const longPressTimer = useRef(null)
  const discoIntervalRef = useRef(null)
  const overlayRef = useRef(null)

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
    clearTimeout(longPressTimer.current)
    toggleTheme()
  }

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
                {user?.role === 'teacher' && (
                    <Tag color="blue" style={{ margin: 0 }}>
                      👨‍🏫 Teacher Mode
                    </Tag>
                )}
                <Avatar style={{ backgroundColor: discoMode ? '#ff0080' : '#1677ff', transition: 'background 0.15s' }}>
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <span>{user?.username}</span>
                <Button type="text" icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/') }} />
              </>
            ) : (
              <Button type="primary" onClick={openAuthModal}>登录</Button>
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
            <Route path="/teacher" element={<TeacherUpload />} />
          </Routes>
        </Content>
      </Layout>

      {/* Single AuthModal instance for the whole app */}
      <AuthModal />
    </Layout>
  )
}