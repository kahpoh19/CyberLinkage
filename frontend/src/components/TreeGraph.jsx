import React, { useMemo, useRef, useCallback, useState } from 'react'
import ReactECharts from 'echarts-for-react/esm/core'
import useUserStore from '../store/userStore'
import { buildTreeData, getMasteryTokens } from '../utils/graphUtils'
import { Button } from 'antd'
import ExpandOutlined from '@ant-design/icons/es/icons/ExpandOutlined'
import CompressOutlined from '@ant-design/icons/es/icons/CompressOutlined'
import echarts from '../utils/echartsCore'

export default function TreeGraph({ graphData, onNodeClick }) {
  const chartRef = useRef(null)
  const theme = useUserStore((s) => s.resolvedTheme)
  const isDark = theme === 'dark'

  const [isExpanded, setIsExpanded] = useState(false)

  const treeData = useMemo(
    () => buildTreeData(graphData, theme, isExpanded),
    [graphData, theme, isExpanded]
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
      orient: 'LR',
      left: '5%',
      right: '20%',
      top: '5%',
      bottom: '5%',
      expandAndCollapse: true,
      animationDuration: 300,
      animationDurationUpdate: 300,
      // series 级别的 label 作为「默认」；节点级别的 label 会覆盖它
      label: {
        position: 'inside',
        fontSize: 11,
        fontWeight: 600,
        overflow: 'truncate',
        width: 50,
        // 颜色由各节点的 label.color 覆盖，这里给个保底值
        color: '#ffffff',
      },
      leaves: {
        label: {
          position: 'inside',
          fontSize: 11,
          fontWeight: 600,
          overflow: 'truncate',
          width: 50,
          color: '#ffffff',
        },
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      
      {/* Floating Button inside the graph area */}
      <Button
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
        icon={isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '收起全部' : '展开全部'}
      </Button>

      <ReactECharts
        echarts={echarts}
        key = {isExpanded ? 'expanded' : 'collapsed'}
        ref={chartRef}
        option={option}
        style={{ width: '100%', height: '100%' }}
        onEvents={{ click: handleClick }}
        notMerge={true}
      />
    </div>
  )
}
