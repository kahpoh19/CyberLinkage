import React, { useMemo, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react/esm/core'
import useUserStore from '../store/userStore'
import { getMasteryTokens } from '../utils/graphUtils'
import echarts from '../utils/echartsCore'

/**
 * 知识图谱 — 每章独立子树，跨章节关联用彩色虚线
 */

const CHAPTER_COLORS = [
  '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
  '#36cfc9', '#ff7a45', '#9254de',
]

const CROSS_LINK_COLORS = [
  '#ff85c0', '#b37feb', '#5cdbd3', '#ffc069', '#ff9c6e',
  '#95de64', '#69c0ff', '#ffd666', '#ff7875', '#87e8de',
]

export default function GraphViewer({ nodes = [], edges = [], onNodeClick }) {
  const chartRef = useRef(null)
  const theme = useUserStore((s) => s.resolvedTheme)
  const isDark = theme === 'dark'

  const { treeNodes, treeEdges } = useMemo(() => {
    if (!nodes.length) return { treeNodes: [], treeEdges: [] }

    const groups = {}
    nodes.forEach((n) => {
      const ch = n.chapter || 0
      if (!groups[ch]) groups[ch] = []
      groups[ch].push(n)
    })

    const chapters = Object.keys(groups).map(Number).sort((a, b) => a - b)
    const allNodes = []
    const allEdges = []

    const nodeChapterMap = {}
    nodes.forEach((n) => { nodeChapterMap[n.id] = n.chapter || 0 })

    const treeSpacingX = 500
    const cols = 4
    const treeSpacingY = 600
    const leafDistance = 160

    chapters.forEach((ch, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const treeCx = col * treeSpacingX
      const treeCy = row * treeSpacingY
      const color = CHAPTER_COLORS[i % CHAPTER_COLORS.length]

      const chapterId = `__ch_${ch}__`

      // 章节主节点（固定颜色，不参与掌握度）
      allNodes.push({
        id: chapterId,
        name: `第${ch}章`,
        symbolSize: 55,
        itemStyle: {
          color: color,
          borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#fff',
          borderWidth: 3,
          shadowBlur: 10,
          shadowColor: color + '55',
        },
        label: {
          fontSize: 13,
          fontWeight: 'bold',
          color: '#ffffff',
          position: 'inside',
          textShadowBlur: 3,
          textShadowColor: 'rgba(0,0,0,0.6)',
        },
        x: treeCx,
        y: treeCy,
        fixed: true,
        _isChapter: true,
        chapter: ch,
      })

      const leaves = groups[ch]
      const leafCount = leaves.length

      leaves.forEach((n, j) => {
        const angle = (2 * Math.PI * j) / leafCount - Math.PI / 2
        let rOffset = 0
        if (leafCount > 3) rOffset = (j % 2) * 50
        const r = leafDistance + rOffset
        const lx = treeCx + Math.cos(angle) * r
        const ly = treeCy + Math.sin(angle) * r

        const tokens = getMasteryTokens(n.mastery, theme)

        allNodes.push({
          ...n,
          name: n.name || n.id,
          symbolSize: 28 + (n.difficulty || 3) * 4,
          itemStyle: {
            color: tokens.bg,
            borderColor: tokens.border,
            borderWidth: 2,
          },
          label: {
            color: tokens.text,
            fontSize: 10,
            fontWeight: 600,
            textShadowBlur: 3,
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowOffsetX: 0,
            textShadowOffsetY: 1,
          },
          x: lx,
          y: ly,
          fixed: true,
        })

        allEdges.push({
          source: chapterId,
          target: n.id,
          lineStyle: { color: color, width: 2, opacity: 0.5 },
        })
      })
    })

    const nodeIds = new Set(allNodes.map((n) => n.id))
    let crossIndex = 0
    edges.forEach((e) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return
      const srcCh = nodeChapterMap[e.source]
      const tgtCh = nodeChapterMap[e.target]

      if (srcCh !== tgtCh) {
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
  }, [nodes, edges, theme, isDark])

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

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: isDark ? '#1f1f1f' : 'rgba(255,255,255,0.95)',
      borderColor: isDark ? '#434343' : '#e8e8e8',
      textStyle: { color: isDark ? '#e0e0e0' : '#333' },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data
          if (d._isChapter) return `<b style="font-size:14px">${d.name}</b>`
          const tokens = getMasteryTokens(d.mastery, theme)
          const mastery = d.mastery != null
            ? `${(d.mastery * 100).toFixed(1)}%`
            : '未测试'
          return [
            `<b>${d.name}</b>`,
            `分类：${d.category || '-'}`,
            `掌握度：<span style="color:${tokens.bg};font-weight:bold">${mastery}</span>`,
            `难度：${'⭐'.repeat(d.difficulty || 3)}`,
            `预计：${d.estimated_minutes || 30}分钟`,
          ].join('<br/>')
        }
        if (params.dataType === 'edge' && params.data.lineStyle?.type === 'dashed') {
          return `<i>跨章节关联</i><br/>${params.data.source} → ${params.data.target}`
        }
        return ''
      },
    },
    animationDuration: 800,
    series: [{
      type: 'graph',
      layout: 'none',
      roam: true,
      draggable: false,
      zoom: 0.45,
      label: {
        show: true,
        position: 'bottom',
        fontSize: 10,
        // 默认文字色随主题
        color: isDark ? '#d0d0d0' : '#444',
        distance: 5,
        formatter: (params) => {
          const d = params.data
          if (d._isChapter) return ''
          const name = d.name || ''
          return name.length > 5 ? name.slice(0, 5) + '\n' + name.slice(5) : name
        },
      },
      lineStyle: { curveness: 0.15, width: 1.5 },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 6],
      data: treeNodes,
      links: treeEdges,
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 3 },
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.3)' },
      },
    }],
  }), [treeNodes, treeEdges, isDark, theme])

  const handleClick = (params) => {
    if (params.dataType === 'node' && onNodeClick && !params.data._isChapter) {
      onNodeClick(params.data)
    }
  }

  return (
    <ReactECharts
      echarts={echarts}
      ref={chartRef}
      option={option}
      style={{ width: '100%', height: '100%' }}
      onEvents={{ click: handleClick }}
      notMerge={true}
    />
  )
}
