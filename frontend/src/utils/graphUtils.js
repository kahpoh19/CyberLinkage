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
export function buildTreeData(graphData, theme = 'light', expandAll = false) {
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
      collapsed: expandAll ? false : depth >=1,
    }
  }

  return roots.map(r => buildNode(r.id)).filter(Boolean)
}

function splitDescriptionPoints(description = '') {
  return description
    .split(/[。；;\n]/)
    .flatMap(segment => segment.split(/[、，,]/))
    .map(item => item.trim())
    .filter(Boolean)
}

export function deriveCorePoints(node, maxPoints = 4) {
  if (!node) return []

  const points = []
  if (node.category) {
    points.push(`${node.category}中的关键知识点`)
  }

  splitDescriptionPoints(node.description).forEach((item) => {
    if (!points.includes(item)) {
      points.push(item)
    }
  })

  return points.slice(0, maxPoints)
}

export function getNodeRelations(graphData, nodeId) {
  if (!graphData || !nodeId) {
    return { prerequisites: [], unlocks: [] }
  }

  const nodes = graphData.nodes || []
  const edges = graphData.edges || []
  const nodeMap = new Map(nodes.map(node => [node.id, node]))

  return {
    prerequisites: edges
      .filter(edge => edge.target === nodeId || edge.to === nodeId)
      .map(edge => nodeMap.get(edge.source || edge.from))
      .filter(Boolean),
    unlocks: edges
      .filter(edge => edge.source === nodeId || edge.from === nodeId)
      .map(edge => nodeMap.get(edge.target || edge.to))
      .filter(Boolean),
  }
}

export function getGraphOverview(graphData) {
  const nodes = graphData?.nodes || []
  const chapterCount = new Set(nodes.map(node => node.chapter || 0)).size
  const masteredCount = nodes.filter(node => node.mastery >= 0.7).length
  const learningCount = nodes.filter(
    node => node.mastery != null && node.mastery >= 0.4 && node.mastery < 0.7,
  ).length
  const weakCount = nodes.filter(
    node => node.mastery == null || node.mastery < 0.4,
  ).length

  const focusNodes = [...nodes]
    .sort((a, b) => {
      const masteryA = a.mastery == null ? -1 : a.mastery
      const masteryB = b.mastery == null ? -1 : b.mastery
      if (masteryA !== masteryB) return masteryA - masteryB
      return (b.difficulty || 0) - (a.difficulty || 0)
    })
    .slice(0, 5)

  return {
    totalNodes: nodes.length,
    chapterCount,
    masteredCount,
    learningCount,
    weakCount,
    focusNodes,
  }
}

export function buildKnowledgeGraphPptDraft(subjectLabel, graphData, focusNode = null) {
  const overview = getGraphOverview(graphData)

  if (focusNode) {
    const { prerequisites, unlocks } = getNodeRelations(graphData, focusNode.id)
    const corePoints = deriveCorePoints(focusNode)
    const normalizedCorePoints = corePoints.length
      ? corePoints
      : ['概念定义', '关键组成', '常见误区', '典型应用']

    return [
      `请基于以下知识点生成一份适合课堂讲解的 PPT 页面描述，输出中文。`,
      ``,
      `主题：${subjectLabel} · ${focusNode.name}`,
      `目标受众：正在学习该知识点的大学生`,
      `讲解目标：帮助学生快速理解知识点定位、核心概念、前置知识、常见误区与应用场景。`,
      ``,
      `知识点信息：`,
      `- 所属分类：${focusNode.category || '未分类'}`,
      `- 所属章节：第 ${focusNode.chapter || 0} 章`,
      `- 难度：${focusNode.difficulty || 3} / 5`,
      `- 预计学习时长：${focusNode.estimated_minutes || 30} 分钟`,
      `- 当前说明：${focusNode.description || '暂无补充说明'}`,
      ``,
      `核心要点：`,
      ...normalizedCorePoints.map(point => `- ${point}`),
      ``,
      `前置知识：`,
      ...(prerequisites.length
        ? prerequisites.map(node => `- ${node.name}`)
        : ['- 暂无明显前置知识']),
      ``,
      `后续可拓展知识点：`,
      ...(unlocks.length
        ? unlocks.map(node => `- ${node.name}`)
        : ['- 暂无直接后继知识点']),
      ``,
      `请输出适合 PPT 生成器继续编辑的页面描述，建议包含：`,
      `第1页：知识点定位与学习目标`,
      `第2页：核心概念与关键要点`,
      `第3页：前置知识与易错点`,
      `第4页：典型应用或练习建议`,
      ``,
      `输出要求：`,
      `- 每页都写清标题、要点、推荐版式`,
      `- 语言简洁，不要写成长篇大段`,
      `- 适合后续继续手动编辑`,
    ].join('\n')
  }

  return [
    `请基于以下课程知识图谱整理一份适合教学展示的 PPT 页面描述，输出中文。`,
    ``,
    `主题：${subjectLabel} 知识图谱梳理`,
    `目标受众：需要快速建立课程全局认知的大学生`,
    `讲解目标：帮助学生看清课程结构、重点模块、优先学习顺序与当前薄弱点。`,
    ``,
    `图谱概况：`,
    `- 总知识点数：${overview.totalNodes}`,
    `- 章节数：${overview.chapterCount}`,
    `- 已掌握：${overview.masteredCount}`,
    `- 学习中：${overview.learningCount}`,
    `- 待重点关注：${overview.weakCount}`,
    ``,
    `当前建议重点梳理的知识点：`,
    ...(overview.focusNodes.length
      ? overview.focusNodes.map(node => `- ${node.name}（第 ${node.chapter || 0} 章）`)
      : ['- 暂无重点知识点']),
    ``,
    `请输出适合 PPT 生成器继续编辑的页面描述，建议包含：`,
    `第1页：课程全景与章节结构`,
    `第2页：核心模块拆解`,
    `第3页：重点/薄弱知识点梳理`,
    `第4页：推荐学习顺序与复习建议`,
    ``,
    `输出要求：`,
    `- 每页都写清标题、要点、推荐版式`,
    `- 内容要简洁，适合课堂讲解`,
    `- 方便后续继续手动编辑`,
  ].join('\n')
}
