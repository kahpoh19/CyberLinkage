// frontend/src/utils/graphUtils.js

// ── 颜色配置 ────────────────────────────────────────────────────
// 每种掌握度状态提供 light / dark 两套方案
// bg: 节点填充色  |  text: 标签文字色  |  border: 描边色
//
// 设计原则：
//   Light mode — 用饱和度高、亮度中等的色块，白色文字对比度 ≥ 4.5:1
//   Dark mode  — 适度提亮背景，保持白色文字清晰；灰色节点改用更亮的灰
const MASTERY_PALETTE = {
  unknown: {
    light: { bg: '#8c8c8c', text: '#ffffff', border: '#595959' },
    dark:  { bg: '#6b6b6b', text: '#f0f0f0', border: '#9a9a9a' },
  },
  low: {          // mastery < 0.4  ——  红色系
    light: { bg: '#cf1322', text: '#ffffff', border: '#820014' },
    dark:  { bg: '#ff4d4f', text: '#ffffff', border: '#ff7875' },
  },
  medium: {       // 0.4 ≤ mastery < 0.7  ——  橙色系
    light: { bg: '#d46b08', text: '#ffffff', border: '#ad4e00' },
    dark:  { bg: '#fa8c16', text: '#ffffff', border: '#ffa940' },
  },
  high: {         // mastery ≥ 0.7  ——  绿色系
    light: { bg: '#389e0d', text: '#ffffff', border: '#135200' },
    dark:  { bg: '#52c41a', text: '#ffffff', border: '#95de64' },
  },
}

/**
 * 根据掌握度和主题返回 { bg, text, border }
 * @param {number|null} mastery
 * @param {'light'|'dark'} theme
 */
export function getMasteryTokens(mastery, theme = 'light') {
  const mode = theme === 'dark' ? 'dark' : 'light'
  if (mastery == null) return MASTERY_PALETTE.unknown[mode]
  if (mastery < 0.4)   return MASTERY_PALETTE.low[mode]
  if (mastery < 0.7)   return MASTERY_PALETTE.medium[mode]
  return MASTERY_PALETTE.high[mode]
}

/** 向后兼容：只取背景色 */
export function getMasteryColor(mastery, theme = 'light') {
  return getMasteryTokens(mastery, theme).bg
}

/** 向后兼容：取文字色 */
export function getLabelColor(mastery, theme = 'light') {
  return getMasteryTokens(mastery, theme).text
}

// ── 树数据构建 ───────────────────────────────────────────────────

/**
 * @param {object} graphData  { nodes, edges }
 * @param {'light'|'dark'} theme
 */
export function buildTreeData(graphData, theme = 'light') {
  if (!graphData) return []

  const { nodes, edges } = graphData
  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = { ...n } })

  const childrenMap = {}
  edges.forEach(e => {
    if (!childrenMap[e.source]) childrenMap[e.source] = []
    childrenMap[e.source].push(e.target)
  })

  const hasParent = new Set(edges.map(e => e.target))
  const roots = nodes.filter(n => !hasParent.has(n.id))

  const visited = new Set()

  function buildNode(nodeId, depth = 0) {
    if (visited.has(nodeId)) return null
    visited.add(nodeId)
    const node = nodeMap[nodeId]
    if (!node) return null

    const tokens = getMasteryTokens(node.mastery, theme)
    const children = (childrenMap[nodeId] || [])
      .map(cid => buildNode(cid, depth + 1))
      .filter(Boolean)

    const isLeaf = children.length === 0

    return {
      name: node.name,
      id: node.id,
      value: node.mastery,
      collapsed: depth >= 1,
      symbol: isLeaf ? 'rect' : 'circle',
      symbolSize: isLeaf ? 40 : 48,
      itemStyle: {
        color: tokens.bg,
        borderColor: tokens.border,
        borderWidth: 2,
      },
      // label 样式在节点级别覆盖 series 级别的默认值
      label: {
        color: tokens.text,
        fontSize: 11,
        fontWeight: 600,
        textShadowBlur: 3,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffsetX: 0,
        textShadowOffsetY: 1,
        width: 70,
      },
      _raw: node,
      children: children.length ? children : undefined,
    }
  }

  return roots.map(r => buildNode(r.id)).filter(Boolean)
}