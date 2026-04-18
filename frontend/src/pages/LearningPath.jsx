import React, { useEffect, useState, useCallback } from 'react'
import { Card, Spin, Empty, Typography, Statistic, Row, Col, Tag, Skeleton } from 'antd'
import CheckCircleOutlined from '@ant-design/icons/es/icons/CheckCircleOutlined'
import ReadOutlined from '@ant-design/icons/es/icons/ReadOutlined'
import WarningOutlined from '@ant-design/icons/es/icons/WarningOutlined'
import { useNavigate } from 'react-router-dom'
import PathTimeline from '../components/PathTimeline'
import { getPath, getPathExercises } from '../api'
import useUserStore, { SUBJECTS } from '../store/userStore'

const { Paragraph, Text, Title } = Typography

function DifficultyTag({ difficulty }) {
  const color = difficulty >= 4 ? 'red' : difficulty >= 3 ? 'gold' : 'blue'
  return <Tag color={color}>难度 {difficulty}</Tag>
}

export default function LearningPath() {
  const navigate = useNavigate()
  const currentSubject = useUserStore((s) => s.currentSubject)
  const resolvedTheme = useUserStore((s) => s.resolvedTheme)
  const subjectLabel = SUBJECTS.find((s) => s.id === currentSubject)?.label || currentSubject
  const isDark = resolvedTheme === 'dark'

  const [pathData, setPathData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [exerciseMap, setExerciseMap] = useState({})
  const [exerciseLoadingId, setExerciseLoadingId] = useState(null)

  const loadPath = useCallback(async () => {
    setLoading(true)
    setPathData(null)
    setSelectedId(null)
    setExerciseMap({})
    try {
      const res = await getPath(currentSubject)
      const nextPath = res.data
      setPathData(nextPath)
      setSelectedId(nextPath?.path?.[0]?.id || null)
    } catch {
      // 未登录或无数据
    } finally {
      setLoading(false)
    }
  }, [currentSubject])

  useEffect(() => {
    loadPath()
  }, [loadPath])

  const selectedItem = pathData?.path?.find((item) => item.id === selectedId) || pathData?.path?.[0] || null
  const selectedExercises = selectedItem ? exerciseMap[selectedItem.id] : null
  const completedCount = pathData?.path?.filter((item) => item.status === 'completed').length || 0
  const inProgressCount = pathData?.path?.filter((item) => item.status === 'in-progress').length || 0

  useEffect(() => {
    if (!selectedItem?.id) return
    if (Object.prototype.hasOwnProperty.call(exerciseMap, selectedItem.id)) return

    let cancelled = false
    setExerciseLoadingId(selectedItem.id)

    getPathExercises(selectedItem.id)
      .then((res) => {
        if (cancelled) return
        setExerciseMap((prev) => ({ ...prev, [selectedItem.id]: res.data || [] }))
      })
      .catch(() => {
        if (cancelled) return
        setExerciseMap((prev) => ({ ...prev, [selectedItem.id]: [] }))
      })
      .finally(() => {
        if (!cancelled) setExerciseLoadingId(null)
      })

    return () => {
      cancelled = true
    }
  }, [selectedItem, exerciseMap])

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  }

  if (!pathData || pathData.path.length === 0) {
    return (
      <Empty
        description={`「${subjectLabel}」暂无学习路径，请先完成诊断测评`}
        style={{ marginTop: 100 }}
      />
    )
  }

  return (
    <div className="learning-path-page">
      <style>{`
        .learning-path-page {
          --lp-border: ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'};
          --lp-card-bg: ${isDark ? 'rgba(255,255,255,0.03)' : '#ffffff'};
          --lp-card-soft: ${isDark ? 'rgba(18,24,38,0.92)' : '#f8fbff'};
          --lp-muted: ${isDark ? 'rgba(255,255,255,0.65)' : '#475569'};
          --lp-hero-shadow: ${isDark ? '0 20px 40px rgba(0,0,0,0.28)' : '0 20px 40px rgba(15,23,42,0.08)'};
        }

        .learning-path-page .lp-hero-card,
        .learning-path-page .lp-panel-card,
        .learning-path-page .lp-metric-card {
          border-radius: 24px;
          border: 1px solid var(--lp-border);
          overflow: hidden;
        }

        .learning-path-page .lp-hero-card {
          margin-bottom: 20px;
          background:
            radial-gradient(circle at top right, rgba(22,119,255,0.16), transparent 32%),
            radial-gradient(circle at bottom left, rgba(82,196,26,0.12), transparent 28%),
            var(--lp-card-soft);
          box-shadow: var(--lp-hero-shadow);
        }

        .learning-path-page .lp-metric-card .ant-card-body,
        .learning-path-page .lp-panel-card .ant-card-body,
        .learning-path-page .lp-hero-card .ant-card-body {
          padding: 24px;
        }

        .learning-path-page .lp-panel-card .ant-card-head {
          border-bottom: 1px solid var(--lp-border);
        }

        .learning-path-page .lp-side-panel {
          position: sticky;
          top: 24px;
        }

        .learning-path-page .lp-side-panel-card {
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 48px);
        }

        .learning-path-page .lp-side-panel-card .ant-card-head {
          flex: 0 0 auto;
        }

        .learning-path-page .lp-side-panel-card .ant-card-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .learning-path-page .lp-side-panel-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .learning-path-page .lp-question-card {
          border-radius: 18px;
          border: 1px solid var(--lp-border);
          background: var(--lp-card-bg);
        }

        .learning-path-page .lp-option {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--lp-border);
          background: ${isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'};
        }

        @media (max-width: 1199px) {
          .learning-path-page .lp-side-panel {
            position: static;
          }

          .learning-path-page .lp-side-panel-card {
            max-height: none;
          }

          .learning-path-page .lp-side-panel-card .ant-card-body {
            overflow: visible;
          }
        }
      `}</style>

      <Card bordered={false} className="lp-hero-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <Text style={{ color: '#1677ff', fontWeight: 600, letterSpacing: 1 }}>LEARNING PATH</Text>
            <Title level={3} style={{ margin: '10px 0 8px' }}>
              {subjectLabel} 个性化学习路径
            </Title>
            <Paragraph style={{ margin: 0, fontSize: 15, color: isDark ? 'rgba(255,255,255,0.7)' : '#475569' }}>
              按知识依赖和当前掌握度重排学习顺序。点击左侧知识点可查看题目预览，点击右侧“开始做题”可直接进入该知识点的专项测评。
            </Paragraph>
          </div>

          {selectedItem ? (
            <div
              style={{
                minWidth: 280,
                maxWidth: 420,
                borderRadius: 20,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(22,119,255,0.14)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.78)',
                padding: 18,
              }}
            >
              <Text type="secondary">当前聚焦</Text>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{selectedItem.name}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedItem.chapter ? <Tag bordered={false}>第 {selectedItem.chapter} 章</Tag> : null}
                {selectedItem.category ? <Tag bordered={false}>{selectedItem.category}</Tag> : null}
                <DifficultyTag difficulty={selectedItem.difficulty || 1} />
              </div>
              {selectedItem.description ? (
                <Paragraph style={{ margin: '12px 0 0', color: isDark ? 'rgba(255,255,255,0.65)' : '#475569' }}>
                  {selectedItem.description}
                </Paragraph>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <Tag color="blue" style={{ paddingInline: 10, borderRadius: 999 }}>
            学习中 {inProgressCount} 个
          </Tag>
          <Tag color="green" style={{ paddingInline: 10, borderRadius: 999 }}>
            已掌握 {completedCount} 个
          </Tag>
          <Tag color="red" style={{ paddingInline: 10, borderRadius: 999 }}>
            薄弱知识点 {pathData.weak_count} 个
          </Tag>
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={8}>
          <Card className="lp-metric-card">
            <Statistic title="路径节点" value={pathData.path.length} prefix={<ReadOutlined />} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="lp-metric-card">
            <Statistic
              title="薄弱知识点"
              value={pathData.weak_count}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
              suffix="个"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="lp-metric-card">
            <Statistic
              title="已掌握"
              value={completedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
              suffix="个"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={14}>
          <Card
            className="lp-panel-card"
            title="学习路线"
            extra={<Text type="secondary">点击标题切换右侧题目，按钮可直接开始测评</Text>}
          >
            <PathTimeline
              items={pathData.path}
              selectedId={selectedItem?.id || null}
              onSelect={(item) => setSelectedId(item.id)}
              onStartPractice={(item) => {
                const params = new URLSearchParams({
                  subject: currentSubject,
                  mode: 'path',
                  knowledgePointId: item.id,
                  knowledgePointName: item.name,
                })
                navigate(`/diagnosis?${params.toString()}`)
              }}
              isDark={isDark}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <div className="lp-side-panel">
            <Card className="lp-panel-card lp-side-panel-card" title="对应题目">
              {!selectedItem ? (
                <Empty description="请选择一个知识点" />
              ) : (
                <div className="lp-side-panel-content">
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 18,
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
                      background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fbff',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {selectedItem.category ? <Tag bordered={false}>{selectedItem.category}</Tag> : null}
                      {selectedItem.chapter ? <Tag bordered={false}>第 {selectedItem.chapter} 章</Tag> : null}
                      <DifficultyTag difficulty={selectedItem.difficulty || 1} />
                      <Tag color="processing">掌握度 {Math.round((selectedItem.mastery || 0) * 100)}%</Tag>
                    </div>

                    <Title level={4} style={{ margin: 0 }}>
                      {selectedItem.name}
                    </Title>

                    {selectedItem.description ? (
                      <Paragraph style={{ margin: '10px 0 0', color: isDark ? 'rgba(255,255,255,0.65)' : '#475569' }}>
                        {selectedItem.description}
                      </Paragraph>
                    ) : null}
                  </div>

                  {exerciseLoadingId === selectedItem.id && !selectedExercises ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                  ) : selectedExercises?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {selectedExercises.map((exercise, index) => (
                        <Card key={exercise.id} size="small" className="lp-question-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                            <Text strong style={{ fontSize: 15 }}>第 {index + 1} 题</Text>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <DifficultyTag difficulty={exercise.difficulty || 1} />
                              <Tag color="blue">{exercise.knowledge_point_id}</Tag>
                            </div>
                          </div>

                          <Paragraph style={{ fontSize: 15, marginBottom: 14 }}>
                            {exercise.question_text}
                          </Paragraph>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Object.entries(exercise.options || {}).map(([key, value]) => (
                              <div key={key} className="lp-option">
                                <Text strong style={{ marginRight: 8 }}>{key}.</Text>
                                <Text>{value}</Text>
                              </div>
                            ))}
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Empty description="该知识点暂未配置练习题" />
                  )}
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  )
}
