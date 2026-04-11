import React, { useMemo, useRef, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'

function getMasteryColor(mastery) {
  if (mastery == null) return '#d9d9d9'
  if (mastery < 0.4) return '#ff4d4f'
  if (mastery < 0.7) return '#faad14'
  return '#52c41a'
}

// 把扁平的 nodes/edges 转成 ECharts tree 需要的嵌套结构
// 以 chapter 分组，每章作为一个根节点
function buildTreeData(graphData) {
  if (!graphData) return []

  const { nodes, edges } = graphData
  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = { ...n } })

  // 建立 parent → children 映射（边方向：prerequisite，from → to）
  const childrenMap = {}
  edges.forEach(e => {
    if (!childrenMap[e.source]) childrenMap[e.source] = []
    childrenMap[e.source].push(e.target)
  })

  // 找出没有入边的节点（根节点）
  const hasParent = new Set(edges.map(e => e.target))
  const roots = nodes.filter(n => !hasParent.has(n.id))

  // 递归构建树节点
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
      // 第2层及以下默认折叠
      collapsed: depth >= 1,
      itemStyle: { color: getMasteryColor(node.mastery) },
      // 透传原始数据给 onNodeClick
      _raw: node,
      children: children.length ? children : undefined,
    }
  }

  return roots.map(r => buildNode(r.id)).filter(Boolean)
}

export default function TreeGraph({ graphData, onNodeClick }) {
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
      orient: 'LR',
      left: '5%',
      right: '20%',
      top: '5%',
      bottom: '5%',
      symbol: 'circle',
      symbolSize: 56,          // 加大，够放2-3个汉字
      expandAndCollapse: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      label: {
        position: 'inside',    // 在圆内
        fontSize: 11,
        fontWeight: 500,
        color: '#ffffff',
        overflow: 'truncate',
        width: 50,             // 配合 symbolSize 56
      },
      leaves: {
        label: {
          position: 'inside',
          fontSize: 11,
          fontWeight: 500,
          color: '#ffffff',
          overflow: 'truncate',
          width: 50,
        }
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