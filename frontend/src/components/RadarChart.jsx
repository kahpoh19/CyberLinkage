import React from 'react'
import ReactECharts from 'echarts-for-react'

/**
 * 掌握度雷达图组件
 *
 * Props:
 *   categories: string[] — 知识点名称
 *   values: number[] — 掌握度百分比 (0-100)
 */
export default function RadarChart({ categories = [], values = [] }) {
  // 最多展示 12 个维度，避免雷达图过密
  const maxDimensions = 12
  const cats = categories.slice(0, maxDimensions)
  const vals = values.slice(0, maxDimensions)

  const option = {
    radar: {
      indicator: cats.map((c) => ({
        name: c,
        max: 100,
      })),
      shape: 'polygon',
      splitArea: {
        areaStyle: {
          color: ['rgba(22, 119, 255, 0.02)', 'rgba(22, 119, 255, 0.06)'],
        },
      },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: vals,
            name: '掌握度',
            areaStyle: {
              color: 'rgba(22, 119, 255, 0.2)',
            },
            lineStyle: {
              color: '#1677ff',
              width: 2,
            },
            itemStyle: {
              color: '#1677ff',
            },
          },
        ],
      },
    ],
    tooltip: {
      trigger: 'item',
    },
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: '100%', height: 320 }}
    />
  )
}
