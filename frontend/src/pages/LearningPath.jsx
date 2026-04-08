import React, { useEffect, useState } from 'react'
import { Card, Spin, Empty, Typography, Statistic, Row, Col } from 'antd'
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons'
import PathTimeline from '../components/PathTimeline'
import { getPath } from '../api'

const { Title } = Typography

export default function LearningPath() {
  const [pathData, setPathData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPath()
  }, [])

  const loadPath = async () => {
    try {
      const res = await getPath('c_language')
      setPathData(res.data)
    } catch {
      // 未登录或无数据
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  }

  if (!pathData || pathData.path.length === 0) {
    return (
      <Empty
        description="完成诊断测评后，系统将为你生成个性化学习路径"
        style={{ marginTop: 100 }}
      />
    )
  }

  return (
    <div>
      <Title level={4}>🛤️ 个性化学习路径</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="待学习知识点"
              value={pathData.path.length}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="薄弱知识点"
              value={pathData.weak_count}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="预计总时间"
              value={pathData.total_minutes}
              prefix={<ClockCircleOutlined />}
              suffix="分钟"
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <PathTimeline items={pathData.path} />
      </Card>
    </div>
  )
}
