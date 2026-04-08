import React from 'react'
import { Avatar, Typography } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'

const { Text } = Typography

/**
 * 聊天气泡组件
 *
 * Props:
 *   message: string — 消息内容
 *   isUser: boolean — 是否为用户消息
 *   timestamp: string — 时间戳
 */
export default function ChatBubble({ message, isUser, timestamp }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 8,
      }}
    >
      <Avatar
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{
          backgroundColor: isUser ? '#1677ff' : '#87d068',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          maxWidth: '70%',
          padding: '10px 14px',
          borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
          backgroundColor: isUser ? '#1677ff' : '#f5f5f5',
          color: isUser ? '#fff' : '#333',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          fontSize: 14,
        }}
      >
        {message}
        {timestamp && (
          <div style={{ marginTop: 4, textAlign: 'right' }}>
            <Text
              style={{
                fontSize: 11,
                color: isUser ? 'rgba(255,255,255,0.6)' : '#999',
              }}
            >
              {timestamp}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}
