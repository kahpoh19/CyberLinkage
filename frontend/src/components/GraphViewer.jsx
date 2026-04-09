import React, { useMemo, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 知识图谱 — 径向树状布局（无重叠版）
 * 中心: 课程名 → 第一圈: 章节 → 第二圈: 知识点
 *
 * 章节颜色按分类着色，知识点颜色按掌握度着色
 */

// 章节分类色板
const CHAPTER_COLORS = [
  '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
  '#36cfc9', '#ff7a45', '#9254de',
]

// 掌握度颜色
function getMasteryColor(mastery) {
  if (mastery === null || mastery === undefined) return '#d9d9d9'  // 未测试 - 灰色
  if (mastery < 0.4) return '#ff4d4f'   // 薄弱 - 红
  if (mastery < 0.7) return '#faad14'   // 学习中 - 黄
  return '#52c41a'                       // 已掌握 - 绿
}

export default function GraphViewer({ nodes = [], edges = [], onNodeClick }) {
  const chartRef = useRef(null)

  const { treeNodes, treeEdges } = useMemo(() => {
    if (!nodes.length) return { treeNodes: [], treeEdges: [] }

    // 按 chapter 分组
    const groups = {}
    nodes.forEach((n) => {
      const ch = n.chapter || 0
      if (!groups[ch]) groups[ch] = []
      groups[ch].push(n)
    })

    const chapters = Object.keys(groups).map(Number).sort((a, b) => a - b)
    const allNodes = []
    const allEdges = []

    // 中心节点
    allNodes.push({
      id: '__root__',
      name: 'C语言程序设计',
      symbolSize: 80,
      itemStyle: {
        color: '#1890ff',
        shadowBlur: 15,
        shadowColor: 'rgba(24,144,255,0.5)',
        borderColor: '#fff',
        borderWidth: 3,
      },
      label: { fontSize: 13, fontWeight: 'bold', color: '#fff', position: 'inside' },
      x: 0,
      y: 0,
      fixed: true,
      _isRoot: true,
    })

    const chapterCount = chapters.length
    const chapterRadius = 320       // 章节圈半径
    const baseLeafRadius = 180      // 知识点基础距离

    chapters.forEach((ch, i) => {
      const angle = (2 * Math.PI * i) / chapterCount - Math.PI / 2
      const cx = Math.cos(angle) * chapterRadius
      const cy = Math.sin(angle) * chapterRadius
      const color = CHAPTER_COLORS[i % CHAPTER_COLORS.length]

      const chapterId = `__ch_${ch}__`
      allNodes.push({
        id: chapterId,
        name: `第${ch}章`,
        symbolSize: 50,
        itemStyle: {
          color: color,
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: color + '66',
        },
        label: { fontSize: 12, fontWeight: 'bold', color: '#fff', position: 'inside' },
        x: cx,
        y: cy,
        fixed: true,
        _isChapter: true,
        chapter: ch,
      })
      allEdges.push({
        source: '__root__',
        target: chapterId,
        lineStyle: { color: color, width: 2.5, opacity: 0.6 },
      })

      // 知识点 — 扇形分布，增大间距防重叠
      const leaves = groups[ch]
      const leafCount = leaves.length

      // 每个知识点至少占 0.28 弧度，防止挤在一起
      const minSpread = 0.28 * leafCount
      const maxSpread = (2 * Math.PI) / chapterCount * 0.85
      const spreadAngle = Math.min(maxSpread, Math.max(minSpread, 0.8))
      const startAngle = angle - spreadAngle / 2

      // 多节点时交错半径，避免径向重叠
      leaves.forEach((n, j) => {
        const leafAngle = leafCount === 1
          ? angle
          : startAngle + (spreadAngle * j) / (leafCount - 1)

        // 奇偶交错距离
        const radiusOffset = leafCount > 3 ? (j % 2 === 0 ? 0 : 40) : 0
        const leafR = baseLeafRadius + radiusOffset

        const lx = cx + Math.cos(leafAngle) * leafR
        const ly = cy + Math.sin(leafAngle) * leafR

        const masteryColor = getMasteryColor(n.mastery)

        allNodes.push({
          ...n,
          name: n.name || n.id,
          symbolSize: n.symbolSize || 30 + (n.difficulty || 3) * 5,
          itemStyle: {
            color: masteryColor,
            borderColor: color,
            borderWidth: 2,
          },
          x: lx,
          y: ly,
          fixed: true,
        })
        allEdges.push({
          source: chapterId,
          target: n.id,
          lineStyle: { color: color, width: 1.5, opacity: 0.4 },
        })
      })
    })

    // 知识点之间的前置关系（虚线）
    const nodeIds = new Set(allNodes.map((n) => n.id))
    edges.forEach((e) => {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        allEdges.push({
          source: e.source,
          target: e.target,
          lineStyle: { color: '#bbb', type: 'dashed', width: 1, opacity: 0.5 },
        })
      }
    })

    return { treeNodes: allNodes, treeEdges: allEdges }
  }, [nodes, edges])

  // 整个容器内滚轮缩放
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const dom = chart.getDom()
    const handleWheel = (e) => {
      e.preventDefault()
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        zoom: e.deltaY < 0 ? 1.15 : 0.87,
      })
    }

    dom.addEventListener('wheel', handleWheel, { passive: false })
    return () => dom.removeEventListener('wheel', handleWheel)
  }, [treeNodes])

  const option = {
    backgroundColor: '#fafbfc',
    tooltip: {
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      textStyle: { color: '#333' },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data
          if (d._isRoot) return `<b style="font-size:14px">${d.name}</b>`
          if (d._isChapter) return `<b>${d.name}</b>`
          const mastery =
            d.mastery !== null && d.mastery !== undefined
              ? `${(d.mastery * 100).toFixed(1)}%`
              : '未测试'
          const mColor = getMasteryColor(d.mastery)
          return `
            <b>${d.name}</b><br/>
            分类：${d.category || '-'}<br/>
            掌握度：<span style="color:${mColor};font-weight:bold">${mastery}</span><br/>
            难度：${'⭐'.repeat(d.difficulty || 3)}<br/>
            预计：${d.estimated_minutes || 30}分钟
          `
        }
        return ''
      },
    },
    animationDuration: 800,
    series: [
      {
        type: 'graph',
        layout: 'none',
        roam: true,
        draggable: false,
        label: {
          show: true,
          position: 'bottom',
          fontSize: 10,
          color: '#555',
          distance: 5,
          formatter: (params) => {
            const d = params.data
            if (d._isRoot || d._isChapter) return ''  // 标签已在内部显示
            const name = d.name || ''
            return name.length > 5 ? name.slice(0, 5) + '\n' + name.slice(5) : name
          },
        },
        lineStyle: {
          curveness: 0.2,
          width: 1.5,
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 6],
        data: treeNodes,
        links: treeEdges,
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 },
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      },
    ],
  }

  const handleClick = (params) => {
    if (params.dataType === 'node' && onNodeClick && !params.data._isRoot && !params.data._isChapter) {
      onNodeClick(params.data)
    }
  }

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
