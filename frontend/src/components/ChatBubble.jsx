import React from 'react'
import { Avatar, Typography } from 'antd'
import UserOutlined from '@ant-design/icons/es/icons/UserOutlined'
import RobotOutlined from '@ant-design/icons/es/icons/RobotOutlined'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import useUserStore from '../store/userStore'

const { Text } = Typography
const htmlBreakPattern = /^<br\s*\/?>$/i

function remarkHtmlLineBreaks() {
  return (tree) => {
    replaceHtmlBreaks(tree)
  }
}

function replaceHtmlBreaks(node) {
  if (!node || !Array.isArray(node.children)) return

  node.children = node.children.map((child) => {
    if (child?.type === 'html' && htmlBreakPattern.test(String(child.value || '').trim())) {
      return { type: 'break' }
    }

    replaceHtmlBreaks(child)
    return child
  })
}

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
  const isMobileLayout = useUserStore((s) => s.deviceInfo?.isMobileLayout)

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
          maxWidth: isMobileLayout ? '88%' : '70%',
          padding: isMobileLayout ? '10px 12px' : '10px 14px',
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
              remarkPlugins={[remarkGfm, remarkHtmlLineBreaks]}
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
                table: ({ children }) => (
                  <div style={{ margin: '0 0 12px', overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: isMobileLayout ? 320 : 420,
                        borderCollapse: 'collapse',
                        border: '1px solid rgba(148, 163, 184, 0.45)',
                        background: '#fff',
                        fontSize: 13,
                      }}
                    >
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead style={{ background: 'rgba(241, 245, 249, 0.95)' }}>{children}</thead>
                ),
                th: ({ align, children }) => (
                  <th
                    style={{
                      padding: '8px 10px',
                      border: '1px solid rgba(148, 163, 184, 0.45)',
                      color: '#0f172a',
                      fontWeight: 700,
                      textAlign: align || 'left',
                      verticalAlign: 'top',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ align, children }) => (
                  <td
                    style={{
                      padding: '8px 10px',
                      border: '1px solid rgba(148, 163, 184, 0.38)',
                      textAlign: align || 'left',
                      verticalAlign: 'top',
                    }}
                  >
                    {children}
                  </td>
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
