import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Drawer,
  Descriptions,
  Tag,
  Spin,
  Typography,
  Segmented,
  message,
  Empty,
  Button,
  Divider,
  Space,
} from 'antd'
import ApartmentOutlined from '@ant-design/icons/es/icons/ApartmentOutlined'
import RadarChartOutlined from '@ant-design/icons/es/icons/RadarChartOutlined'
import ReadOutlined from '@ant-design/icons/es/icons/ReadOutlined'
import RobotOutlined from '@ant-design/icons/es/icons/RobotOutlined'
import FileTextOutlined from '@ant-design/icons/es/icons/FileTextOutlined'
import TreeGraph from '../components/TreeGraph'
import RadialGraph from '../components/RadialGraph'
import ResourcePreviewModal from '../components/ResourcePreviewModal'
import { getGraph } from '../api'
import { filterFilesForStudent } from '../hooks/useFileAccess'
import useTeacherStore from '../store/teacherStore'
import useUserStore from '../store/userStore'
import {
  buildKnowledgeGraphPptDraft,
  deriveCorePoints,
  getGraphOverview,
  getNodeRelations,
} from '../utils/graphUtils'
import { buildFileSearchText } from '../utils/resourceFiles'

const { Title, Text } = Typography
const BANANA_SLIDES_PATH = '/banana-slides/'

function getMasteryTagColor(mastery) {
  if (mastery == null) return '#999'
  if (mastery < 0.4) return '#ff4d4f'
  if (mastery < 0.7) return '#faad14'
  return '#52c41a'
}

function buildNodeSearchPhrases(node, corePoints) {
  return [
    node?.name,
    node?.id,
    node?.category,
    ...(corePoints || []),
  ]
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => item && item.length >= 2)
}

function getRelatedFileScore(file, searchPhrases) {
  const haystack = buildFileSearchText(file)
  return searchPhrases.reduce((score, phrase) => {
    if (!haystack.includes(phrase)) return score
    if (phrase === String(file?.name || '').toLowerCase()) return score + 12
    return score + Math.max(3, phrase.length)
  }, 0)
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#111827' }}>
      {children}
    </div>
  )
}

export default function KnowledgeGraph() {
  const navigate = useNavigate()
  const currentSubject = useUserStore((s) => s.currentSubject)
  const subjects = useUserStore((s) => s.subjects)
  const resolvedTheme = useUserStore((s) => s.resolvedTheme)
  const subjectLabel = subjects.find(s => s.id === currentSubject)?.label || currentSubject
  const files = useTeacherStore((s) => s.files)
  const getBlobUrl = useTeacherStore((s) => s.getBlobUrl)

  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewMode, setViewMode] = useState('tree')
  const [previewFile, setPreviewFile] = useState(null)

  const loadGraph = useCallback(async () => {
    setLoading(true)
    setGraphData(null)
    try {
      const res = await getGraph(currentSubject)
      setGraphData(res.data)
    } catch (error) {
      console.error('图谱加载失败:', error)
      message.error('无法加载知识图谱数据，请检查网络或后端状态')
    } finally {
      setLoading(false)
    }
  }, [currentSubject])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
    setDrawerOpen(true)
  }, [])

  const visibleFiles = useMemo(
    () => filterFilesForStudent(files),
    [files],
  )

  const graphOverview = useMemo(
    () => getGraphOverview(graphData),
    [graphData],
  )

  const selectedCorePoints = useMemo(
    () => deriveCorePoints(selectedNode),
    [selectedNode],
  )

  const selectedRelations = useMemo(
    () => getNodeRelations(graphData, selectedNode?.id),
    [graphData, selectedNode],
  )

  const relatedFiles = useMemo(() => {
    if (!selectedNode) return []

    const searchPhrases = buildNodeSearchPhrases(selectedNode, selectedCorePoints)
    return visibleFiles
      .filter(file => file.subject === currentSubject)
      .map(file => ({
        ...file,
        _score: getRelatedFileScore(file, searchPhrases),
      }))
      .filter(file => file._score > 0)
      .sort((a, b) => b._score - a._score || (b.uploadedAt || 0) - (a.uploadedAt || 0))
      .slice(0, 5)
  }, [currentSubject, selectedCorePoints, selectedNode, visibleFiles])

  const openPptDraft = useCallback((focusNode = null) => {
    const draft = {
      source: 'knowledge-graph',
      activeTab: 'description',
      content: buildKnowledgeGraphPptDraft(subjectLabel, graphData, focusNode),
      importedAt: Date.now(),
    }

    sessionStorage.setItem('cyberlinkage:ppt-draft', JSON.stringify(draft))
    window.location.assign(BANANA_SLIDES_PATH)
  }, [graphData, subjectLabel])

  const openChatForNode = useCallback((node) => {
    navigate('/chat', {
      state: {
        currentTopicId: node.id,
        currentTopicName: node.name,
        presetInput: `我想系统理解「${node.name}」，请先帮我梳理这个知识点的核心概念、前置知识和常见误区。`,
      },
    })
  }, [navigate])

  const handleResourceDownload = useCallback((item) => {
    const url = getBlobUrl(item.id)
    if (!url) {
      alert('该文件当前无法下载（可能需要刷新页面后老师重新上传）。')
      return
    }
    const a = Object.assign(document.createElement('a'), { href: url, download: item.name })
    a.click()
  }, [getBlobUrl])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Title level={4} style={{ margin: 0 }}>
          🗺️ {subjectLabel} 知识图谱
        </Title>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: '树状图', value: 'tree', icon: <ApartmentOutlined /> },
            { label: '环状图', value: 'radial', icon: <RadarChartOutlined /> },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card size="small" bodyStyle={{ padding: 16 }}>
          <SectionTitle>重点梳理</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Tag color="blue">总知识点 {graphOverview.totalNodes}</Tag>
            <Tag color="cyan">章节 {graphOverview.chapterCount}</Tag>
            <Tag color="green">已掌握 {graphOverview.masteredCount}</Tag>
            <Tag color="gold">学习中 {graphOverview.learningCount}</Tag>
            <Tag color="red">待关注 {graphOverview.weakCount}</Tag>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
            点击下列知识点可直接打开详情、跳答疑，或整理成 PPT 草稿。
          </Text>
          <Space wrap>
            {graphOverview.focusNodes.map(node => (
              <Tag
                key={node.id}
                color={getMasteryTagColor(node.mastery)}
                style={{ cursor: 'pointer', padding: '4px 8px' }}
                onClick={() => handleNodeClick(node)}
              >
                {node.name}
              </Tag>
            ))}
          </Space>
        </Card>

        <Card size="small" bodyStyle={{ padding: 16 }}>
          <SectionTitle>跨模块联动</SectionTitle>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, lineHeight: 1.7 }}>
            可以直接把当前图谱或某个知识点整理成蕉幻 PPT 的可编辑草稿，进入后继续修改再生成。
          </Text>
          <Space wrap>
            <Button type="primary" icon={<ReadOutlined />} onClick={() => openPptDraft()}>
              整理整张图谱为 PPT
            </Button>
            {selectedNode && (
              <Button icon={<ReadOutlined />} onClick={() => openPptDraft(selectedNode)}>
                整理当前知识点
              </Button>
            )}
          </Space>
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Tag color="#ff4d4f">🔴 薄弱</Tag>
        <Tag color="#faad14">🟡 学习中</Tag>
        <Tag color="#52c41a">🟢 已掌握</Tag>
        <Tag color="#999">⚪ 未测试</Tag>
        <span style={{ marginLeft: 16, fontSize: 12, color: '#999' }}>
          💡 拖动画布 / 滚轮缩放，点击知识点查看详情与资料
        </span>
      </div>

      <Card style={{ height: 'calc(100vh - 410px)', minHeight: 420 }} bodyStyle={{ height: '100%', padding: 0 }}>
        {!graphData || !graphData.nodes || graphData.nodes.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={`「${subjectLabel}」暂无图谱数据`} />
          </div>
        ) : viewMode === 'tree' ? (
          <TreeGraph graphData={graphData} onNodeClick={handleNodeClick} />
        ) : (
          <RadialGraph graphData={graphData} onNodeClick={handleNodeClick} />
        )}
      </Card>

      <Drawer
        title={selectedNode?.name || '知识点详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
      >
        {selectedNode && (
          <>
            <Space wrap style={{ marginBottom: 14 }}>
              <Button type="primary" icon={<ReadOutlined />} onClick={() => openPptDraft(selectedNode)}>
                整理成 PPT 草稿
              </Button>
              <Button icon={<RobotOutlined />} onClick={() => openChatForNode(selectedNode)}>
                去 AI 答疑
              </Button>
            </Space>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="分类">{selectedNode.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="难度">{'⭐'.repeat(selectedNode.difficulty || 3)}</Descriptions.Item>
              <Descriptions.Item label="掌握度">
                <Tag color={getMasteryTagColor(selectedNode.mastery)}>
                  {selectedNode.mastery != null
                    ? `${(selectedNode.mastery * 100).toFixed(1)}%`
                    : '未测试'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预计时间">{selectedNode.estimated_minutes || 30} 分钟</Descriptions.Item>
              <Descriptions.Item label="说明">{selectedNode.description || '暂无'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <SectionTitle>核心要点</SectionTitle>
            {selectedCorePoints.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {selectedCorePoints.map(point => (
                  <div
                    key={point}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'rgba(14, 165, 233, 0.08)',
                      border: '1px solid rgba(14, 165, 233, 0.18)',
                    }}
                  >
                    {point}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可提炼的重点内容" />
            )}

            <Divider />

            <SectionTitle>前置知识</SectionTitle>
            {selectedRelations.prerequisites.length ? (
              <Space wrap>
                {selectedRelations.prerequisites.map(node => (
                  <Tag key={node.id} color="blue" style={{ cursor: 'pointer' }} onClick={() => handleNodeClick(node)}>
                    {node.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">暂无明显前置知识。</Text>
            )}

            <Divider />

            <SectionTitle>后续可衔接</SectionTitle>
            {selectedRelations.unlocks.length ? (
              <Space wrap>
                {selectedRelations.unlocks.map(node => (
                  <Tag key={node.id} color="purple" style={{ cursor: 'pointer' }} onClick={() => handleNodeClick(node)}>
                    {node.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">暂无直接后继知识点。</Text>
            )}

            <Divider />

            <SectionTitle>相关资料</SectionTitle>
            {relatedFiles.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {relatedFiles.map(file => (
                  <div
                    key={file.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid rgba(15, 23, 42, 0.08)',
                      background: 'rgba(248, 250, 252, 0.9)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>
                          <FileTextOutlined style={{ marginRight: 8 }} />
                          {file.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          匹配度 {file._score} · {subjectLabel}
                        </div>
                      </div>
                      <Space>
                        <Button size="small" onClick={() => setPreviewFile(file)}>
                          预览
                        </Button>
                        <Button size="small" onClick={() => handleResourceDownload(file)}>
                          下载
                        </Button>
                      </Space>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary">
                当前还没有和该知识点明显匹配的已发布资料。你可以先从上面的 PPT 草稿入口整理一份新的讲解内容。
              </Text>
            )}
          </>
        )}
      </Drawer>

      <ResourcePreviewModal
        open={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        getBlobUrl={getBlobUrl}
        onDownload={handleResourceDownload}
        theme={resolvedTheme}
      />
    </div>
  )
}
