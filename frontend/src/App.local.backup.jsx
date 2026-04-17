import React, { useRef, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Space, Tooltip, Modal, Form, Input, message, Radio } from 'antd'
import {
  DashboardOutlined, ExperimentOutlined, ApartmentOutlined,
  NodeIndexOutlined, LogoutOutlined,
  SunOutlined, MoonOutlined,
  UserOutlined, ReadOutlined, SolutionOutlined,
} from '@ant-design/icons'


import Dashboard from './pages/Dashboard'
import Diagnosis from './pages/Diagnosis'
import KnowledgeGraph from './pages/KnowledgeGraph'
import LearningPath from './pages/LearningPath'
import Chat from './pages/Chat'
import useUserStore from './store/userStore'
import { login, register, getMe } from './api'
import Profile from './pages/Profile'
import { getRoleLabel } from './utils/user'

const { Sider, Content, Header } = Layout
const { Title } = Typography

const DISCO_COLORS = [
  '#ff0080', '#ff4500', '#ffd700', '#00ff88',
  '#00cfff', '#bf00ff', '#ff69b4', '#ff6600',
]

/* ---------------- Auth Modal ---------------- */
function AuthModal() {
  const {
    showAuthModal,
    closeAuthModal,
    login: storeLogin,
    setUser,
  } = useUserStore()
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

      const me = await getProfile()
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
  const {
    user,
    token,
    logout,
    isAuthenticated,
    setUser,
    theme,
    toggleTheme,
    setTheme,
    discoMode,
    activateDisco,
    deactivateDisco,
    openAuthModal,
  } = useUserStore()

  const isDark = theme === 'dark'
  const longPressTimer = useRef(null)
  const discoIntervalRef = useRef(null)
  const discoTimeoutRef = useRef(null)
  const overlayRef = useRef(null)
  const discoActivatedAtRef = useRef(0)

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

      discoTimeoutRef.current = setTimeout(() => {
        deactivateDisco()
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
  }, [discoMode, deactivateDisco])

  useEffect(() => {
    if (!discoMode) return

    const exit = () => {
      // 避免刚进入 disco 的同一次点击立刻把它又退出
      if (Date.now() - discoActivatedAtRef.current < 250) return
      deactivateDisco()
    }

    const onKeyDown = () => exit()
    const onPointerDown = () => exit()

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('touchstart', onPointerDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('touchstart', onPointerDown, true)
    }
  }, [discoMode, deactivateDisco])

  const handlePressStart = () => {
    if (discoMode) return
    longPressTimer.current = setTimeout(() => {
      activateDisco()
    }, 800)
  }

  const handlePressEnd = () => {
    clearTimeout(longPressTimer.current)
  }

  const handleThemeClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false
      return
    }

    if (discoMode) {
      deactivateDisco()
    } else {
      toggleTheme()
    }
  }

  const roleLabel = getRoleLabel(user?.role)
  const roleIcon = user?.role === 'teacher' ? <SolutionOutlined /> : <ReadOutlined />

  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'screen',
        }}
      />

      {discoMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          width: '100%',
          zIndex: 10000,
          textAlign: 'center',
          background: 'linear-gradient(90deg,#ff0080,#ffd700,#00ff88,#00cfff)',
          color: '#fff',
        }}>
          🕺 DISCO MODE 🕺
        </div>
      )}

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
            pointerEvents: 'none',
          }}
        />
      )}

      <Sider theme={isDark ? 'dark' : 'light'}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 24,
            fontSize: 20,
            fontWeight: 700,
            color: isDark ? '#ffffff' : '#111111',
            borderBottom: isDark ? '1px solid #222' : '1px solid #eee',
          }}
        >
          CyberLinkage
        </div>

        <Menu
          selectedKeys={[location.pathname]}
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
        <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5}>CyberLinkage</Title>

          <Space
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
            }}
          >
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
            />

            {isAuthenticated() ? (
              <>
                <Avatar src={user?.avatar}>
                  {!user?.avatar && user?.username?.[0]}
                </Avatar>
                <Button icon={<LogoutOutlined />} onClick={logout} />
              </>
            ) : (
              <Button onClick={openAuthModal}>登录</Button>
            )}
          </Space>
        </Header>

        <Content style={{ margin: 24 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/learning" element={<LearningPath />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </Content>
      </Layout>

      <AuthModal />
    </Layout>
  )
}
