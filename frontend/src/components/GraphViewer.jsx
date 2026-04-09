import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 知识图谱 — 固定分层布局（按 chapter 分行，同 chapter 节点水平排列）
 *
 * Props:
 *   nodes: [{ id, name, symbolSize, itemStyle, category, chapter, difficulty, mastery, ... }]
 *   edges: [{ source, target }]
 *   onNodeClick: (nodeData) => void
 */
export default function GraphViewer({ nodes = [], edges = [], onNodeClick }) {
  // 按 chapter 分组，计算固定坐标
  const positionedNodes = useMemo(() => {
    if (!nodes.length) return []

    // 按 chapter 分组
    const groups = {}
    nodes.forEach((n) => {
      const ch = n.chapter || 0
      if (!groups[ch]) groups[ch] = []
      groups[ch].push(n)
    })

    const chapters = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)

    const ySpacing = 120 // 行间距
    const result = []

    chapters.forEach((ch, rowIndex) => {
      const row = groups[ch]
      const xSpacing = 160 // 列间距
      const totalWidth = (row.length - 1) * xSpacing
      const xOffset = -totalWidth / 2 // 居中

      row.forEach((node, colIndex) => {
        result.push({
          ...node,
          x: xOffset + colIndex * xSpacing,
          y: rowIndex * ySpacing,
          fixed: true,
        })
      })
    })

    return result
  }, [nodes])

  const option = {
    tooltip: {
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data
          const mastery =
            d.mastery !== null && d.mastery !== undefined
              ? `${(d.mastery * 100).toFixed(1)}%`
              : '未测试'
          return `
            <b>${d.name}</b><br/>
            分类：${d.category || '-'}<br/>
            掌握度：${mastery}<br/>
            难度：${'⭐'.repeat(d.difficulty || 3)}
          `
        }
        return ''
      },
    },
    animationDuration: 800,
    series: [
      {
        type: 'graph',
        layout: 'none', // 使用固定坐标，不用力导向
        roam: true, // 允许缩放和平移查看，但节点不可拖
        draggable: false,
        label: {
          show: true,
          position: 'bottom',
          fontSize: 11,
          color: '#333',
          formatter: (params) => {
            const name = params.data.name || ''
            // 名字太长换行
            return name.length > 6 ? name.slice(0, 6) + '\n' + name.slice(6) : name
          },
        },
        lineStyle: {
          color: '#bbb',
          curveness: 0.2,
          width: 1.5,
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        data: positionedNodes.map((n) => ({
          ...n,
          name: n.name || n.id,
        })),
        links: edges,
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 },
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      },
    ],
  }

  const handleClick = (params) => {
    if (params.dataType === 'node' && onNodeClick) {
      onNodeClick(params.data)
    }
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: '100%', height: '100%' }}
      onEvents={{ click: handleClick }}
      notMerge={true}
    />
  )
}
