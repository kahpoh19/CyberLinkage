import React, { useEffect, useState } from 'react'
import { Card, Drawer, Descriptions, Tag, Spin, Typography, Segmented, message, Empty } from 'antd'
import { ApartmentOutlined, RadarChartOutlined } from '@ant-design/icons'
import TreeGraph from '../components/TreeGraph'
import RadialGraph from '../components/RadialGraph'
import { getGraph } from '../api'

const { Title } = Typography

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewMode, setViewMode] = useState('tree') // 'tree' | 'radial'

  useEffect(() => { loadGraph() }, [])

  const loadGraph = async () => {
    try {
      const res = await getGraph('c_language')
      setGraphData(res.data)
    } catch (error) {
      console.error("图谱加载失败:", error)
      message.error("无法加载知识图谱数据，请检查网络或后端状态")
    }
    finally { setLoading(false) }
  }

  const handleNodeClick = (node) => {
    setSelectedNode(node)
    setDrawerOpen(true)
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>🗺️ C语言知识图谱</Title>
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: '树状图', value: 'tree', icon: <ApartmentOutlined /> },
              { label: '环状图', value: 'radial', icon: <RadarChartOutlined /> },
            ]}
          />
      </div>

      <div style={{ marginBottom: 16 }}>
      <Tag color="#ff4d4f">🔴 薄弱</Tag>
      <Tag color="#faad14">🟡 学习中</Tag>
      <Tag color="#52c41a">🟢 已掌握</Tag>
      <Tag color="#999">⚪ 未测试</Tag>
      <span style={{ marginLeft: 16, fontSize: 12, color: '#999' }}>
        {viewMode === 'tree'
          ? '💡 点击节点可展开 / 收起子知识点，再次点击查看详情'
          : '💡 拖动画布 / 滚轮缩放，点击知识点查看详情'}
      </span>
    </div>

      <Card style={{ height: 'calc(100vh - 280px)' }} bodyStyle={{ height: '100%', padding: 0 }}>
        {/* Check if data exists AND has nodes */}
        {!graphData || !graphData.nodes || graphData.nodes.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="暂无图谱数据或加载失败" />
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
        width={360}
      >
        {selectedNode && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="分类">{selectedNode.category || '-'}</Descriptions.Item>
            <Descriptions.Item label="难度">{'⭐'.repeat(selectedNode.difficulty || 3)}</Descriptions.Item>
            <Descriptions.Item label="掌握度">
              <Tag color={
                selectedNode.mastery == null ? '#999'
                : selectedNode.mastery < 0.4 ? '#ff4d4f'
                : selectedNode.mastery < 0.7 ? '#faad14' : '#52c41a'
              }>
                {selectedNode.mastery != null
                  ? `${(selectedNode.mastery * 100).toFixed(1)}%`
                  : '未测试'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预计时间">{selectedNode.estimated_minutes || 30} 分钟</Descriptions.Item>
            <Descriptions.Item label="说明">{selectedNode.description || '暂无'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}
