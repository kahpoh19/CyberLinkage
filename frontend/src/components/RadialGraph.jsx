import React, { useMemo, useRef, useCallback, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import useUserStore from '../store/userStore'
import { getMasteryTokens } from '../utils/graphUtils'

const CHAPTER_COLORS = [
  '#1677ff', '#13c2c2', '#52c41a', '#faad14', '#ff4d4f',
  '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
  '#36cfc9', '#ff7a45', '#9254de',
]

const CROSS_LINK_COLORS = [
  '#ff85c0', '#b37feb', '#5cdbd3', '#ffc069', '#ff9c6e',
  '#95de64', '#69c0ff', '#ffd666', '#ff7875', '#87e8de',
]

function edgeSource(edge) {
  return edge.source ?? edge.from
}

function edgeTarget(edge) {
  return edge.target ?? edge.to
}

function polar(radius, angle) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function shortLabel(name, max = 8) {
  if (!name) return ''
  if (name.length <= max) return name
  return `${name.slice(0, max)}…`
}

export default function RadialGraph({ graphData, onNodeClick }) {
  const chartRef = useRef(null)
  const theme = useUserStore((s) => s.resolvedTheme)
  const isDark = theme === 'dark'

  const { chartNodes, chartLinks, chapterCount, knowledgeCount } = useMemo(() => {
    const sourceNodes = graphData?.nodes || []
    const sourceEdges = graphData?.edges || []

    if (!sourceNodes.length) {
      return { chartNodes: [], chartLinks: [], chapterCount: 0, knowledgeCount: 0 }
    }

    const chapters = [...new Set(sourceNodes.map((node) => node.chapter || 0))]
      .sort((a, b) => a - b)
    const chapterIndexMap = new Map(chapters.map((chapter, index) => [chapter, index]))
    const nodeChapterMap = new Map(sourceNodes.map((node) => [node.id, node.chapter || 0]))
    const nodeIdSet = new Set(sourceNodes.map((node) => node.id))
    const nodesByChapter = new Map()

    sourceNodes.forEach((node) => {
      const chapter = node.chapter || 0
      if (!nodesByChapter.has(chapter)) nodesByChapter.set(chapter, [])
      nodesByChapter.get(chapter).push(node)
    })

    nodesByChapter.forEach((nodes) => {
      nodes.sort((a, b) => {
        const difficultyDelta = (a.difficulty || 3) - (b.difficulty || 3)
        if (difficultyDelta !== 0) return difficultyDelta
        return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN')
      })
    })

    const chartNodes = []
    const chartLinks = []
    const chapterTotal = Math.max(chapters.length, 1)
    const chapterRadius = Math.max(260, chapterTotal * 34)
    const knowledgeRadius = chapterRadius + 210
    const chapterSpan = (Math.PI * 2) / chapterTotal

    chartNodes.push({
      id: '__course_center__',
      name: graphData?.name || '知识图谱',
      x: 0,
      y: 0,
      fixed: true,
      symbol: 'circle',
      symbolSize: 82,
      _isCenter: true,
      itemStyle: {
        color: isDark ? '#111827' : '#ffffff',
        borderColor: '#1677ff',
        borderWidth: 3,
        shadowBlur: 18,
        shadowColor: 'rgba(22,119,255,0.28)',
      },
      label: {
        show: true,
        color: isDark ? '#e6f4ff' : '#1677ff',
        fontSize: 13,
        fontWeight: 700,
        formatter: 'C语言\n知识图谱',
      },
      tooltip: { formatter: 'C语言知识图谱' },
    })

    chapters.forEach((chapter, chapterIdx) => {
      const color = CHAPTER_COLORS[chapterIdx % CHAPTER_COLORS.length]
      const centerAngle = -Math.PI / 2 + chapterIdx * chapterSpan
      const chapterPoint = polar(chapterRadius, centerAngle)
      const chapterId = `__chapter_${chapter}__`
      const chapterNodes = nodesByChapter.get(chapter) || []

      chartNodes.push({
        id: chapterId,
        name: chapter ? `第${chapter}章` : '未分章',
        x: chapterPoint.x,
        y: chapterPoint.y,
        fixed: true,
        symbol: 'roundRect',
        symbolSize: [72, 34],
        _isChapter: true,
        chapter,
        itemStyle: {
          color,
          borderColor: isDark ? 'rgba(255,255,255,0.28)' : '#ffffff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: `${color}55`,
        },
        label: {
          show: true,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 700,
        },
      })

      chartLinks.push({
        source: '__course_center__',
        target: chapterId,
        symbol: ['none', 'none'],
        symbolSize: [0, 0],
        lineStyle: {
          color,
          width: 1.4,
          opacity: 0.28,
          curveness: 0,
        },
        _isScaffold: true,
      })

      const spread = Math.min(chapterSpan * 0.78, Math.PI * 0.72)
      chapterNodes.forEach((node, nodeIdx) => {
        const normalized = chapterNodes.length === 1
          ? 0
          : (nodeIdx / (chapterNodes.length - 1)) - 0.5
        const angle = centerAngle + normalized * spread
        const laneOffset = chapterNodes.length <= 3 ? 0 : (nodeIdx % 2) * 64
        const point = polar(knowledgeRadius + laneOffset, angle)
        const tokens = getMasteryTokens(node.mastery, theme)
        const size = 34 + (node.difficulty || 3) * 4

        chartNodes.push({
          ...node,
          name: node.name || node.id,
          x: point.x,
          y: point.y,
          fixed: true,
          symbol: node.difficulty >= 4 ? 'diamond' : 'circle',
          symbolSize: size,
          _raw: node,
          itemStyle: {
            color: tokens.bg,
            borderColor: tokens.border,
            borderWidth: 2,
            shadowBlur: 8,
            shadowColor: `${tokens.bg}55`,
          },
          label: {
            show: true,
            color: tokens.text,
            fontSize: 10,
            fontWeight: 600,
            textShadowBlur: 3,
            textShadowColor: 'rgba(0,0,0,0.55)',
            formatter: () => shortLabel(node.name || node.id),
          },
        })

        chartLinks.push({
          source: chapterId,
          target: node.id,
          symbol: ['none', 'none'],
          symbolSize: [0, 0],
          lineStyle: {
            color,
            width: 1,
            opacity: 0.18,
            curveness: 0.06,
          },
          _isScaffold: true,
        })
      })
    })

    let crossLinkIndex = 0
    sourceEdges.forEach((edge) => {
      const source = edgeSource(edge)
      const target = edgeTarget(edge)
      if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return

      const sourceChapter = nodeChapterMap.get(source)
      const targetChapter = nodeChapterMap.get(target)
      const isCrossChapter = sourceChapter !== targetChapter
      const chapterIndex = chapterIndexMap.get(sourceChapter) ?? 0
      const color = isCrossChapter
        ? CROSS_LINK_COLORS[crossLinkIndex++ % CROSS_LINK_COLORS.length]
        : CHAPTER_COLORS[chapterIndex % CHAPTER_COLORS.length]

      chartLinks.push({
        source,
        target,
        relation: edge.relation || 'prerequisite',
        _isPrerequisite: true,
        symbol: ['none', 'arrow'],
        symbolSize: [0, 6],
        lineStyle: {
          color,
          width: isCrossChapter ? 1.6 : 1.25,
          opacity: isCrossChapter ? 0.64 : 0.42,
          type: isCrossChapter ? 'dashed' : 'solid',
          curveness: isCrossChapter ? 0.28 : 0.16,
        },
      })
    })

    return {
      chartNodes,
      chartLinks,
      chapterCount: chapters.length,
      knowledgeCount: sourceNodes.length,
    }
  }, [graphData, isDark, theme])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: isDark ? '#1f1f1f' : 'rgba(255,255,255,0.96)',
      borderColor: isDark ? '#434343' : '#e8e8e8',
      textStyle: { color: isDark ? '#e0e0e0' : '#333' },
      formatter: (params) => {
        if (params.dataType === 'edge') {
          if (params.data._isScaffold) return ''
          return `前置关系<br/>${params.data.source} → ${params.data.target}`
        }

        const data = params.data
        if (data._isCenter) {
          return [
            '<b>C语言知识图谱</b>',
            `章节：${chapterCount}`,
            `知识点：${knowledgeCount}`,
          ].join('<br/>')
        }
        if (data._isChapter) {
          return `<b>${data.name}</b>`
        }

        const raw = data._raw || data
        const tokens = getMasteryTokens(raw.mastery, theme)
        const mastery = raw.mastery != null
          ? `${(raw.mastery * 100).toFixed(1)}%`
          : '未测试'
        return [
          `<b style="color:${tokens.bg}">${raw.name || raw.id}</b>`,
          `分类：${raw.category || '-'}`,
          `掌握度：<span style="color:${tokens.bg};font-weight:600">${mastery}</span>`,
          `难度：${'⭐'.repeat(raw.difficulty || 3)}`,
          `预计：${raw.estimated_minutes || 30} 分钟`,
        ].join('<br/>')
      },
    },
    series: [{
      type: 'graph',
      layout: 'none',
      data: chartNodes,
      links: chartLinks,
      roam: true,
      draggable: false,
      zoom: 0.82,
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 6],
      label: {
        show: true,
        position: 'inside',
      },
      lineStyle: {
        color: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)',
        width: 1,
        opacity: 0.4,
      },
      emphasis: {
        focus: 'adjacency',
        scale: true,
        lineStyle: {
          width: 3,
          opacity: 0.9,
        },
        itemStyle: {
          shadowBlur: 16,
          shadowColor: 'rgba(22,119,255,0.35)',
        },
      },
      animationDuration: 600,
      animationEasingUpdate: 'cubicOut',
    }],
  }), [chartNodes, chartLinks, chapterCount, knowledgeCount, isDark, theme])

  useEffect(() => {
    chartRef.current?.getEchartsInstance()?.resize()
  }, [option])

  const handleClick = useCallback((params) => {
    if (params.dataType === 'node' && params.data?._raw) {
      onNodeClick?.(params.data._raw)
    }
  }, [onNodeClick])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{
        position: 'absolute',
        top: 14,
        left: 16,
        zIndex: 2,
        color: isDark ? 'rgba(255,255,255,0.66)' : 'rgba(0,0,0,0.48)',
        fontSize: 12,
        lineHeight: 1.7,
        pointerEvents: 'none',
      }}>
        拖动画布 / 滚轮缩放 · 点击知识点查看详情
      </div>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ width: '100%', height: '100%' }}
        onEvents={{ click: handleClick }}
        notMerge={true}
      />
    </div>
  )
}
