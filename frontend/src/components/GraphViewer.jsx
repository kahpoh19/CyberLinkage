import React, { useMemo, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 知识图谱 — 每章独立子树，跨章节关联用彩色虚线
 */

const CHAPTER_COLORS = [
  '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
  '#36cfc9', '#ff7a45', '#9254de',
]

// 跨章节连线颜色（区分于章节色）
const CROSS_LINK_COLORS = [
  '#ff85c0', '#b37feb', '#5cdbd3', '#ffc069', '#ff9c6e',
  '#95de64', '#69c0ff', '#ffd666', '#ff7875', '#87e8de',
]

function getMasteryColor(mastery) {
  if (mastery === null || mastery === undefined) return '#d9d9d9'
  if (mastery < 0.4) return '#ff4d4f'
  if (mastery < 0.7) return '#faad14'
  return '#52c41a'
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

    // 建立节点→章节的映射
    const nodeChapterMap = {}
    nodes.forEach((n) => { nodeChapterMap[n.id] = n.chapter || 0 })

    const chapterCount = chapters.length

    // 每棵子树的布局参数
    const treeSpacingX = 500    // 子树之间水平间距
    const cols = 4              // 每行放几棵子树
    const treeSpacingY = 600    // 子树行间距
    const leafSpacing = 90      // 知识点之间间距
    const leafDistance = 160     // 知识点离章节节点的径向距离

    chapters.forEach((ch, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      // 子树中心位置
      const treeCx = col * treeSpacingX
      const treeCy = row * treeSpacingY
      const color = CHAPTER_COLORS[i % CHAPTER_COLORS.length]

      const chapterId = `__ch_${ch}__`

      // 章节主节点
      allNodes.push({
        id: chapterId,
        name: `第${ch}章`,
        symbolSize: 55,
        itemStyle: {
          color: color,
          borderColor: '#fff',
          borderWidth: 3,
          shadowBlur: 10,
          shadowColor: color + '55',
        },
        label: { fontSize: 13, fontWeight: 'bold', color: '#fff', position: 'inside' },
        x: treeCx,
        y: treeCy,
        fixed: true,
        _isChapter: true,
        chapter: ch,
      })

      // 知识点围绕章节节点放射
      const leaves = groups[ch]
      const leafCount = leaves.length

      // 均匀分布在整个圆周
      leaves.forEach((n, j) => {
        const angle = (2 * Math.PI * j) / leafCount - Math.PI / 2

        // 多节点时交错距离防重叠
        let rOffset = 0
        if (leafCount > 3) {
          rOffset = (j % 2) * 50
        }
        const r = leafDistance + rOffset

        const lx = treeCx + Math.cos(angle) * r
        const ly = treeCy + Math.sin(angle) * r

        const masteryColor = getMasteryColor(n.mastery)

        allNodes.push({
          ...n,
          name: n.name || n.id,
          symbolSize: n.symbolSize || 28 + (n.difficulty || 3) * 4,
          itemStyle: {
            color: masteryColor,
            borderColor: color,
            borderWidth: 2,
          },
          x: lx,
          y: ly,
          fixed: true,
        })

        // 章节→知识点连线
        allEdges.push({
          source: chapterId,
          target: n.id,
          lineStyle: { color: color, width: 2, opacity: 0.5 },
        })
      })
    })

    // 跨章节知识点关联 — 彩色虚线
    const nodeIds = new Set(allNodes.map((n) => n.id))
    let crossIndex = 0
    edges.forEach((e) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return
      const srcCh = nodeChapterMap[e.source]
      const tgtCh = nodeChapterMap[e.target]

      if (srcCh !== tgtCh) {
        // 跨章节 — 彩色虚线
        const crossColor = CROSS_LINK_COLORS[crossIndex % CROSS_LINK_COLORS.length]
        crossIndex++
        allEdges.push({
          source: e.source,
          target: e.target,
          lineStyle: {
            color: crossColor,
            type: 'dashed',
            width: 1.5,
            opacity: 0.6,
            curveness: 0.3,
          },
        })
      } else {
        // 同章节内的关联 — 细实线
        const chIdx = chapters.indexOf(srcCh)
        allEdges.push({
          source: e.source,
          target: e.target,
          lineStyle: {
            color: CHAPTER_COLORS[chIdx % CHAPTER_COLORS.length],
            width: 1,
            opacity: 0.3,
          },
        })
      }
    })

    return { treeNodes: allNodes, treeEdges: allEdges }
  }, [nodes, edges])

  // 整个容器滚轮缩放
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
          if (d._isChapter) return `<b style="font-size:14px">${d.name}</b>`
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
        if (params.dataType === 'edge') {
          const d = params.data
          if (d.lineStyle?.type === 'dashed') {
            return `<i>跨章节关联</i><br/>${d.source} → ${d.target}`
          }
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
        zoom: 0.45,
        label: {
          show: true,
          position: 'bottom',
          fontSize: 10,
          color: '#555',
          distance: 5,
          formatter: (params) => {
            const d = params.data
            if (d._isChapter) return ''
            const name = d.name || ''
            return name.length > 5 ? name.slice(0, 5) + '\n' + name.slice(5) : name
          },
        },
        lineStyle: {
          curveness: 0.15,
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
    if (params.dataType === 'node' && onNodeClick && !params.data._isChapter) {
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
