import React, { useState } from 'react'
import {
  Card, Button, Radio, Space, Steps, Progress, Result, Tag, Typography, message,
} from 'antd'
import { startDiagnosis, submitDiagnosis } from '../api'

const { Title, Text } = Typography

export default function Diagnosis() {
  const [phase, setPhase] = useState('start') // start | testing | result
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      const res = await startDiagnosis('c_language', 10)
      if (res.data.length === 0) {
        message.warning('题库暂时为空，请联系管理员导入题目')
        return
      }
      setExercises(res.data)
      setAnswers({})
      setCurrent(0)
      setPhase('testing')
    } catch (e) {
      message.error('获取题目失败：' + (e.response?.data?.detail || '网络错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleAnswer = (exerciseId, answer) => {
    setAnswers({ ...answers, [exerciseId]: answer })
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const answerList = exercises.map((e) => ({
        exercise_id: e.id,
        answer: answers[e.id] || '',
      }))
      const res = await submitDiagnosis(answerList)
      setResult(res.data)
      setPhase('result')
    } catch (e) {
      message.error('提交失败')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'start') {
    return (
      <Card style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
        <Title level={3}>🩺 诊断测评</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          通过一组精选题目，快速定位你的薄弱知识点。
          <br />
          系统会根据你的答题情况，使用 BKT 算法智能评估掌握程度。
        </Text>
        <Button type="primary" size="large" onClick={handleStart} loading={loading}>
          开始诊断
        </Button>
      </Card>
    )
  }

  if (phase === 'testing') {
    const ex = exercises[current]
    const options = ex?.options || {}
    const answered = Object.keys(answers).length

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Steps
          current={current}
          size="small"
          style={{ marginBottom: 24 }}
          items={exercises.map((_, i) => ({
            title: `第${i + 1}题`,
            status: answers[exercises[i].id] ? 'finish' : i === current ? 'process' : 'wait',
          }))}
        />

        <Card>
          <Tag color="blue">{ex.knowledge_point_id}</Tag>
          <Tag color={ex.difficulty <= 2 ? 'green' : ex.difficulty <= 3 ? 'orange' : 'red'}>
            难度 {'⭐'.repeat(ex.difficulty)}
          </Tag>

          <Title level={5} style={{ marginTop: 16 }}>
            {current + 1}. {ex.question_text}
          </Title>

          <Radio.Group
            value={answers[ex.id]}
            onChange={(e) => handleAnswer(ex.id, e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {Object.entries(options).map(([key, value]) => (
                <Radio key={key} value={key} style={{ display: 'block', padding: '8px 0' }}>
                  <Text strong>{key}.</Text> {value}
                </Radio>
              ))}
            </Space>
          </Radio.Group>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}>
              上一题
            </Button>
            <Text type="secondary">
              已答 {answered}/{exercises.length}
            </Text>
            {current < exercises.length - 1 ? (
              <Button type="primary" onClick={() => setCurrent(current + 1)}>
                下一题
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={loading}
                disabled={answered < exercises.length}
              >
                提交诊断
              </Button>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // phase === 'result'
  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <Result
        status={result.accuracy >= 0.6 ? 'success' : 'warning'}
        title={`诊断完成！正确率 ${(result.accuracy * 100).toFixed(1)}%`}
        subTitle={`共 ${result.total} 题，答对 ${result.correct} 题`}
      />

      <Card title="📊 各知识点掌握度" style={{ marginBottom: 16 }}>
        {Object.entries(result.mastery_map).map(([kp, mastery]) => (
          <div key={kp} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>{kp}</Text>
              <Text type={mastery < 0.4 ? 'danger' : mastery < 0.7 ? 'warning' : 'success'}>
                {(mastery * 100).toFixed(1)}%
              </Text>
            </div>
            <Progress
              percent={Math.round(mastery * 100)}
              strokeColor={mastery < 0.4 ? '#ff4d4f' : mastery < 0.7 ? '#faad14' : '#52c41a'}
              showInfo={false}
            />
          </div>
        ))}
      </Card>

      {result.weak_points.length > 0 && (
        <Card title="⚠️ 薄弱知识点">
          <Space wrap>
            {result.weak_points.map((kp) => (
              <Tag key={kp} color="red">{kp}</Tag>
            ))}
          </Space>
        </Card>
      )}

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Space>
          <Button onClick={() => setPhase('start')}>重新诊断</Button>
          <Button type="primary" href="/path">查看学习路径 →</Button>
        </Space>
      </div>
    </div>
  )
}
