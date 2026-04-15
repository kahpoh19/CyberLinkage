import React, { useMemo, useRef, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import useUserStore from '../store/userStore'
import { buildTreeData, getMasteryTokens } from '../utils/graphUtils'

export default function RadialGraph({ graphData, onNodeClick }) {
  const chartRef = useRef(null)
  const theme = useUserStore((s) => s.resolvedTheme)
  const isDark = theme === 'dark'

  const treeData = useMemo(
    () => buildTreeData(graphData, theme),
    [graphData, theme]
  )

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark ? '#1f1f1f' : '#fff',
      borderColor: isDark ? '#434343' : '#e8e8e8',
      textStyle: { color: isDark ? '#e0e0e0' : '#333' },
      formatter: (params) => {
        const d = params.data
        if (!d._raw) return d.name
        const m = d._raw.mastery
        const tokens = getMasteryTokens(m, theme)
        const mStr = m != null ? `${(m * 100).toFixed(1)}%` : '未测试'
        return [
          `<b style="color:${tokens.bg}">${d.name}</b>`,
          `掌握度：<span style="color:${tokens.bg};font-weight:600">${mStr}</span>`,
          `难度：${'⭐'.repeat(d._raw.difficulty || 3)}`,
        ].join('<br/>')
      },
    },
    series: [{
      type: 'tree',
      data: treeData,
      orient: 'radial',
      left: '5%',
      right: '5%',
      top: '5%',
      bottom: '5%',
      expandAndCollapse: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      label: {
        position: 'inside',
        fontSize: 10,
        fontWeight: 600,
        color: '#ffffff',
        overflow: 'truncate',
        width: 46,
      },
      lineStyle: {
        color: isDark ? '#555' : '#ccc',
        width: 1,
        curveness: 0.5,
      },
      emphasis: { focus: 'descendant' },
      initialTreeDepth: 1,
    }],
  }), [treeData, isDark, theme])

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
