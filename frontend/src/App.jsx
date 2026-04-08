import React from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Avatar, Button, Space } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  RobotOutlined,
  LogoutOutlined,
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

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isAuthenticated } = useUserStore()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="80"
        style={{ background: '#fff' }}
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
            🧠 CyberLinkage
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            基于知识图谱的个性化学习伴侣
          </Title>
          <Space>
            {isAuthenticated() ? (
              <>
                <Avatar style={{ backgroundColor: '#1677ff' }}>
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <span>{user?.username}</span>
                <Button
                  type="text"
                  icon={<LogoutOutlined />}
                  onClick={() => { logout(); navigate('/') }}
                />
              </>
            ) : (
              <Button type="primary" onClick={() => navigate('/')}>
                登录
              </Button>
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
