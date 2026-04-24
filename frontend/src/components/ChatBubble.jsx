import React from 'react'
import { Avatar, Typography } from 'antd'
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined'
import RobotOutlined from '@ant-design/icons/es/icons/RobotOutlined'
import ReactMarkdown from 'react-markdown'

const { Text } = Typography

/**
 * 聊天气泡组件
 *
 * Props:
 *   message: string — 消息内容
 *   isUser: boolean — 是否为用户消息
 *   timestamp: string — 时间戳
 */
export default function ChatBubble({ message, isUser, timestamp, isStreaming = false }) {
  const aiTextColor = '#1f2937'
  const userTextColor = '#fff'

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
          lineHeight: 1.6,
          fontSize: 14,
          boxShadow: isUser
            ? '0 10px 24px rgba(22, 119, 255, 0.16)'
            : '0 10px 24px rgba(15, 23, 42, 0.08)',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', color: userTextColor }}>
            {message}
          </div>
        ) : (
          <div style={{ color: aiTextColor }}>
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p style={{ margin: '0 0 10px', lineHeight: 1.75 }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 10px', paddingLeft: 18 }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: 6 }}>{children}</li>
                ),
                code: ({ inline, children }) => (
                  inline ? (
                    <code
                      style={{
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'rgba(15, 23, 42, 0.08)',
                        fontSize: 13,
                      }}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      style={{
                        display: 'block',
                        whiteSpace: 'pre-wrap',
                        padding: 12,
                        borderRadius: 10,
                        background: '#111827',
                        color: '#f8fafc',
                        fontSize: 13,
                        overflowX: 'auto',
                      }}
                    >
                      {children}
                    </code>
                  )
                ),
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 10px' }}>{children}</pre>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: '#111827' }}>{children}</strong>
                ),
              }}
            >
              {message || (isStreaming ? '正在思考中...' : '')}
            </ReactMarkdown>
            {isStreaming && !!message && (
              <span style={{ display: 'inline-block', marginLeft: 4, opacity: 0.55 }}>▍</span>
            )}
          </div>
        )}
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
