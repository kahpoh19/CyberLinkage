import * as echarts from 'echarts/core'
import { GraphChart, RadarChart, TreeChart } from 'echarts/charts'
import { RadarComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  GraphChart,
  RadarChart,
  TreeChart,
  RadarComponent,
  TooltipComponent,
  CanvasRenderer,
])

export default echarts
