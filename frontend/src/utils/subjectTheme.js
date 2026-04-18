/**
 * subjectTheme.js
 * 科目渐变色系映射工具 — CyberLinkage
 * 每个科目对应独立的霓虹渐变色系，用于标签、进度条、图谱节点等
 */

export const SUBJECT_THEMES = {
  mechanics: {
    label: '机械原理',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    gradientHover: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
    glow: 'rgba(168, 85, 247, 0.55)',
    glowSoft: 'rgba(168, 85, 247, 0.18)',
    primary: '#a855f7',
    secondary: '#6366f1',
    border: 'rgba(168, 85, 247, 0.45)',
    tag: 'purple',
    // 用于 ECharts / 图谱节点
    chartColor: '#a855f7',
    chartColorSecondary: '#6366f1',
  },
  c_language: {
    label: 'C 语言程序设计',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
    gradientHover: 'linear-gradient(135deg, #38bdf8 0%, #67e8f9 100%)',
    glow: 'rgba(14, 165, 233, 0.55)',
    glowSoft: 'rgba(14, 165, 233, 0.18)',
    primary: '#0ea5e9',
    secondary: '#22d3ee',
    border: 'rgba(14, 165, 233, 0.45)',
    tag: 'cyan',
    chartColor: '#0ea5e9',
    chartColorSecondary: '#22d3ee',
  },
  data_structure: {
    label: '数据结构',
    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    gradientHover: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
    glow: 'rgba(16, 185, 129, 0.55)',
    glowSoft: 'rgba(16, 185, 129, 0.18)',
    primary: '#10b981',
    secondary: '#34d399',
    border: 'rgba(16, 185, 129, 0.45)',
    tag: 'green',
    chartColor: '#10b981',
    chartColorSecondary: '#34d399',
  },
  calculus: {
    label: '高等数学',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    gradientHover: 'linear-gradient(135deg, #fbbf24 0%, #fcd34d 100%)',
    glow: 'rgba(245, 158, 11, 0.55)',
    glowSoft: 'rgba(245, 158, 11, 0.18)',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.45)',
    tag: 'gold',
    chartColor: '#f59e0b',
    chartColorSecondary: '#fbbf24',
  },
  aerospace: {
    label: '航空航天概论',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    gradientHover: 'linear-gradient(135deg, #f87171 0%, #fb923c 100%)',
    glow: 'rgba(239, 68, 68, 0.55)',
    glowSoft: 'rgba(239, 68, 68, 0.18)',
    primary: '#ef4444',
    secondary: '#f97316',
    border: 'rgba(239, 68, 68, 0.45)',
    tag: 'red',
    chartColor: '#ef4444',
    chartColorSecondary: '#f97316',
  },
  thermo: {
    label: '工程热力学',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    gradientHover: 'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)',
    glow: 'rgba(236, 72, 153, 0.55)',
    glowSoft: 'rgba(236, 72, 153, 0.18)',
    primary: '#ec4899',
    secondary: '#f43f5e',
    border: 'rgba(236, 72, 153, 0.45)',
    tag: 'pink',
    chartColor: '#ec4899',
    chartColorSecondary: '#f43f5e',
  },
  physics: {
    label: '大学物理',
    gradient: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
    gradientHover: 'linear-gradient(135deg, #2dd4bf 0%, #22d3ee 100%)',
    glow: 'rgba(20, 184, 166, 0.55)',
    glowSoft: 'rgba(20, 184, 166, 0.18)',
    primary: '#14b8a6',
    secondary: '#06b6d4',
    border: 'rgba(20, 184, 166, 0.45)',
    tag: 'teal',
    chartColor: '#14b8a6',
    chartColorSecondary: '#06b6d4',
  },
  circuits: {
    label: '电路原理',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    gradientHover: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 100%)',
    glow: 'rgba(139, 92, 246, 0.55)',
    glowSoft: 'rgba(139, 92, 246, 0.18)',
    primary: '#8b5cf6',
    secondary: '#6366f1',
    border: 'rgba(139, 92, 246, 0.45)',
    tag: 'violet',
    chartColor: '#8b5cf6',
    chartColorSecondary: '#6366f1',
  },
}

// 备用色系池（用于动态新增的科目）
const FALLBACK_GRADIENTS = [
  { gradient: 'linear-gradient(135deg, #84cc16 0%, #22c55e 100%)', glow: 'rgba(132,204,22,0.55)', glowSoft: 'rgba(132,204,22,0.18)', primary: '#84cc16', secondary: '#22c55e', border: 'rgba(132,204,22,0.45)', chartColor: '#84cc16', chartColorSecondary: '#22c55e' },
  { gradient: 'linear-gradient(135deg, #fb923c 0%, #fbbf24 100%)', glow: 'rgba(251,146,60,0.55)', glowSoft: 'rgba(251,146,60,0.18)', primary: '#fb923c', secondary: '#fbbf24', border: 'rgba(251,146,60,0.45)', chartColor: '#fb923c', chartColorSecondary: '#fbbf24' },
  { gradient: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)', glow: 'rgba(56,189,248,0.55)', glowSoft: 'rgba(56,189,248,0.18)', primary: '#38bdf8', secondary: '#818cf8', border: 'rgba(56,189,248,0.45)', chartColor: '#38bdf8', chartColorSecondary: '#818cf8' },
  { gradient: 'linear-gradient(135deg, #f472b6 0%, #c084fc 100%)', glow: 'rgba(244,114,182,0.55)', glowSoft: 'rgba(244,114,182,0.18)', primary: '#f472b6', secondary: '#c084fc', border: 'rgba(244,114,182,0.45)', chartColor: '#f472b6', chartColorSecondary: '#c084fc' },
  { gradient: 'linear-gradient(135deg, #4ade80 0%, #34d399 100%)', glow: 'rgba(74,222,128,0.55)', glowSoft: 'rgba(74,222,128,0.18)', primary: '#4ade80', secondary: '#34d399', border: 'rgba(74,222,128,0.45)', chartColor: '#4ade80', chartColorSecondary: '#34d399' },
]

/**
 * 获取科目的色系配置
 * @param {string} subjectId
 * @param {number} [fallbackIndex] 动态科目时的备用色系索引
 */
export function getSubjectTheme(subjectId, fallbackIndex = 0) {
  if (SUBJECT_THEMES[subjectId]) return SUBJECT_THEMES[subjectId]
  return {
    label: subjectId,
    ...FALLBACK_GRADIENTS[fallbackIndex % FALLBACK_GRADIENTS.length],
    gradientHover: FALLBACK_GRADIENTS[fallbackIndex % FALLBACK_GRADIENTS.length].gradient,
    tag: 'default',
  }
}

/**
 * 生成科目标签的内联样式
 * @param {string} subjectId
 * @param {boolean} isSelected
 * @param {number} [fallbackIndex]
 */
export function getSubjectTagStyle(subjectId, isSelected, fallbackIndex = 0) {
  const theme = getSubjectTheme(subjectId, fallbackIndex)
  if (isSelected) {
    return {
      background: theme.gradient,
      boxShadow: `0 0 16px ${theme.glow}, 0 0 32px ${theme.glowSoft}`,
      border: `1px solid ${theme.border}`,
      color: '#ffffff',
      fontWeight: 700,
    }
  }
  return {
    background: theme.glowSoft,
    border: `1px solid ${theme.border}`,
    color: theme.primary,
    fontWeight: 500,
  }
}