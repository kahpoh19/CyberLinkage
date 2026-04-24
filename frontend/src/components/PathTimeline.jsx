import React from 'react'
import { Button, Progress, Tag, Typography } from 'antd'
import CheckCircleOutlined from '@ant-design/icons/es/icons/CheckCircleOutlined'
import LockOutlined from '@ant-design/icons/es/icons/LockOutlined'
import PlayCircleOutlined from '@ant-design/icons/es/icons/PlayCircleOutlined'
import SyncOutlined from '@ant-design/icons/es/icons/SyncOutlined'

const { Paragraph, Text } = Typography

const STATUS_META = {
  completed: {
    label: '已掌握',
    accent: '#52c41a',
    soft: 'rgba(82,196,26,0.12)',
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  },
  'in-progress': {
    label: '学习中',
    accent: '#1677ff',
    soft: 'rgba(22,119,255,0.12)',
    icon: <SyncOutlined spin style={{ color: '#1677ff' }} />,
  },
  locked: {
    label: '待学习',
    accent: '#8c8c8c',
    soft: 'rgba(140,140,140,0.12)',
    icon: <LockOutlined style={{ color: '#8c8c8c' }} />,
  },
}

function getMasteryColor(mastery) {
  if (mastery >= 0.7) return '#52c41a'
  if (mastery >= 0.4) return '#faad14'
  return '#ff4d4f'
}

export default function PathTimeline({
  items = [],
  selectedId = null,
  onSelect,
  onStartPractice,
  isDark = false,
  isMobile = false,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((item, index) => {
        const meta = STATUS_META[item.status] || STATUS_META.locked
        const masteryPercent = Math.round((item.mastery || 0) * 100)
        const active = item.id === selectedId

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect?.(item)
              }
            }}
            style={{
              position: 'relative',
              width: '100%',
              border: active
                ? `1px solid ${meta.accent}`
                : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
              background: active
                ? `linear-gradient(135deg, ${meta.soft}, ${isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'})`
                : isDark
                  ? 'rgba(255,255,255,0.03)'
                  : '#ffffff',
              borderRadius: 18,
              padding: '18px 18px 16px 22px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
              boxShadow: active
                ? `0 14px 28px ${isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.08)'}`
                : 'none',
            }}
          >
            {index < items.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  left: 34,
                  top: 64,
                  bottom: -14,
                  width: 1,
                  background: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
                }}
              />
            )}

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div
                style={{
                  flex: '0 0 auto',
                  width: 24,
                  height: 24,
                  marginTop: 2,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: meta.soft,
                }}
              >
                {meta.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text
                        strong
                        style={{
                          fontSize: 16,
                          color: active ? meta.accent : undefined,
                        }}
                      >
                        {item.name}
                      </Text>
                      {item.chapter ? <Tag bordered={false}>第 {item.chapter} 章</Tag> : null}
                      {item.category ? <Tag bordered={false}>{item.category}</Tag> : null}
                      <Tag
                        bordered={false}
                        style={{
                          color: meta.accent,
                          background: meta.soft,
                          marginInlineEnd: 0,
                        }}
                      >
                        {meta.label}
                      </Tag>
                    </div>

                    {item.description ? (
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{
                          margin: '10px 0 0',
                          color: isDark ? 'rgba(255,255,255,0.65)' : '#475569',
                        }}
                      >
                        {item.description}
                      </Paragraph>
                    ) : null}
                  </div>

                  <div style={{ minWidth: isMobile ? '100%' : 128, display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
                    <Button
                      type={active ? 'primary' : 'default'}
                      icon={<PlayCircleOutlined />}
                      onClick={(event) => {
                        event.stopPropagation()
                        onStartPractice?.(item)
                      }}
                      style={{
                        borderRadius: 999,
                        height: 38,
                        paddingInline: 18,
                        fontWeight: 600,
                        boxShadow: active ? '0 10px 20px rgba(22,119,255,0.18)' : 'none',
                        width: isMobile ? '100%' : 'auto',
                      }}
                    >
                      开始做题
                    </Button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Progress
                      percent={masteryPercent}
                      showInfo={false}
                      size="small"
                      strokeColor={getMasteryColor(item.mastery || 0)}
                      trailColor={isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}
                    />
                  </div>
                  <Text style={{ color: getMasteryColor(item.mastery || 0), fontWeight: 600 }}>
                    掌握度 {masteryPercent}%
                  </Text>
                  <Text type="secondary">{active ? '已选中，查看右侧题目或直接开始做题' : '点击查看对应题目'}</Text>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
