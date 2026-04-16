import React from 'react'
import { Timeline, Tag, Typography, Progress } from 'antd'
import CheckCircleOutlined from '@ant-design/icons/es/icons/CheckCircleOutlined'
import SyncOutlined from '@ant-design/icons/es/icons/SyncOutlined'
import LockOutlined from '@ant-design/icons/es/icons/LockOutlined'
import ClockCircleOutlined from '@ant-design/icons/es/icons/ClockCircleOutlined'

const { Text } = Typography

/**
 * 学习路径时间线组件
 *
 * Props:
 *   items: [{ id, name, category, mastery, estimated_minutes, difficulty, status }]
 */
export default function PathTimeline({ items = [] }) {
  const getIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'in-progress':
        return <SyncOutlined spin style={{ color: '#1677ff' }} />
      default:
        return <LockOutlined style={{ color: '#999' }} />
    }
  }

  const getColor = (status) => {
    switch (status) {
      case 'completed': return 'green'
      case 'in-progress': return 'blue'
      default: return 'gray'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return '已掌握'
      case 'in-progress': return '学习中'
      default: return '待学习'
    }
  }

  return (
    <Timeline
      items={items.map((item) => ({
        dot: getIcon(item.status),
        color: getColor(item.status),
        children: (
          <div style={{ paddingBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong style={{ fontSize: 15 }}>{item.name}</Text>
                {item.category && (
                  <Tag style={{ marginLeft: 8 }}>{item.category}</Tag>
                )}
                <Tag color={getColor(item.status)} style={{ marginLeft: 4 }}>
                  {getStatusLabel(item.status)}
                </Tag>
              </div>
              <Text type="secondary">
                <ClockCircleOutlined /> {item.estimated_minutes} 分钟
              </Text>
            </div>
            <Progress
              percent={Math.round((item.mastery || 0) * 100)}
              size="small"
              strokeColor={
                item.mastery < 0.4 ? '#ff4d4f' : item.mastery < 0.7 ? '#faad14' : '#52c41a'
              }
              style={{ marginTop: 4, maxWidth: 300 }}
            />
          </div>
        ),
      }))}
    />
  )
}
