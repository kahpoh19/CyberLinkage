// frontend/src/utils/graphUtils.js

function getMasteryColor(mastery) {
    if (mastery == null) return '#d9d9d9'   // 改回浅灰，配黑字
    if (mastery < 0.4) return '#ff7875'     // 改浅红，配黑字
    if (mastery < 0.7) return '#ffd666'     // 改浅黄，配黑字
    return '#95de64'                         // 改浅绿，配黑字
}

export function getLabelColor(mastery) {
    return '#000000'
}

export function buildTreeData(graphData) {
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

    const children = (childrenMap[nodeId] || [])
      .map(cid => buildNode(cid, depth + 1))
      .filter(Boolean)

    return {
      name: node.name,
      id: node.id,
      value: node.mastery,
      collapsed: depth >= 1,
      itemStyle: {
        color: getMasteryColor(node.mastery),
        borderWidth: 0,          // 去掉边框，视觉更干净
      },
      label: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 500,
      },
      _raw: node,
      children: children.length ? children : undefined,
    }
  }

  return roots.map(r => buildNode(r.id)).filter(Boolean)
}