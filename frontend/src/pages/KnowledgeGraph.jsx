import React, { useEffect, useState } from 'react'
import { Card, Drawer, Descriptions, Tag, Spin, Typography } from 'antd'
import GraphViewer from '../components/GraphViewer'
import { getGraph } from '../api'

const { Title, Text } = Typography

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    loadGraph()
  }, [])

  const loadGraph = async () => {
    try {
      const res = await getGraph('c_language')
      setGraphData(res.data)
    } catch {
      // fallback
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = (node) => {
    setSelectedNode(node)
    setDrawerOpen(true)
  }

  const getMasteryColor = (mastery) => {
    if (mastery === null || mastery === undefined) return '#999'
    if (mastery < 0.4) return '#ff4d4f'
    if (mastery < 0.7) return '#faad14'
    return '#52c41a'
  }

  const getMasteryLabel = (mastery) => {
    if (mastery === null || mastery === undefined) return '未测试'
    if (mastery < 0.4) return '薄弱'
    if (mastery < 0.7) return '学习中'
    return '已掌握'
  }

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  }

  // 转换为 ECharts 格式
  const nodes = (graphData?.nodes || []).map((n) => ({
    id: n.id,
    name: n.name,
    category: n.category,
    mastery: n.mastery,
    difficulty: n.difficulty,
    description: n.description,
    estimated_minutes: n.estimated_minutes,
    symbolSize: 30 + (n.difficulty || 3) * 8,
    itemStyle: { color: getMasteryColor(n.mastery) },
    label: { show: true, fontSize: 12 },
  }))

  const edges = (graphData?.edges || []).map((e) => ({
    source: e.source,
    target: e.target,
  }))

  return (
    <div>
      <Title level={4}>🗺️ C语言知识图谱</Title>
      <div style={{ marginBottom: 16 }}>
        <Tag color="#ff4d4f">🔴 薄弱 (&lt;40%)</Tag>
        <Tag color="#faad14">🟡 学习中 (40-70%)</Tag>
        <Tag color="#52c41a">🟢 已掌握 (&gt;70%)</Tag>
        <Tag color="#999">⚪ 未测试</Tag>
      </div>

      <Card style={{ height: 'calc(100vh - 260px)' }} bodyStyle={{ height: '100%', padding: 0 }}>
        <GraphViewer
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
        />
      </Card>

      <Drawer
        title={selectedNode?.name || '知识点详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={360}
      >
        {selectedNode && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="知识点">
              {selectedNode.name}
            </Descriptions.Item>
            <Descriptions.Item label="分类">
              {selectedNode.category || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="难度">
              {'⭐'.repeat(selectedNode.difficulty || 3)}
            </Descriptions.Item>
            <Descriptions.Item label="掌握度">
              <Tag color={getMasteryColor(selectedNode.mastery)}>
                {selectedNode.mastery !== null && selectedNode.mastery !== undefined
                  ? `${(selectedNode.mastery * 100).toFixed(1)}% — ${getMasteryLabel(selectedNode.mastery)}`
                  : getMasteryLabel(selectedNode.mastery)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预计学习时间">
              {selectedNode.estimated_minutes || 30} 分钟
            </Descriptions.Item>
            <Descriptions.Item label="说明">
              {selectedNode.description || '暂无描述'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}
