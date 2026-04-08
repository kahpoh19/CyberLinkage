import React from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 知识图谱力导向图组件
 *
 * Props:
 *   nodes: [{ id, name, symbolSize, itemStyle, label, ...extra }]
 *   edges: [{ source, target }]
 *   onNodeClick: (nodeData) => void
 */
export default function GraphViewer({ nodes = [], edges = [], onNodeClick }) {
  const option = {
    tooltip: {
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data
          const mastery = d.mastery !== null && d.mastery !== undefined
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
    animationDuration: 1500,
    animationEasingUpdate: 'quinticInOut',
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#333',
        },
        lineStyle: {
          color: '#aaa',
          curveness: 0.1,
          width: 1.5,
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        data: nodes.map((n) => ({
          ...n,
          name: n.name || n.id,
        })),
        links: edges,
        force: {
          repulsion: 300,
          edgeLength: [80, 200],
          gravity: 0.1,
          layoutAnimation: true,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 4 },
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
    />
  )
}
