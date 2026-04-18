import React, { useEffect, useRef, useState } from 'react'
import {
  Card, Button, Radio, Space, Progress, Spin, Tag, Typography, message
} from 'antd'
import CheckCircleOutlined from '@ant-design/icons/es/icons/CheckCircleOutlined'
import CloseCircleOutlined from '@ant-design/icons/es/icons/CloseCircleOutlined'
import RightOutlined from '@ant-design/icons/es/icons/RightOutlined'
import LeftOutlined from '@ant-design/icons/es/icons/LeftOutlined'
import ReloadOutlined from '@ant-design/icons/es/icons/ReloadOutlined'
import NodeIndexOutlined from '@ant-design/icons/es/icons/NodeIndexOutlined'
import PlayCircleOutlined from '@ant-design/icons/es/icons/PlayCircleOutlined'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { startDiagnosis, submitDiagnosis } from '../api'
import useUserStore from '../store/userStore'

const { Title, Text, Paragraph } = Typography

// ── Difficulty badge ────────────────────────────────────────────
function DiffBadge({ difficulty }) {
  const color = difficulty <= 2 ? 'success' : difficulty <= 3 ? 'warning' : 'error'
  const label = difficulty <= 2 ? '基础' : difficulty <= 3 ? '中等' : '进阶'
  return <Tag color={color}>{'⭐'.repeat(difficulty)} {label}</Tag>
}

// ── Single question card ────────────────────────────────────────
function QuestionCard({ exercise, answer, onAnswer, index, total, isDark }) {
  const options = exercise?.options || {}
  const progress = Math.round(((index) / total) * 100)
  const questionColor = isDark ? '#f0f0f0' : '#1a1a1a'
  const optionColor = isDark ? '#f0f0f0' : '#1a1a1a'
  const optionMutedColor = isDark ? '#bfbfbf' : '#666'
  const cardBorder = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(22,119,255,0.12)'
  const optionBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'
  const optionBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.015)'
  const selectedBg = isDark ? 'rgba(22,119,255,0.18)' : 'rgba(22,119,255,0.05)'

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            第 {index + 1} 题 / 共 {total} 题
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>{progress}%</Text>
        </div>
        <Progress
          percent={progress}
          showInfo={false}
          strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
          trailColor={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}
          size={['100%', 6]}
        />
      </div>

      <Card
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: cardBorder,
        }}
        bodyStyle={{ padding: '28px 32px' }}
      >
        {/* Tags */}
        <Space style={{ marginBottom: 16 }}>
          <Tag color="blue" style={{ borderRadius: 20 }}>{exercise.knowledge_point_id}</Tag>
          <DiffBadge difficulty={exercise.difficulty} />
        </Space>

        {/* Question text */}
        <div style={{
          fontSize: 16, fontWeight: 600, lineHeight: 1.7,
          marginBottom: 28, whiteSpace: 'pre-wrap', color: questionColor
        }}>
          {exercise.question_text}
        </div>

        {/* Options */}
        <Radio.Group
          value={answer}
          onChange={(e) => onAnswer(exercise.id, e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%', gap: 10 }}>
            {Object.entries(options).map(([key, value]) => {
              const selected = answer === key
              return (
                <Radio
                  key={key}
                  value={key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: `1.5px solid ${selected ? '#1677ff' : optionBorder}`,
                    background: selected ? selectedBg : optionBg,
                    transition: 'all 0.18s ease',
                    cursor: 'pointer',
                    margin: 0,
                    width: '100%',
                  }}
                >
                  <span style={{ color: optionColor }}>
                    <Text strong style={{ color: selected ? '#1677ff' : optionMutedColor, marginRight: 8 }}>
                      {key}.
                    </Text>
                    {value}
                  </span>
                </Radio>
              )
            })}
          </Space>
        </Radio.Group>
      </Card>
    </div>
  )
}

// ── Result review card (per question) ──────────────────────────
function ReviewCard({ exercise, userAnswer, index, isDark }) {
  const correct = exercise.correct_answer
  const isCorrect = userAnswer?.toUpperCase() === correct?.toUpperCase()
  const options = exercise?.options || {}
  const skipped = !userAnswer
  const neutralText = isDark ? '#d9d9d9' : '#444'
  const mutedText = isDark ? '#bfbfbf' : '#888'
  const cardBg = isCorrect
    ? isDark ? 'rgba(82,196,26,0.08)' : 'rgba(82,196,26,0.02)'
    : isDark ? 'rgba(255,77,79,0.08)' : 'rgba(255,77,79,0.02)'
  const defaultOptionBorder = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.06)'

  return (
    <Card
      style={{
        borderRadius: 14,
        marginBottom: 16,
        border: `1.5px solid ${isCorrect ? 'rgba(82,196,26,0.3)' : 'rgba(255,77,79,0.3)'}`,
        background: cardBg,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {isCorrect
            ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18, flexShrink: 0 }} />
            : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18, flexShrink: 0 }} />
          }
          <Text strong style={{ fontSize: 14, lineHeight: 1.5 }}>
            第{index + 1}题：{exercise.question_text}
          </Text>
        </div>
        <Space style={{ flexShrink: 0, marginLeft: 12 }}>
          <Tag color="blue" style={{ borderRadius: 20, fontSize: 11 }}>{exercise.knowledge_point_id}</Tag>
          <DiffBadge difficulty={exercise.difficulty} />
        </Space>
      </div>

      {/* Options with highlighting */}
      <div style={{ marginBottom: skipped || isCorrect ? 0 : 12 }}>
        {Object.entries(options).map(([key, value]) => {
          const isCorrectOpt = key === correct
          const isUserOpt = key === userAnswer

          let bg = 'transparent'
          let border = defaultOptionBorder
          let textColor = neutralText

          if (isCorrectOpt) {
            bg = isDark ? 'rgba(82,196,26,0.16)' : 'rgba(82,196,26,0.10)'
            border = '1px solid rgba(82,196,26,0.40)'
            textColor = '#389e0d'
          } else if (isUserOpt && !isCorrect) {
            bg = isDark ? 'rgba(255,77,79,0.16)' : 'rgba(255,77,79,0.08)'
            border = '1px solid rgba(255,77,79,0.35)'
            textColor = '#cf1322'
          }

          return (
            <div
              key={key}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border, background: bg, marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Text strong style={{ color: isCorrectOpt ? '#52c41a' : isUserOpt && !isCorrect ? '#ff4d4f' : mutedText, minWidth: 18 }}>
                {key}.
              </Text>
              <Text style={{ color: textColor, flex: 1 }}>{value}</Text>
              {isCorrectOpt && (
                <Tag color="success" style={{ borderRadius: 20, fontSize: 11, margin: 0 }}>✓ 正确答案</Tag>
              )}
              {isUserOpt && !isCorrect && (
                <Tag color="error" style={{ borderRadius: 20, fontSize: 11, margin: 0 }}>你的选择</Tag>
              )}
            </div>
          )
        })}
      </div>

      {/* Explanation */}
      <div style={{
        marginTop: 12,
        padding: '10px 14px',
        borderRadius: 8,
        background: isCorrect
          ? isDark ? 'rgba(22,119,255,0.12)' : 'rgba(22,119,255,0.04)'
          : isDark ? 'rgba(250,173,20,0.14)' : 'rgba(250,173,20,0.08)',
        border: `1px solid ${isCorrect ? 'rgba(22,119,255,0.12)' : 'rgba(250,173,20,0.25)'}`,
      }}>
        <Text style={{ fontSize: 13, color: isDark ? '#d9d9d9' : '#555' }}>
          <Text strong style={{ color: isCorrect ? '#1677ff' : '#d46b08' }}>
            💡 解析：
          </Text>
          {exercise.explanation || '暂无解析'}
        </Text>
      </div>

      {skipped && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)',
        }}>
          <Text type="secondary" style={{ fontSize: 13 }}>⚠️ 此题未作答</Text>
        </div>
      )}
    </Card>
  )
}

// ── Main Diagnosis page ─────────────────────────────────────────
export default function Diagnosis() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDark = useUserStore((s) => s.resolvedTheme === 'dark')
  const currentSubject = useUserStore((s) => s.currentSubject)
  const [phase, setPhase] = useState('start')   // start | testing | result
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sessionMeta, setSessionMeta] = useState(null)
  const autoLaunchKeyRef = useRef('')
  const launchRequestIdRef = useRef(0)

  const routeKnowledgePointId = searchParams.get('knowledgePointId') || ''
  const routeKnowledgePointName = searchParams.get('knowledgePointName') || routeKnowledgePointId
  const routeSubject = searchParams.get('subject') || currentSubject
  const routeMode = searchParams.get('mode') || ''
  const routePractice = routeKnowledgePointId
    ? {
      mode: routeMode || 'path',
      subject: routeSubject,
      knowledgePointId: routeKnowledgePointId,
      knowledgePointName: routeKnowledgePointName,
    }
    : null
  const activeSession = routePractice?.knowledgePointId
    ? (sessionMeta || routePractice)
    : sessionMeta?.knowledgePointId
      ? null
      : sessionMeta

  const resetToDiagnosisStart = () => {
    launchRequestIdRef.current += 1
    autoLaunchKeyRef.current = ''
    setPhase('start')
    setExercises([])
    setAnswers({})
    setCurrent(0)
    setResult(null)
    setLoading(false)
    setSessionMeta(null)
  }

  const launchDiagnosis = async (options = {}) => {
    const subject = options.subject || currentSubject
    const knowledgePointId = options.knowledgePointId || null
    const knowledgePointName = options.knowledgePointName || knowledgePointId || ''
    const requestId = ++launchRequestIdRef.current

    setLoading(true)
    try {
      const res = await startDiagnosis(
        subject,
        knowledgePointId ? null : 10,
        knowledgePointId ? { knowledgePointId } : {}
      )

      if (requestId !== launchRequestIdRef.current) return

      if (!res.data || res.data.length === 0) {
        message.warning(
          knowledgePointId
            ? '该知识点暂未配置练习题，请先查看右侧题目预览或联系管理员补充题库'
            : '题库暂时为空，请联系管理员导入题目'
        )
        return
      }

      setExercises(res.data)
      setAnswers({})
      setCurrent(0)
      setResult(null)
      setSessionMeta({
        mode: knowledgePointId ? 'path' : 'diagnosis',
        subject,
        knowledgePointId,
        knowledgePointName,
        total: res.data.length,
      })
      setPhase('testing')
    } catch (e) {
      if (requestId !== launchRequestIdRef.current) return
      message.error('获取题目失败：' + (e.response?.data?.detail || '网络错误'))
    } finally {
      if (requestId === launchRequestIdRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!routePractice?.knowledgePointId) return

    const sessionKey = `${routePractice.subject}:${routePractice.knowledgePointId}`
    if (autoLaunchKeyRef.current === sessionKey) return

    autoLaunchKeyRef.current = sessionKey
    launchDiagnosis(routePractice)
  }, [routePractice?.subject, routePractice?.knowledgePointId])

  useEffect(() => {
    if (routePractice?.knowledgePointId) return
    if (!sessionMeta?.knowledgePointId) return
    resetToDiagnosisStart()
  }, [routePractice?.knowledgePointId, sessionMeta?.knowledgePointId])

  const handleStart = async () => {
    await launchDiagnosis(routePractice || { subject: currentSubject })
  }

  const handleAnswer = (exerciseId, answer) => {
    setAnswers(prev => ({ ...prev, [exerciseId]: answer }))
  }

  const handleNext = () => {
    if (current < exercises.length - 1) {
      setCurrent(current + 1)
    }
  }

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const answerList = exercises.map((e) => ({
        exercise_id: e.id,
        answer: answers[e.id] || '',
      }))
      const res = await submitDiagnosis(answerList)

      if (!res.data) throw new Error('返回数据为空')

      // Attach exercises to result for review
      setResult({
        ...res.data,
        exercises: res.data.exercises || exercises,
        answers: { ...answers },
      })
      setPhase('result')
    } catch (e) {
      console.error('Submit error:', e)
      message.error('提交失败：' + (e.response?.data?.detail || e.message || '网络错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (activeSession?.knowledgePointId) {
      launchDiagnosis(activeSession)
      return
    }

    resetToDiagnosisStart()
  }

  // ── Start screen ──────────────────────────────────────────────
  if (phase === 'start') {
    if (routePractice?.knowledgePointId && loading) {
      return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
    }

    return (
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>
          {routePractice?.knowledgePointId ? '🎯' : '🩺'}
        </div>
        <Title level={2} style={{ marginBottom: 8 }}>
          {routePractice?.knowledgePointId
            ? `${routePractice.knowledgePointName || routePractice.knowledgePointId} 专项测评`
            : '诊断测评'}
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 36 }}>
          {routePractice?.knowledgePointId ? (
            <>
              来自学习路线的开始做题入口，已为你准备该知识点下的全部相关题目。
              <br />
              完成后系统会继续使用 BKT 算法更新你的掌握程度。
            </>
          ) : (
            <>
              通过一组精选题目，快速定位你的薄弱知识点。
              <br />
              系统将使用 BKT 算法智能评估你的掌握程度。
            </>
          )}
        </Paragraph>

        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center',
          flexWrap: 'wrap', marginBottom: 32
        }}>
          {(routePractice?.knowledgePointId
            ? ['📚 全部相关题目', '🧠 BKT 动态更新', '📊 即时反馈', '🛤️ 完成后返回学习路径']
            : ['🎯 10道精选题', '⏱️ 约10分钟', '📊 即时分析', '🛤️ 路径推荐']
          ).map(t => (
            <div key={t} style={{
              padding: '8px 18px', borderRadius: 24,
              background: 'rgba(22,119,255,0.06)',
              border: '1px solid rgba(22,119,255,0.15)',
              fontSize: 13, color: '#1677ff', fontWeight: 500
            }}>{t}</div>
          ))}
        </div>

        <Button
          type="primary" size="large" onClick={handleStart} loading={loading}
          style={{ borderRadius: 10, height: 48, paddingInline: 40, fontSize: 16 }}
        >
          {routePractice?.knowledgePointId ? '开始做题' : '开始诊断'} <RightOutlined />
        </Button>
      </div>
    )
  }

  // ── Testing screen ────────────────────────────────────────────
  if (phase === 'testing') {
    const ex = exercises[current]
    const answered = Object.keys(answers).length
    const isLast = current === exercises.length - 1
    const currentAnswered = !!answers[ex?.id]
    const allAnswered = answered >= exercises.length

    return (
      <div style={{ padding: '8px 0' }}>
        {activeSession?.knowledgePointId && (
          <div
            style={{
              maxWidth: 680,
              margin: '0 auto 18px',
              padding: '14px 16px',
              borderRadius: 16,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(22,119,255,0.14)'}`,
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(248,251,255,0.96)',
            }}
          >
            <Space wrap size={[8, 8]} style={{ marginBottom: 8 }}>
              <Tag color="processing">学习路线专项测评</Tag>
              <Tag bordered={false}>{activeSession.knowledgePointName || activeSession.knowledgePointId}</Tag>
              <Tag color="blue">{activeSession.knowledgePointId}</Tag>
              <Tag color="purple">共 {exercises.length} 题</Tag>
            </Space>
            <Text type="secondary">
              当前正在完成该知识点的全部相关题目，提交后会同步更新学习路线中的掌握度。
            </Text>
          </div>
        )}

        {/* Dot navigator */}
        <div style={{
          display: 'flex', gap: 6, justifyContent: 'center',
          flexWrap: 'wrap', marginBottom: 24
        }}>
          {exercises.map((e, i) => {
            const ans = answers[e.id]
            const isCur = i === current
            return (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                title={`第${i + 1}题${ans ? ' ✓' : ''}`}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: isCur ? '2px solid #1677ff' : '2px solid transparent',
                  background: ans ? '#52c41a' : isCur ? '#e6f4ff' : 'rgba(0,0,0,0.06)',
                  color: ans ? '#fff' : isCur ? '#1677ff' : '#999',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  transition: 'all 0.15s',
                  boxShadow: isCur ? '0 0 0 3px rgba(22,119,255,0.15)' : 'none',
                }}
              >
                {i + 1}
              </button>
            )
          })}
        </div>

        {ex && (
          <QuestionCard
            exercise={ex}
            answer={answers[ex.id]}
            onAnswer={handleAnswer}
            index={current}
            total={exercises.length}
            isDark={isDark}
          />
        )}

        {/* Navigation */}
        <div style={{
          maxWidth: 680, margin: '20px auto 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <Button
            onClick={handlePrev} disabled={current === 0}
            icon={<LeftOutlined />} size="large"
            style={{ borderRadius: 10 }}
          >
            上一题
          </Button>

          <Text type="secondary" style={{ fontSize: 13 }}>
            已答 <Text strong style={{ color: answered === exercises.length ? '#52c41a' : '#1677ff' }}>
              {answered}
            </Text>/{exercises.length}
          </Text>

          {!isLast ? (
            <Button
              type={currentAnswered ? 'primary' : 'default'}
              onClick={handleNext} size="large"
              icon={<RightOutlined />} iconPosition="end"
              style={{ borderRadius: 10 }}
            >
              下一题
            </Button>
          ) : (
            <Button
              type="primary" onClick={handleSubmit} loading={loading}
              size="large" disabled={!allAnswered}
              style={{ borderRadius: 10 }}
              title={!allAnswered ? `还有 ${exercises.length - answered} 题未答` : ''}
            >
              {allAnswered ? '提交诊断' : `还有${exercises.length - answered}题未答`}
            </Button>
          )}
        </div>

        {/* Unanswered warning */}
        {isLast && !allAnswered && (
          <div style={{ maxWidth: 680, margin: '12px auto 0', textAlign: 'center' }}>
            <Text type="warning" style={{ fontSize: 13 }}>
              ⚠️ 请通过上方数字导航返回未答题目
            </Text>
          </div>
        )}
      </div>
    )
  }

  // ── Result screen ─────────────────────────────────────────────
  if (phase === 'result') {
    if (!result) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Text type="danger">结果加载失败，请重新诊断</Text>
          <br /><br />
          <Button onClick={handleReset}>重新诊断</Button>
        </div>
      )
    }

    const { total = 0, correct = 0, accuracy = 0, mastery_map = {}, weak_points = [], exercises: exList = [], answers: ans = {} } = result
    const accuracyPct = Math.round((accuracy || 0) * 100)
    const isGood = accuracyPct >= 60

    // Separate correct and wrong
    const wrongExercises = exList.filter(e => {
      const userAns = ans[e.id]
      return !userAns || userAns.toUpperCase() !== e.correct_answer?.toUpperCase()
    })
    const correctExercises = exList.filter(e => {
      const userAns = ans[e.id]
      return userAns && userAns.toUpperCase() === e.correct_answer?.toUpperCase()
    })

    return (
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 0 40px' }}>
        {/* Score banner */}
        <Card
          style={{
            borderRadius: 20, marginBottom: 24,
            background: isGood
              ? 'linear-gradient(135deg, rgba(82,196,26,0.08), rgba(22,119,255,0.05))'
              : 'linear-gradient(135deg, rgba(255,77,79,0.06), rgba(250,173,20,0.05))',
            border: `1.5px solid ${isGood ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
          bodyStyle={{ padding: '28px 32px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 64 }}>{isGood ? '🎉' : '💪'}</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Title level={2} style={{ margin: 0, color: isGood ? '#389e0d' : '#cf1322' }}>
                {accuracyPct}%
              </Title>
              <Text type="secondary" style={{ fontSize: 15 }}>
                共 {total} 题 · 答对 {correct} 题 · 答错 {total - correct} 题
              </Text>
              <div style={{ marginTop: 8 }}>
                {isGood
                  ? <Text style={{ color: '#389e0d', fontWeight: 500 }}>整体表现不错，继续保持！</Text>
                  : <Text style={{ color: '#d46b08', fontWeight: 500 }}>别灰心，查看下方错题详解吧！</Text>
                }
              </div>
            </div>
            <Progress
              type="circle" percent={accuracyPct}
              strokeColor={isGood ? '#52c41a' : '#ff4d4f'}
              size={90}
              format={p => <span style={{ fontSize: 18, fontWeight: 700, color: isGood ? '#52c41a' : '#ff4d4f' }}>{p}%</span>}
            />
          </div>
        </Card>

        {/* Mastery map */}
        {Object.keys(mastery_map).length > 0 && (
          <Card
            title={<span>📊 各知识点掌握度</span>}
            style={{ borderRadius: 16, marginBottom: 24, border: '1px solid rgba(0,0,0,0.08)' }}
            bodyStyle={{ padding: '16px 24px' }}
          >
            {Object.entries(mastery_map).sort(([, a], [, b]) => a - b).map(([kp, mastery]) => {
              const pct = Math.round(mastery * 100)
              const color = pct < 40 ? '#ff4d4f' : pct < 70 ? '#faad14' : '#52c41a'
              return (
                <div key={kp} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13 }}>{kp}</Text>
                    <Text strong style={{ color, fontSize: 13 }}>{pct}%</Text>
                  </div>
                  <Progress
                    percent={pct} strokeColor={color}
                    showInfo={false} size={['100%', 6]}
                    trailColor="rgba(0,0,0,0.06)"
                  />
                </div>
              )
            })}
          </Card>
        )}

        {/* Weak points */}
        {weak_points.length > 0 && (
          <Card
            style={{
              borderRadius: 16, marginBottom: 24,
              border: '1px solid rgba(255,77,79,0.2)',
              background: 'rgba(255,77,79,0.02)',
            }}
            bodyStyle={{ padding: '16px 24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text strong style={{ fontSize: 15 }}>⚠️ 需要重点复习</Text>
            </div>
            <Space wrap>
              {weak_points.map(kp => (
                <Tag key={kp} color="error" style={{ borderRadius: 20, padding: '4px 12px', fontSize: 13 }}>
                  {kp}
                </Tag>
              ))}
            </Space>
          </Card>
        )}

        {/* Wrong answers review */}
        {wrongExercises.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
              <Title level={5} style={{ margin: 0, color: '#ff4d4f' }}>
                错题解析 ({wrongExercises.length} 题)
              </Title>
            </div>
            {wrongExercises.map((ex, i) => (
              <ReviewCard
                key={ex.id}
                exercise={ex}
                userAnswer={ans[ex.id]}
                index={exList.indexOf(ex)}
                isDark={isDark}
              />
            ))}
          </div>
        )}

        {/* Correct answers review (collapsed style) */}
        {correctExercises.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
              <Title level={5} style={{ margin: 0, color: '#52c41a' }}>
                答对的题目 ({correctExercises.length} 题)
              </Title>
            </div>
            {correctExercises.map((ex) => (
              <ReviewCard
                key={ex.id}
                exercise={ex}
                userAnswer={ans[ex.id]}
                index={exList.indexOf(ex)}
                isDark={isDark}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <Button
            size="large" onClick={handleReset}
            icon={activeSession?.knowledgePointId ? <PlayCircleOutlined /> : <ReloadOutlined />}
            style={{ borderRadius: 10 }}
          >
            {activeSession?.knowledgePointId ? '再做一次' : '重新诊断'}
          </Button>
          <Button
            type="primary" size="large" onClick={() => navigate('/path')}
            icon={<NodeIndexOutlined />}
            style={{ borderRadius: 10 }}
          >
            {activeSession?.knowledgePointId ? '返回学习路径' : '查看学习路径'}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
