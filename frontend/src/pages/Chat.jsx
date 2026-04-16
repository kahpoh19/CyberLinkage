import React, { useState, useRef, useEffect } from 'react'
import { Card, Input, Button, Switch, Typography, Space } from 'antd'
import SendOutlined from '@ant-design/icons/es/icons/SendOutlined'
import RobotOutlined from '@ant-design/icons/es/icons/RobotOutlined'
import ChatBubble from '../components/ChatBubble'
import { chatWithAI } from '../api'
import useUserStore from '../store/userStore'

const { Title, Text } = Typography

export default function Chat() {
  const messages = useUserStore((s) => s.chatMessages)
  const addChatMessage = useUserStore((s) => s.addChatMessage)
  const socraticMode = useUserStore((s) => s.socraticMode)
  const setSocraticMode = useUserStore((s) => s.setSocraticMode)
  const loading = useUserStore((s) => s.chatLoading)
  const setChatLoading = useUserStore((s) => s.setChatLoading)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    }
    addChatMessage(userMsg)
    setInput('')
    setChatLoading(true)

    try {
      const history = messages.map((m) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }))
      const res = await chatWithAI(text, socraticMode ? 'socratic' : 'explain', history)
      const aiMsg = {
        role: 'ai',
        content: res.data.response || res.data.message || '抱歉，我暂时无法回答这个问题。',
        timestamp: new Date().toLocaleTimeString(),
      }
      addChatMessage(aiMsg)
    } catch (e) {
      const detail =
        e.response?.data?.detail ||
        e.response?.data?.message ||
        e.response?.data?.response ||
        e.message ||
        '网络错误，请稍后重试。'

      addChatMessage({
        role: 'ai',
        content: `⚠️ ${detail}`,
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined /> AI 答疑
        </Title>
        <Space>
          <Text type="secondary">苏格拉底式引导</Text>
          <Switch
            checked={socraticMode}
            onChange={setSocraticMode}
            checkedChildren="引导"
            unCheckedChildren="直答"
          />
        </Space>
      </div>

      <Card
        style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}
        bodyStyle={{ padding: 16 }}
      >
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            message={msg.content}
            isUser={msg.role === 'user'}
            timestamp={msg.timestamp}
          />
        ))}
        {loading && (
          <ChatBubble message="正在思考中..." isUser={false} timestamp="" />
        )}
        <div ref={messagesEndRef} />
      </Card>

      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={handleSend}
          placeholder="输入你的问题..."
          size="large"
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          size="large"
          onClick={handleSend}
          loading={loading}
        >
          发送
        </Button>
      </div>
    </div>
  )
}
