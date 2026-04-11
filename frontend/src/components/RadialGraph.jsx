import React, { useMemo, useRef, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'

function getMasteryColor(mastery) {
  if (mastery == null) return '#d9d9d9'
  if (mastery < 0.4) return '#ff4d4f'
  if (mastery < 0.7) return '#faad14'
  return '#52c41a'
}

// 复用同一份 buildTreeData 逻辑（可抽到 utils/graphUtils.js 共用）
function buildTreeData(graphData) {
  if (!graphData) return []
  const { nodes, edges } = graphData
  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = { ...n } })

  const childrenMap = {}
  edges.forEach(e => {
    if (!childrenMap[e.source]) childrenMap[e.source] = []
    childrenMap[e.source].push(e.target)
  })

  const hasParent = new Set(edges.map(e => e.target))
  const roots = nodes.filter(n => !hasParent.has(n.id))

  const visited = new Set()
  function buildNode(nodeId, depth = 0) {
    if (visited.has(nodeId)) return null
    visited.add(nodeId)
    const node = nodeMap[nodeId]
    if (!node) return null
    const children = (childrenMap[nodeId] || [])
      .map(cid => buildNode(cid, depth + 1))
      .filter(Boolean)
    return {
      name: node.name,
      id: node.id,
      value: node.mastery,
      collapsed: depth >= 1,
      itemStyle: { color: getMasteryColor(node.mastery) },
      _raw: node,
      children: children.length ? children : undefined,
    }
  }
  return roots.map(r => buildNode(r.id)).filter(Boolean)
}

export default function RadialGraph({ graphData, onNodeClick }) {
  const chartRef = useRef(null)
  const treeData = useMemo(() => buildTreeData(graphData), [graphData])

  const option = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const d = params.data
        if (!d._raw) return d.name
        const m = d._raw.mastery
        const mStr = m != null ? `${(m * 100).toFixed(1)}%` : '未测试'
        return `<b>${d.name}</b><br/>掌握度：${mStr}<br/>难度：${'⭐'.repeat(d._raw.difficulty || 3)}`
      }
    },

    series: [{
      type: 'tree',
      data: treeData,
      orient: 'radial',
      left: '5%',
      right: '5%',
      top: '5%',
      bottom: '5%',
      symbol: 'circle',
      symbolSize: 52,
      expandAndCollapse: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      label: {
        position: 'inside',
        fontSize: 10,
        fontWeight: 500,
        color: '#ffffff',
        overflow: 'truncate',
        width: 46,
      },
      lineStyle: { color: '#ccc', width: 1, curveness: 0.5 },
      emphasis: { focus: 'descendant' },
      initialTreeDepth: 1,
    }]
  }), [treeData])

  const handleClick = useCallback((params) => {
    if (params.dataType === 'node' && params.data._raw) {
      onNodeClick?.(params.data._raw)
    }
  }, [onNodeClick])

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ width: '100%', height: '100%' }}
      onEvents={{ click: handleClick }}
      notMerge={true}
    />
  )
}