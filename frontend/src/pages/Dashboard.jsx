import React, { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Typography, Empty, Button } from 'antd'
import {
  BookOutlined,
  CheckCircleOutlined,
  FireOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import RadarChart from '../components/RadarChart'
import useUserStore from '../store/userStore'
import { getReport, getProgress, getMe } from '../api'

const { Title, Paragraph } = Typography

export default function Dashboard() {
  const { user, isAuthenticated, setUser, openAuthModal } = useUserStore()
  const [summary, setSummary] = useState(null)
  const [progress, setProgress] = useState([])

  useEffect(() => {
    if (isAuthenticated()) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    try {
      const [sumRes, progRes, meRes] = await Promise.all([
        getReport(),
        getProgress(),
        getMe(),
      ])
      setSummary(sumRes.data)
      setProgress(progRes.data)
      setUser(meRes.data)
    } catch {
      // 未登录或接口错误
    }
  }

  if (!isAuthenticated()) {
    return (
      <div style={{ textAlign: 'center', marginTop: 100 }}>
        <Title level={2}>🧠 CyberLinkage</Title>
        <Paragraph style={{ fontSize: 16, color: '#666' }}>
          基于知识图谱的个性化学习伴侣
        </Paragraph>
        <Button type="primary" size="large" onClick={openAuthModal}>
          开始使用
        </Button>
      </div>
    )
  }

  return (
    <div>
      <Title level={4}>👋 你好，{user?.username || '同学'}！</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="累计做题"
              value={summary?.total_exercises || 0}
              prefix={<BookOutlined />}
              suffix="题"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="正确率"
              value={((summary?.accuracy || 0) * 100).toFixed(1)}
              prefix={<CheckCircleOutlined />}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已掌握"
              value={summary?.mastery_distribution?.high || 0}
              prefix={<TrophyOutlined />}
              suffix="个知识点"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃天数"
              value={summary?.days_active || 0}
              prefix={<FireOutlined />}
              suffix="天"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="📊 掌握度雷达图">
            {progress.length > 0 ? (
              <RadarChart
                categories={progress.map((p) => p.knowledge_point_id)}
                values={progress.map((p) => Math.round(p.mastery * 100))}
              />
            ) : (
              <Empty description="完成诊断测评后查看" />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="📅 最近活跃">
            {summary?.recent_activity?.length > 0 ? (
              <ul>
                {summary.recent_activity.map((a) => (
                  <li key={a.date}>
                    {a.date}：做了 {a.count} 道题
                  </li>
                ))}
              </ul>
            ) : (
              <Empty description="开始做题后查看" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}