import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Select, message } from 'antd'
import { generateQuestionBank, getGraph, persistQuestionBankQuestions } from '../api'

const FIELD_LABEL_STYLE = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--t-text-sub)',
  display: 'block',
  marginBottom: 8,
}

const INPUT_STYLE = {
  width: '100%',
  height: 40,
  borderRadius: 10,
  border: '0.5px solid var(--t-border-acc)',
  background: 'var(--t-input-bg)',
  color: 'var(--t-text)',
  padding: '0 12px',
  boxSizing: 'border-box',
}

const TEXTAREA_STYLE = {
  width: '100%',
  minHeight: 116,
  resize: 'vertical',
  borderRadius: 14,
  border: '0.5px solid var(--t-border-acc)',
  background: 'var(--t-input-bg)',
  color: 'var(--t-text)',
  padding: '12px 14px',
  boxSizing: 'border-box',
  lineHeight: 1.7,
  fontSize: 13,
}

const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: '单选题' },
  { value: 'true_false', label: '判断题' },
]

const QUESTION_TYPE_LABELS = Object.fromEntries(
  QUESTION_TYPE_OPTIONS.map(item => [item.value, item.label]),
)

function resolvePreferredSubjectId(subjects, currentSubject) {
  if (subjects.some(subject => subject.id === currentSubject)) return currentSubject
  if (subjects.some(subject => subject.id === 'c_language')) return 'c_language'
  return subjects[0]?.id || 'c_language'
}

const clampQuestionCount = value => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 3
  return Math.min(10, Math.max(1, parsed))
}

const keepMinimumOnDelete = (nextValue, previousValue, minimumValue) => {
  const normalized = String(nextValue ?? '').replace(/[^\d]/g, '')
  return normalized === '' && previousValue === String(minimumValue)
    ? String(minimumValue)
    : normalized
}

const getApiErrorMessage = error =>
  error?.response?.data?.detail
  || error?.response?.data?.message
  || error?.message
  || '请求失败，请稍后重试'

const getQuestionTypeLabel = type =>
  QUESTION_TYPE_LABELS[type] || QUESTION_TYPE_LABELS.single_choice

const normalizeQuestionType = type =>
  type === 'true_false' ? 'true_false' : 'single_choice'

const getQuestionOptionKeys = questionType =>
  normalizeQuestionType(questionType) === 'true_false'
    ? ['A', 'B']
    : ['A', 'B', 'C', 'D']

function createQuestionOptions(questionType, rawOptions = {}) {
  const normalizedType = normalizeQuestionType(questionType)
  const optionKeys = getQuestionOptionKeys(normalizedType)
  const nextOptions = {}

  optionKeys.forEach((key, index) => {
    const fallback = normalizedType === 'true_false'
      ? (index === 0 ? '正确' : '错误')
      : ''
    nextOptions[key] = String(rawOptions?.[key] ?? rawOptions?.[key.toLowerCase()] ?? fallback).trim()
  })

  return nextOptions
}

function createQuestionDraft(overrides = {}) {
  const questionType = normalizeQuestionType(overrides.question_type || overrides.questionType)
  const optionKeys = getQuestionOptionKeys(questionType)
  const correctAnswer = String(overrides.correct_answer || 'A').trim().toUpperCase()
  const nextCorrectAnswer = optionKeys.includes(correctAnswer) ? correctAnswer : optionKeys[0]
  const difficulty = Number.parseInt(overrides.difficulty, 10)

  return {
    knowledge_point_id: String(overrides.knowledge_point_id || '').trim(),
    question_type: questionType,
    question_text: String(overrides.question_text || '').trim(),
    options: createQuestionOptions(questionType, overrides.options),
    correct_answer: nextCorrectAnswer,
    difficulty: Number.isNaN(difficulty) ? 3 : Math.min(5, Math.max(1, difficulty)),
    explanation: String(overrides.explanation || '').trim(),
  }
}

function validateQuestionDraft(question) {
  const draft = createQuestionDraft(question)
  const optionKeys = getQuestionOptionKeys(draft.question_type)

  if (!draft.knowledge_point_id) return '请选择题目对应的知识点'
  if (!draft.question_text) return '请输入题干'

  for (const key of optionKeys) {
    if (!draft.options[key]) {
      return `${getQuestionTypeLabel(draft.question_type)}的 ${key} 选项不能为空`
    }
  }

  if (!optionKeys.includes(draft.correct_answer)) {
    return `正确答案必须是 ${optionKeys.join('/')} 之一`
  }

  return ''
}

function sanitizeQuestionDraft(question) {
  const draft = createQuestionDraft(question)
  const validationError = validateQuestionDraft(draft)
  if (validationError) {
    throw new Error(validationError)
  }
  return draft
}

function normalizeQuestionBankResult(data) {
  const questions = (data?.questions || []).map(item => createQuestionDraft(item))
  const knowledgePoints = data?.knowledge_points?.length
    ? data.knowledge_points
    : Array.from(new Set(questions.map(item => item.knowledge_point_id).filter(Boolean)))

  return {
    ...data,
    knowledge_points: knowledgePoints,
    generated_count: typeof data?.generated_count === 'number' ? data.generated_count : questions.length,
    persisted_count: typeof data?.persisted_count === 'number' ? data.persisted_count : 0,
    replaced_count: typeof data?.replaced_count === 'number' ? data.replaced_count : 0,
    questions,
  }
}

function toDraftResult(previousResult, questions) {
  return {
    ...(previousResult || {}),
    generated_count: questions.length,
    persisted_count: 0,
    replaced_count: 0,
    knowledge_points: Array.from(new Set(questions.map(item => item.knowledge_point_id).filter(Boolean))),
    questions,
  }
}

function PanelCard({ accent, children }) {
  return (
    <div style={{
      marginBottom: 20,
      padding: 20,
      borderRadius: 20,
      border: `0.5px solid ${accent}`,
      background: 'linear-gradient(180deg, rgba(15,23,42,0.18), rgba(15,23,42,0.10))',
      boxShadow: '0 18px 42px rgba(2,6,23,0.12)',
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--t-text)',
      marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

function ActionButton({ onClick, disabled, busy, accent, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        minWidth: 144,
        height: 40,
        padding: '0 16px',
        borderRadius: 12,
        border: `1px solid ${accent}`,
        background: busy ? `${accent}22` : `${accent}14`,
        color: disabled ? 'var(--t-text-sub)' : '#f8fafc',
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: busy ? `0 0 18px ${accent}33` : 'none',
        opacity: disabled ? 0.55 : 1,
        transition: 'all 0.18s ease',
      }}
    >
      {busy ? '处理中...' : children}
    </button>
  )
}

function SmallButton({ onClick, children, accent = '#38bdf8', tone = 'soft' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `0.5px solid ${tone === 'danger' ? 'rgba(248,113,113,0.36)' : `${accent}55`}`,
        background: tone === 'danger' ? 'rgba(248,113,113,0.10)' : `${accent}14`,
        color: tone === 'danger' ? '#fca5a5' : accent,
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function QuestionSummaryBar({ result, scopeLabel }) {
  if (!result) return null

  const chips = [
    { label: '当前题数', value: `${result.generated_count || 0} 题`, color: '#22c55e' },
    { label: '最近入库', value: `${result.persisted_count || 0} 题`, color: '#38bdf8' },
    { label: '最近替换', value: `${result.replaced_count || 0} 题`, color: '#f59e0b' },
    { label: '范围', value: scopeLabel, color: '#c084fc' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 10,
      marginBottom: 16,
    }}>
      {chips.map(chip => (
        <div
          key={chip.label}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: `0.5px solid ${chip.color}55`,
            background: `${chip.color}12`,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t-text-sub)', marginBottom: 4 }}>{chip.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{chip.value}</div>
        </div>
      ))}
    </div>
  )
}

function QuestionPreviewCard({ item, index }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 14,
      border: '0.5px solid var(--t-border)',
      background: 'var(--t-row)',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#c084fc',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          第 {index + 1} 题
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(56,189,248,0.12)',
          border: '0.5px solid rgba(56,189,248,0.28)',
        }}>
          {item.knowledge_point_id}
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(245,158,11,0.12)',
          border: '0.5px solid rgba(245,158,11,0.28)',
        }}>
          {getQuestionTypeLabel(item.question_type)}
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(16,185,129,0.12)',
          border: '0.5px solid rgba(16,185,129,0.28)',
        }}>
          难度 {item.difficulty}
        </span>
      </div>

      <div style={{
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.65,
        color: 'var(--t-text)',
        whiteSpace: 'pre-wrap',
        marginBottom: 12,
      }}>
        {item.question_text}
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {Object.entries(item.options || {}).map(([key, value]) => {
          const isAnswer = key === item.correct_answer
          return (
            <div
              key={key}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: isAnswer
                  ? '0.5px solid rgba(34,197,94,0.40)'
                  : '0.5px solid var(--t-border)',
                background: isAnswer
                  ? 'rgba(34,197,94,0.10)'
                  : 'rgba(255,255,255,0.02)',
                color: 'var(--t-text)',
                fontSize: 13,
              }}
            >
              <strong style={{ color: isAnswer ? '#22c55e' : 'var(--t-text-sub)' }}>{key}.</strong>{' '}
              {value}
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(192,132,252,0.10)',
        border: '0.5px solid rgba(192,132,252,0.22)',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--t-text-sub)',
      }}>
        <strong style={{ color: '#c084fc' }}>解析：</strong>
        {item.explanation || '暂无解析'}
      </div>
    </div>
  )
}

function QuestionEditorFields({
  question,
  knowledgePointOptions,
  disabled,
  onChange,
}) {
  const optionKeys = getQuestionOptionKeys(question.question_type)

  const updateDraft = patch => {
    onChange(createQuestionDraft({ ...question, ...patch }))
  }

  return (
    <div style={{
      marginTop: 12,
      padding: 14,
      borderRadius: 14,
      border: '0.5px solid rgba(56,189,248,0.24)',
      background: 'rgba(15,23,42,0.20)',
      display: 'grid',
      gap: 14,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
      }}>
        <div>
          <label style={FIELD_LABEL_STYLE}>知识点</label>
          <Select
            disabled={disabled}
            value={question.knowledge_point_id || undefined}
            onChange={value => updateDraft({ knowledge_point_id: value })}
            options={knowledgePointOptions}
            placeholder="请选择知识点"
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={FIELD_LABEL_STYLE}>题型</label>
          <Select
            disabled={disabled}
            value={question.question_type}
            onChange={value => {
              const nextType = normalizeQuestionType(value)
              const nextOptionKeys = getQuestionOptionKeys(nextType)
              updateDraft({
                question_type: nextType,
                options: createQuestionOptions(nextType, question.options),
                correct_answer: nextOptionKeys.includes(question.correct_answer)
                  ? question.correct_answer
                  : nextOptionKeys[0],
              })
            }}
            options={QUESTION_TYPE_OPTIONS}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={FIELD_LABEL_STYLE}>难度</label>
          <input
            type="number"
            min="1"
            max="5"
            disabled={disabled}
            value={question.difficulty}
            onChange={event => updateDraft({ difficulty: event.target.value })}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div>
        <label style={FIELD_LABEL_STYLE}>题干</label>
        <textarea
          disabled={disabled}
          value={question.question_text}
          onChange={event => updateDraft({ question_text: event.target.value })}
          style={{ ...TEXTAREA_STYLE, minHeight: 98 }}
          placeholder="请输入完整题干"
        />
      </div>

      <div>
        <label style={FIELD_LABEL_STYLE}>选项</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {optionKeys.map(key => (
            <div key={key}>
              <label style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>{key} 选项</label>
              <input
                type="text"
                disabled={disabled}
                value={question.options?.[key] || ''}
                onChange={event => updateDraft({
                  options: {
                    ...question.options,
                    [key]: event.target.value,
                  },
                })}
                style={INPUT_STYLE}
                placeholder={`请输入 ${key} 选项`}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 280px)',
        gap: 14,
      }}>
        <div>
          <label style={FIELD_LABEL_STYLE}>正确答案</label>
          <Select
            disabled={disabled}
            value={question.correct_answer}
            onChange={value => updateDraft({ correct_answer: value })}
            options={optionKeys.map(key => ({ value: key, label: `${key} 选项` }))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div>
        <label style={FIELD_LABEL_STYLE}>解析</label>
        <textarea
          disabled={disabled}
          value={question.explanation}
          onChange={event => updateDraft({ explanation: event.target.value })}
          style={{ ...TEXTAREA_STYLE, minHeight: 88 }}
          placeholder="请输入解析，帮助学生复盘"
        />
      </div>
    </div>
  )
}

function useSubjectKnowledge(subjects, currentSubject) {
  const [subjectId, setSubjectId] = useState(() => resolvePreferredSubjectId(subjects, currentSubject))
  const [knowledgePoints, setKnowledgePoints] = useState([])
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState('')

  useEffect(() => {
    if (!subjects.some(subject => subject.id === subjectId)) {
      setSubjectId(resolvePreferredSubjectId(subjects, currentSubject))
    }
  }, [subjects, currentSubject, subjectId])

  useEffect(() => {
    let cancelled = false

    const loadGraph = async () => {
      setGraphLoading(true)
      setGraphError('')

      try {
        const response = await getGraph(subjectId)
        if (cancelled) return

        const nodes = [...(response.data?.nodes || [])].sort((a, b) => (
          (a.chapter || 0) - (b.chapter || 0)
          || (a.difficulty || 0) - (b.difficulty || 0)
          || String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-CN')
        ))

        setKnowledgePoints(nodes)
        if (!nodes.length) {
          setGraphError('当前科目还没有知识图谱数据，暂时无法把题目挂到知识点下。')
        }
      } catch (error) {
        if (cancelled) return
        setKnowledgePoints([])
        setGraphError(getApiErrorMessage(error))
      } finally {
        if (!cancelled) setGraphLoading(false)
      }
    }

    if (subjectId) loadGraph()

    return () => {
      cancelled = true
    }
  }, [subjectId])

  const knowledgePointOptions = useMemo(() => (
    knowledgePoints.map(node => ({
      value: node.id,
      label: `第 ${node.chapter || 0} 章 · ${node.name || node.id} (${node.id})`,
    }))
  ), [knowledgePoints])

  return {
    subjectId,
    setSubjectId,
    knowledgePoints,
    knowledgePointOptions,
    graphLoading,
    graphError,
  }
}

function AIGenerationPanel({ subjects, currentSubject }) {
  const {
    subjectId,
    setSubjectId,
    knowledgePoints,
    knowledgePointOptions,
    graphLoading,
    graphError,
  } = useSubjectKnowledge(subjects, currentSubject)

  const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState([])
  const [useAllKnowledgePoints, setUseAllKnowledgePoints] = useState(false)
  const [questionsPerPointDraft, setQuestionsPerPointDraft] = useState('3')
  const [questionType, setQuestionType] = useState('single_choice')
  const [customInstructions, setCustomInstructions] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [requestState, setRequestState] = useState('')
  const [result, setResult] = useState(null)
  const [showAllQuestions, setShowAllQuestions] = useState(false)
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(-1)

  useEffect(() => {
    setSelectedKnowledgePointIds(previous =>
      previous.filter(id => knowledgePoints.some(node => node.id === id)))
    setResult(null)
    setShowAllQuestions(false)
    setEditingQuestionIndex(-1)
  }, [subjectId, knowledgePoints])

  const selectedCount = useAllKnowledgePoints
    ? knowledgePoints.length
    : selectedKnowledgePointIds.length

  const canSubmit = !!subjectId
    && knowledgePoints.length > 0
    && (useAllKnowledgePoints || selectedKnowledgePointIds.length > 0)
    && !graphLoading

  const hasPreviewQuestions = (result?.questions || []).length > 0
  const previewQuestions = showAllQuestions
    ? result?.questions || []
    : (result?.questions || []).slice(0, 6)

  const runGeneration = useCallback(async (persist) => {
    if (!canSubmit) {
      message.warning(
        graphLoading
          ? '知识点还在加载中，请稍等一下'
          : '请先选择至少一个知识点，或勾选“使用该科目全部知识点”'
      )
      return
    }

    setRequestState(persist ? 'persist' : 'preview')
    try {
      const normalizedQuestionsPerPoint = clampQuestionCount(questionsPerPointDraft)
      setQuestionsPerPointDraft(String(normalizedQuestionsPerPoint))

      const response = await generateQuestionBank({
        subject_id: subjectId,
        knowledge_point_ids: useAllKnowledgePoints ? [] : selectedKnowledgePointIds,
        questions_per_point: normalizedQuestionsPerPoint,
        question_type: questionType,
        custom_instructions: customInstructions.trim() || undefined,
        persist,
        replace_existing: replaceExisting,
      })

      const nextResult = normalizeQuestionBankResult(response.data)
      setResult(nextResult)
      setShowAllQuestions(nextResult.questions.length <= 6)
      setEditingQuestionIndex(-1)
      message.success(
        persist
          ? `题库已更新，成功写入 ${nextResult.persisted_count} 道题`
          : `已生成 ${nextResult.generated_count} 道题预览`
      )
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      setRequestState('')
    }
  }, [
    canSubmit,
    customInstructions,
    graphLoading,
    questionType,
    questionsPerPointDraft,
    replaceExisting,
    selectedKnowledgePointIds,
    subjectId,
    useAllKnowledgePoints,
  ])

  const mutatePreviewQuestions = updater => {
    setResult(previous => {
      if (!previous) return previous
      const nextQuestions = updater(previous.questions || [])
      return toDraftResult(previous, nextQuestions)
    })
  }

  const updatePreviewQuestion = (index, nextQuestion) => {
    mutatePreviewQuestions(questions =>
      questions.map((item, itemIndex) => (
        itemIndex === index ? createQuestionDraft(nextQuestion) : item
      )))
  }

  const removePreviewQuestion = index => {
    mutatePreviewQuestions(questions => questions.filter((_, itemIndex) => itemIndex !== index))
    setEditingQuestionIndex(current => (current === index ? -1 : current > index ? current - 1 : current))
  }

  const persistPreview = useCallback(async () => {
    if (!result || !hasPreviewQuestions) {
      message.warning('请先预览生成题目，再导入当前草稿')
      return
    }

    setRequestState('persist-preview')
    try {
      const response = await persistQuestionBankQuestions({
        subject_id: result.subject_id || subjectId,
        subject_name: result.subject_name || subjectId,
        questions: (result.questions || []).map(item => sanitizeQuestionDraft(item)),
        replace_existing: replaceExisting,
      })

      const nextResult = normalizeQuestionBankResult(response.data)
      setResult(nextResult)
      setShowAllQuestions(nextResult.questions.length <= 6)
      setEditingQuestionIndex(-1)
      message.success(`已导入当前草稿，成功写入 ${nextResult.persisted_count} 道题`)
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      setRequestState('')
    }
  }, [hasPreviewQuestions, replaceExisting, result, subjectId])

  return (
    <PanelCard accent="rgba(16,185,129,0.28)">
      <SectionTitle>AI 出题与可编辑草稿</SectionTitle>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 18,
        marginBottom: 18,
      }}>
        <div>
          <label style={FIELD_LABEL_STYLE}>目标科目</label>
          <Select
            value={subjectId}
            onChange={value => setSubjectId(value)}
            options={subjects.map(subject => ({ value: subject.id, label: subject.label }))}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={FIELD_LABEL_STYLE}>每个知识点题量</label>
          <input
            type="number"
            min="1"
            max="10"
            value={questionsPerPointDraft}
            onChange={event => setQuestionsPerPointDraft(previousValue => (
              keepMinimumOnDelete(event.target.value, previousValue, 1)
            ))}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label style={FIELD_LABEL_STYLE}>目标题型</label>
          <Select
            value={questionType}
            onChange={setQuestionType}
            options={QUESTION_TYPE_OPTIONS}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)' }}>
          <input
            type="checkbox"
            checked={useAllKnowledgePoints}
            onChange={event => setUseAllKnowledgePoints(event.target.checked)}
          />
          使用该科目全部知识点
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)' }}>
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={event => setReplaceExisting(event.target.checked)}
          />
          替换同知识点旧题
        </label>

        <span style={{ fontSize: 12, color: selectedCount > 0 ? '#34d399' : 'var(--t-text-sub)' }}>
          当前将处理 {selectedCount || 0} 个知识点
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={FIELD_LABEL_STYLE}>指定知识点</label>
        <Select
          mode="multiple"
          allowClear
          disabled={useAllKnowledgePoints || graphLoading || !knowledgePoints.length}
          value={selectedKnowledgePointIds}
          onChange={setSelectedKnowledgePointIds}
          options={knowledgePointOptions}
          placeholder={
            graphLoading
              ? '知识图谱加载中...'
              : useAllKnowledgePoints
                ? '已切换为全知识点模式'
                : '请选择一个或多个知识点'
          }
          maxTagCount="responsive"
          style={{ width: '100%' }}
        />
        {graphError && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '8px 0 0', lineHeight: 1.6 }}>
            {graphError}
          </p>
        )}
      </div>

      <div style={{ marginBottom: hasPreviewQuestions ? 18 : 16 }}>
        <label style={FIELD_LABEL_STYLE}>AI 对话框 / 老师要求</label>
        <div style={{
          padding: 14,
          borderRadius: 16,
          border: '0.5px solid rgba(56,189,248,0.22)',
          background: 'linear-gradient(180deg, rgba(56,189,248,0.10), rgba(15,23,42,0.18))',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7dd3fc', marginBottom: 6 }}>你可以直接把想要的题目写给 AI</div>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--t-text-sub)' }}>
            例如直接写题干、限定题型、要求题目难度、出题风格，甚至把你想要的选项和答案结构都写进去。AI 会优先照着老师要求生成。
          </div>
        </div>
        <textarea
          value={customInstructions}
          onChange={event => setCustomInstructions(event.target.value)}
          onKeyDown={event => event.stopPropagation()}
          style={TEXTAREA_STYLE}
          placeholder={'例如：\n1. 按“机械原理研究对象”这个题目风格生成。\n2. 难度控制在 1-2 星。\n3. 干扰项不要太离谱。\n4. 如果我已经给了题干或选项，请尽量不要改写。\n5. 题型保持为当前选择的题型。'}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: hasPreviewQuestions ? 18 : 0 }}>
        <ActionButton
          onClick={() => runGeneration(false)}
          disabled={!canSubmit}
          busy={requestState === 'preview'}
          accent="#38bdf8"
        >
          预览生成
        </ActionButton>
        {hasPreviewQuestions ? (
          <ActionButton
            onClick={persistPreview}
            disabled={!hasPreviewQuestions}
            busy={requestState === 'persist-preview'}
            accent="#22c55e"
          >
            导入当前草稿
          </ActionButton>
        ) : (
          <ActionButton
            onClick={() => runGeneration(true)}
            disabled={!canSubmit}
            busy={requestState === 'persist'}
            accent="#22c55e"
          >
            生成并入库
          </ActionButton>
        )}
      </div>

      {hasPreviewQuestions && (
        <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '0 0 18px', lineHeight: 1.7 }}>
          下面这批题已经变成老师可编辑草稿。你可以逐题修改、删除，再把当前草稿直接导入题库。
        </p>
      )}

      {result && (
        <div style={{ marginTop: 18 }}>
          <QuestionSummaryBar
            result={result}
            scopeLabel={useAllKnowledgePoints
              ? `全科目 ${result.knowledge_points.length} 个知识点`
              : `${selectedCount || result.knowledge_points.length} 个知识点`}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>最近一次 AI 草稿</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-sub)', marginTop: 4 }}>
                {result.subject_name} · 共 {result.questions.length} 道可编辑草稿
              </div>
            </div>

            {result.questions.length > 6 && (
              <SmallButton onClick={() => setShowAllQuestions(current => !current)}>
                {showAllQuestions ? '收起为前 6 道' : `显示全部 ${result.questions.length} 道`}
              </SmallButton>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {previewQuestions.map((item, index) => {
              const questionIndex = index

              return (
                <div key={`${item.knowledge_point_id}-${questionIndex}-${item.question_text}`}>
                  <QuestionPreviewCard item={item} index={questionIndex} />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    <SmallButton onClick={() => setEditingQuestionIndex(current => (current === questionIndex ? -1 : questionIndex))}>
                      {editingQuestionIndex === questionIndex ? '收起编辑' : '编辑这题'}
                    </SmallButton>
                    <SmallButton
                      onClick={() => removePreviewQuestion(questionIndex)}
                      tone="danger"
                    >
                      删除这题
                    </SmallButton>
                  </div>

                  {editingQuestionIndex === questionIndex && (
                    <QuestionEditorFields
                      question={result.questions[questionIndex]}
                      knowledgePointOptions={knowledgePointOptions}
                      onChange={nextQuestion => updatePreviewQuestion(questionIndex, nextQuestion)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </PanelCard>
  )
}

function ManualQuestionPanel({ subjects, currentSubject }) {
  const {
    subjectId,
    setSubjectId,
    knowledgePoints,
    knowledgePointOptions,
    graphLoading,
    graphError,
  } = useSubjectKnowledge(subjects, currentSubject)

  const [replaceExisting, setReplaceExisting] = useState(true)
  const [requestState, setRequestState] = useState('')
  const [draftQuestion, setDraftQuestion] = useState(() => createQuestionDraft())
  const [manualQuestions, setManualQuestions] = useState([])
  const [editingIndex, setEditingIndex] = useState(-1)
  const [result, setResult] = useState(null)

  useEffect(() => {
    setManualQuestions([])
    setEditingIndex(-1)
    setResult(null)
  }, [subjectId])

  useEffect(() => {
    setDraftQuestion(previous => {
      const nextKnowledgePointId = knowledgePoints.some(node => node.id === previous.knowledge_point_id)
        ? previous.knowledge_point_id
        : knowledgePoints[0]?.id || ''

      return createQuestionDraft({
        ...previous,
        knowledge_point_id: nextKnowledgePointId,
      })
    })
  }, [knowledgePoints])

  const subjectLabel = subjects.find(item => item.id === subjectId)?.label || subjectId
  const manualScopeCount = Array.from(new Set(manualQuestions.map(item => item.knowledge_point_id).filter(Boolean))).length
  const manualSummaryResult = manualQuestions.length > 0
    ? {
      generated_count: manualQuestions.length,
      persisted_count: 0,
      replaced_count: 0,
    }
    : result

  const addOrUpdateDraft = () => {
    try {
      const sanitized = sanitizeQuestionDraft(draftQuestion)
      setManualQuestions(previous => {
        if (editingIndex >= 0) {
          return previous.map((item, index) => (index === editingIndex ? sanitized : item))
        }
        return [...previous, sanitized]
      })
      setDraftQuestion(createQuestionDraft({
        question_type: sanitized.question_type,
        knowledge_point_id: sanitized.knowledge_point_id,
        difficulty: sanitized.difficulty,
      }))
      setEditingIndex(-1)
      message.success(editingIndex >= 0 ? '题目草稿已更新' : '题目已加入待入库列表')
    } catch (error) {
      message.warning(error.message)
    }
  }

  const importManualQuestions = async () => {
    if (!manualQuestions.length) {
      message.warning('请先至少添加一道手动题目')
      return
    }

    setRequestState('persist-manual')
    try {
      const response = await persistQuestionBankQuestions({
        subject_id: subjectId,
        subject_name: subjectLabel,
        questions: manualQuestions.map(item => sanitizeQuestionDraft(item)),
        replace_existing: replaceExisting,
      })

      setResult(normalizeQuestionBankResult(response.data))
      setManualQuestions([])
      setEditingIndex(-1)
      message.success(`手动题目已入库，成功写入 ${response.data.persisted_count} 道题`)
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      setRequestState('')
    }
  }

  return (
    <PanelCard accent="rgba(245,158,11,0.24)">
      <SectionTitle>老师手动录题入库</SectionTitle>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 18,
        marginBottom: 18,
      }}>
        <div>
          <label style={FIELD_LABEL_STYLE}>目标科目</label>
          <Select
            value={subjectId}
            onChange={value => setSubjectId(value)}
            options={subjects.map(subject => ({ value: subject.id, label: subject.label }))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)' }}>
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={event => setReplaceExisting(event.target.checked)}
            />
            替换同知识点旧题
          </label>
        </div>
      </div>

      {graphError && (
        <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 12px', lineHeight: 1.6 }}>
          {graphError}
        </p>
      )}

      <QuestionEditorFields
        question={draftQuestion}
        knowledgePointOptions={knowledgePointOptions}
        disabled={graphLoading || !knowledgePoints.length}
        onChange={setDraftQuestion}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <ActionButton
          onClick={addOrUpdateDraft}
          disabled={graphLoading || !knowledgePoints.length}
          accent="#f59e0b"
        >
          {editingIndex >= 0 ? '更新当前草稿' : '加入待入库列表'}
        </ActionButton>
        <ActionButton
          onClick={() => {
            setDraftQuestion(createQuestionDraft({
              knowledge_point_id: knowledgePoints[0]?.id || '',
              question_type: draftQuestion.question_type,
            }))
            setEditingIndex(-1)
          }}
          disabled={graphLoading || !knowledgePoints.length}
          accent="#64748b"
        >
          清空当前填写
        </ActionButton>
        <ActionButton
          onClick={importManualQuestions}
          disabled={!manualQuestions.length}
          busy={requestState === 'persist-manual'}
          accent="#22c55e"
        >
          导入手动题目
        </ActionButton>
      </div>

      <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '12px 0 0', lineHeight: 1.7 }}>
        当前支持老师手动录入 {QUESTION_TYPE_OPTIONS.map(item => item.label).join(' / ')}。题目先进入待入库列表，确认后再一次性写入题库。
      </p>

      {(manualQuestions.length > 0 || result) && (
        <div style={{ marginTop: 18 }}>
          <QuestionSummaryBar
            result={manualSummaryResult}
            scopeLabel={`${manualScopeCount || result?.knowledge_points?.length || 0} 个知识点`}
          />

          {manualQuestions.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)', marginBottom: 12 }}>
                待入库列表
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {manualQuestions.map((item, index) => (
                  <div key={`${item.knowledge_point_id}-${index}-${item.question_text}`}>
                    <QuestionPreviewCard item={item} index={index} />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                      <SmallButton
                        onClick={() => {
                          setDraftQuestion(createQuestionDraft(item))
                          setEditingIndex(index)
                        }}
                      >
                        载入编辑
                      </SmallButton>
                      <SmallButton
                        onClick={() => {
                          setManualQuestions(previous => previous.filter((_, itemIndex) => itemIndex !== index))
                          setEditingIndex(current => (current === index ? -1 : current > index ? current - 1 : current))
                        }}
                        tone="danger"
                      >
                        删除这题
                      </SmallButton>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </PanelCard>
  )
}

export default function QuestionBankManager({ subjects, currentSubject }) {
  return (
    <>
      <ManualQuestionPanel subjects={subjects} currentSubject={currentSubject} />
      <AIGenerationPanel subjects={subjects} currentSubject={currentSubject} />
    </>
  )
}
