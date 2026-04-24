import React, { useEffect, useState } from 'react'
import { Modal, Button, Empty, Spin } from 'antd'
import ReactMarkdown from 'react-markdown'
import { getFileExtension, isMarkdownLikeFile, isPdfFile } from '../utils/resourceFiles'

export default function ResourcePreviewModal({
  open,
  file,
  onClose,
  getBlobUrl,
  onDownload,
  theme = 'light',
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const blobUrl = file ? getBlobUrl?.(file.id) : null
  const extension = getFileExtension(file?.name || file?.filename)
  const isDark = theme === 'dark'

  useEffect(() => {
    let cancelled = false

    setContent('')
    setError('')
    setLoading(false)

    if (!open || !file || !isMarkdownLikeFile(file)) return undefined

    if (file.previewText) {
      setContent(file.previewText)
      return undefined
    }

    if (!blobUrl) {
      setError('当前会话中没有可用的文本缓存，暂时无法直接预览。')
      return undefined
    }

    setLoading(true)
    fetch(blobUrl)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) {
          setContent(text)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('文件内容读取失败，请稍后重试。')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [blobUrl, file, open])

  const footer = [
    <Button
      key="download"
      onClick={() => onDownload?.(file)}
      disabled={!blobUrl}
    >
      下载
    </Button>,
    <Button
      key="open"
      onClick={() => blobUrl && window.open(blobUrl, '_blank', 'noopener,noreferrer')}
      disabled={!blobUrl}
    >
      新窗口打开
    </Button>,
    <Button key="close" type="primary" onClick={onClose}>
      关闭
    </Button>,
  ]

  return (
    <Modal
      title={file?.name || file?.filename || '资料预览'}
      open={open}
      onCancel={onClose}
      width={900}
      footer={footer}
      destroyOnClose
    >
      {loading ? (
        <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : isMarkdownLikeFile(file) ? (
        error ? (
          <Empty description={error} />
        ) : (
          <div
            style={{
              maxHeight: '65vh',
              overflowY: 'auto',
              padding: 16,
              borderRadius: 12,
              background: isDark ? 'rgba(15, 23, 42, 0.72)' : '#f8fafc',
              color: isDark ? '#e2e8f0' : '#1f2937',
            }}
          >
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p style={{ margin: '0 0 12px', lineHeight: 1.8 }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ol>
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
                        background: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)',
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
                      }}
                    >
                      {children}
                    </code>
                  )
                ),
                pre: ({ children }) => (
                  <pre style={{ margin: '0 0 12px' }}>{children}</pre>
                ),
              }}
            >
              {content || '暂无可预览的文本内容。'}
            </ReactMarkdown>
          </div>
        )
      ) : isPdfFile(file) && blobUrl ? (
        <iframe
          title={file?.name || file?.filename || 'PDF 预览'}
          src={blobUrl}
          style={{
            width: '100%',
            height: '70vh',
            border: 0,
            borderRadius: 12,
            background: '#fff',
          }}
        />
      ) : (
        <Empty
          description={
            blobUrl
              ? `暂不支持直接预览 .${extension || 'file'} 文件，可使用“新窗口打开”或“下载”。`
              : '当前会话中没有可用的文件实体，暂时无法直接预览。'
          }
        />
      )}
    </Modal>
  )
}
