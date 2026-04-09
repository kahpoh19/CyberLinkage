import React, { useMemo, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 知识图谱 — 径向树状布局
 * 中心: 课程名 → 第一圈: 章节 → 第二圈: 知识点
 * 鼠标在整个容器内都能缩放/平移
 */
export default function GraphViewer({ nodes = [], edges = [], onNodeClick }) {
  const chartRef = useRef(null)

  // 构建树状数据：中心节点 → 章节 → 知识点
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
    const centerNode = {
      id: '__root__',
      name: 'C语言程序设计',
      symbolSize: 70,
      itemStyle: { color: '#1890ff', shadowBlur: 10, shadowColor: 'rgba(24,144,255,0.4)' },
      label: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
      x: 0,
      y: 0,
      fixed: true,
      _isRoot: true,
    }
    allNodes.push(centerNode)

    const chapterCount = chapters.length
    const chapterRadius = 280 // 章节圈半径
    const leafRadius = 200   // 知识点离章节的距离

    chapters.forEach((ch, i) => {
      // 章节节点均匀分布在圆周上
      const angle = (2 * Math.PI * i) / chapterCount - Math.PI / 2
      const cx = Math.cos(angle) * chapterRadius
      const cy = Math.sin(angle) * chapterRadius

      const chapterId = `__ch_${ch}__`
      const chapterNode = {
        id: chapterId,
        name: `第${ch}章`,
        symbolSize: 45,
        itemStyle: { color: '#40a9ff', borderColor: '#1890ff', borderWidth: 2 },
        label: { fontSize: 12, fontWeight: 'bold', color: '#333' },
        x: cx,
        y: cy,
        fixed: true,
        _isChapter: true,
        chapter: ch,
      }
      allNodes.push(chapterNode)
      allEdges.push({ source: '__root__', target: chapterId })

      // 该章节下的知识点
      const leaves = groups[ch]
      const leafCount = leaves.length
      // 知识点在章节节点周围扇形分布
      const spreadAngle = Math.min(Math.PI * 0.6, (leafCount - 1) * 0.35 + 0.3)
      const startAngle = angle - spreadAngle / 2

      leaves.forEach((n, j) => {
        const leafAngle = leafCount === 1
          ? angle
          : startAngle + (spreadAngle * j) / (leafCount - 1)
        const lx = cx + Math.cos(leafAngle) * leafRadius
        const ly = cy + Math.sin(leafAngle) * leafRadius

        allNodes.push({
          ...n,
          name: n.name || n.id,
          x: lx,
          y: ly,
          fixed: true,
        })
        allEdges.push({ source: chapterId, target: n.id })
      })
    })

    // 保留原始知识点之间的前置关系边
    const nodeIds = new Set(allNodes.map((n) => n.id))
    edges.forEach((e) => {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        allEdges.push({
          source: e.source,
          target: e.target,
          lineStyle: { color: '#d9d9d9', type: 'dashed', width: 1 },
        })
      }
    })

    return { treeNodes: allNodes, treeEdges: allEdges }
  }, [nodes, edges])

  // 让整个容器都能响应滚轮缩放
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const dom = chart.getDom()
    const handleWheel = (e) => {
      e.preventDefault()
      const zoom = chart.getOption().series[0]
      // 触发 echarts 的 dataZoom 通过 dispatchAction
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
    tooltip: {
      formatter: (params) => {
        if (params.dataType === 'node') {
          const d = params.data
          if (d._isRoot || d._isChapter) {
            return `<b>${d.name}</b>`
          }
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
        layout: 'none',
        roam: true,
        draggable: false,
        label: {
          show: true,
          position: 'bottom',
          fontSize: 10,
          color: '#555',
          formatter: (params) => {
            const d = params.data
            if (d._isRoot) return d.name
            if (d._isChapter) return d.name
            const name = d.name || ''
            return name.length > 5 ? name.slice(0, 5) + '\n' + name.slice(5) : name
          },
        },
        lineStyle: {
          color: '#91d5ff',
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
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
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
