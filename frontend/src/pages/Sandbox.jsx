/**
 * Sandbox.jsx — 通用机构设计平台 v3
 *
 * 修复清单:
 *   Fix 1: 滑块输出点视觉统一 — 橙色 + "E" 标签 + 发光效果
 *   Fix 2: 几何有效性逻辑优化 — 增大容差, 全周校验更稳健
 *   Fix 3: 实时图表更新 + 死点自动停止 + Canvas 红色 Overlay
 *   Fix 4: 轨迹自动重置 — nodes/links 变动时清空 traces
 *   Fix 5: 主题响应式标题 — key={isDark} 强制重挂载
 */

import React, {
  useRef, useEffect, useReducer, useCallback, useState, useMemo
} from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import useUserStore from '../store/userStore'
import {
  solveConstraints as solverSolve,
  buildIdxMap,
  dist2D,
  computeDisplacementCurve,
  computeDOF as solverDOF,
} from '../utils/mechanismSolver'

// ─── 几何工具 ────────────────────────────────────────────────────

const safeNum = (v, fb = 0) => (typeof v === 'number' && isFinite(v) ? v : fb)

// ─── 状态管理 ────────────────────────────────────────────────────

let _idSeq = 1
const newId = () => 'j' + (_idSeq++)

const INITIAL_STATE = {
  joints: [],
  links: [],
  selected: [],
  tool: 'select',
  transform: { x: 0, y: 0, scale: 1 },
  playing: false,
  theta: 0,
  speed: 1.0,
  deadPoint: false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL':       return { ...state, tool: action.payload, selected: [] }
    case 'SET_TRANSFORM':  return { ...state, transform: action.payload }
    case 'SET_PLAYING':    return { ...state, playing: action.payload }
    case 'SET_THETA':      return { ...state, theta: action.payload }
    case 'SET_SPEED':      return { ...state, speed: action.payload }
    case 'SET_SELECTED':   return { ...state, selected: action.payload }
    case 'SET_DEAD_POINT': return { ...state, deadPoint: action.payload }
    case 'ADD_JOINT':      return { ...state, joints: [...state.joints, action.payload] }
    case 'UPDATE_JOINT':   return {
      ...state,
      joints: state.joints.map(j => j.id === action.id ? { ...j, ...action.patch } : j)
    }
    case 'DELETE_JOINTS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        joints:   state.joints.filter(j => !ids.has(j.id)),
        links:    state.links.filter(l => !ids.has(l.aId) && !ids.has(l.bId)),
        selected: state.selected.filter(s => !(s.type === 'joint' && ids.has(s.id))),
      }
    }
    case 'ADD_LINK':    return action.payload ? { ...state, links: [...state.links, action.payload] } : state
    case 'UPDATE_LINK': return {
      ...state,
      links: state.links.map(l => l.id === action.id ? { ...l, ...action.patch } : l)
    }
    case 'DELETE_LINKS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        links:    state.links.filter(l => !ids.has(l.id)),
        selected: state.selected.filter(s => !(s.type === 'link' && ids.has(s.id))),
      }
    }
    case 'SYNC_JOINTS':  return { ...state, joints: action.payload }
    case 'SYNC_LINKS':   return { ...state, links:  action.payload }
    case 'LOAD_PRESET':  return {
      ...INITIAL_STATE,
      transform: state.transform,
      speed: state.speed,
      joints: action.joints,
      links:  action.links,
    }
    case 'CLEAR': return { ...INITIAL_STATE, transform: state.transform, speed: state.speed }
    default: return state
  }
}

// ─── Canvas 渲染工具函数 ──────────────────────────────────────────

function drawNeonLine(ctx, p1, p2, color, width, scale) {
  if (!p1 || !p2) return
  if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ',0.12)')
  ctx.lineWidth = (width * 5) / scale; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ',0.35)')
  ctx.lineWidth = (width * 2.5) / scale; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color
  ctx.lineWidth = width / scale; ctx.stroke()
  ctx.restore()
}

function drawSliderRail(ctx, j, t, isDark) {
  if (!j || !j._axisOrigin || !j._axisDir) return
  const o = j._axisOrigin
  const d = j._axisDir
  const L = 600 / t.scale
  const clr = isDark ? 'rgba(14,165,233,0.3)' : 'rgba(3,105,161,0.25)'
  ctx.save()
  ctx.setLineDash([8 / t.scale, 5 / t.scale])
  ctx.beginPath()
  ctx.moveTo(o.x - d.x * L, o.y - d.y * L)
  ctx.lineTo(o.x + d.x * L, o.y + d.y * L)
  ctx.strokeStyle = clr
  ctx.lineWidth = 1 / t.scale
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

// FIX 1: drawSliderBlock — 滑块输出点视觉统一 (橙色 + "E" + 发光)
function drawSliderBlock(ctx, j, t, isDark, isSelected) {
  if (!j || !isFinite(j.x) || !isFinite(j.y)) return
  const sc = t.scale
  const hw = 18 / sc
  const hh = 10 / sc
  const d = j._axisDir ?? { x: 1, y: 0 }
  const angle = Math.atan2(d.y, d.x)
  const isOutput = !!j._isOutput  // FIX 1: 检测输出点

  ctx.save()
  ctx.translate(j.x, j.y)
  ctx.rotate(angle)

  // FIX 1: 输出点用橙色发光，否则用青蓝色
  if (isOutput) {
    ctx.shadowColor = '#f97316'
    ctx.shadowBlur  = (isSelected ? 22 : 15) / sc
  } else {
    ctx.shadowColor = isDark ? '#38bdf8' : '#0ea5e9'
    ctx.shadowBlur  = (isSelected ? 18 : 10) / sc
  }

  // Fill
  ctx.beginPath()
  ctx.rect(-hw, -hh, hw * 2, hh * 2)
  if (isOutput) {
    // 橙色填充
    ctx.fillStyle = isDark
      ? (isSelected ? 'rgba(249,115,22,0.45)' : 'rgba(249,115,22,0.30)')
      : (isSelected ? 'rgba(249,115,22,0.38)' : 'rgba(249,115,22,0.22)')
  } else {
    ctx.fillStyle = isDark
      ? (isSelected ? 'rgba(56,189,248,0.35)' : 'rgba(14,165,233,0.22)')
      : (isSelected ? 'rgba(14,165,233,0.30)' : 'rgba(14,165,233,0.15)')
  }
  ctx.fill()

  // Border
  ctx.strokeStyle = isOutput
    ? (isSelected ? '#fb923c' : '#f97316')
    : (isSelected ? '#7dd3fc' : (isDark ? '#38bdf8' : '#0284c7'))
  ctx.lineWidth = (isSelected ? 2 : 1.5) / sc
  ctx.stroke()

  // Specular stripe
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(-hw * 0.6, -hh * 0.7, hw * 1.2, hh * 0.4)

  ctx.restore()

  // FIX 1: 输出点标签 "E"，在滑块几何中心上方渲染
  if (isOutput) {
    ctx.save()
    const fontSize = Math.max(9, 11 / sc)
    ctx.font = `bold ${fontSize}px system-ui`
    ctx.fillStyle = '#fb923c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(249,115,22,0.7)'
    ctx.shadowBlur  = 6 / sc
    ctx.fillText('E', j.x, j.y - hh - 3 / sc)
    ctx.restore()
  }
}

function drawJointNode(ctx, j, t, isDark, isSelected, isHovered) {
  if (!j || !isFinite(j.x) || !isFinite(j.y)) return
  const sc = t.scale
  const r = 8 / sc

  let fill
  if (j.fixed)       fill = isDark ? 'rgb(224,123,58)'  : 'rgb(184,78,12)'
  else if (j.driven) fill = isDark ? 'rgb(109,191,126)' : 'rgb(46,125,50)'
  else if (j._isOutput) fill = isDark ? 'rgb(251,146,60)' : 'rgb(234,88,12)'
  else               fill = isDark ? 'rgb(106,158,214)' : 'rgb(24,95,165)'

  ctx.save()
  ctx.beginPath(); ctx.arc(j.x, j.y, r * 3, 0, Math.PI * 2)
  const grd = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, r * 3)
  grd.addColorStop(0, fill.replace('rgb(', 'rgba(').replace(')', ',0.35)'))
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grd; ctx.fill()
  ctx.beginPath(); ctx.arc(j.x, j.y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill; ctx.fill()
  ctx.beginPath(); ctx.arc(j.x - r * 0.3, j.y - r * 0.3, r * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill()
  if (isSelected || isHovered) {
    ctx.beginPath(); ctx.arc(j.x, j.y, r + 5 / sc, 0, Math.PI * 2)
    ctx.strokeStyle = isSelected ? '#3c8ce7' : 'rgba(100,140,255,0.45)'
    ctx.lineWidth = 1.5 / sc; ctx.stroke()
  }
  if (j.fixed) {
    const gs = 10 / sc
    ctx.beginPath()
    ctx.moveTo(j.x - gs, j.y + r); ctx.lineTo(j.x + gs, j.y + r)
    for (let hx = -8; hx <= 8; hx += 4) {
      ctx.moveTo(j.x + hx / sc,       j.y + r)
      ctx.lineTo(j.x + (hx - 4) / sc, j.y + r + 5 / sc)
    }
    ctx.strokeStyle = isDark ? 'rgba(220,140,80,0.8)' : 'rgba(120,60,10,0.8)'
    ctx.lineWidth = 1 / sc; ctx.stroke()
  }
  const label = j.fixed ? 'F' : j.driven ? 'D' : (j._isOutput ? 'E' : '')
  if (label) {
    ctx.fillStyle = '#fff'; ctx.font = `bold ${9 / sc}px system-ui`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, j.x, j.y)
  }
  ctx.restore()
}

// FIX 3: renderCanvas 增加 showInvalidOverlay 参数
function renderCanvas(canvas, joints, links, trailRef, t, isDark, hovId, selJIds, selLIds, deadPoint, showInvalidOverlay) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = isDark ? '#0a0d18' : '#f8faff'
  ctx.fillRect(0, 0, W, H)

  // Dead-point border flash (subtle border only — overlay handled separately in React)
  if (deadPoint) {
    ctx.save()
    ctx.strokeStyle = 'rgba(239,68,68,0.5)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, W - 4, H - 4)
    ctx.restore()
  }

  ctx.save()
  ctx.translate(t.x, t.y)
  ctx.scale(t.scale, t.scale)

  // Grid
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
  const step = 50
  const gx0 = Math.floor(-t.x / t.scale / step) * step - step
  const gy0 = Math.floor(-t.y / t.scale / step) * step - step
  const gx1 = gx0 + W / t.scale + step * 2
  const gy1 = gy0 + H / t.scale + step * 2
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5 / t.scale
  for (let gx = gx0; gx < gx1; gx += step) { ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx, gy1); ctx.stroke() }
  for (let gy = gy0; gy < gy1; gy += step) { ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke() }

  // Trails
  const trailData = trailRef.current || {}
  Object.values(trailData).forEach(trail => {
    if (!trail || trail.length < 2) return
    ctx.beginPath()
    ctx.moveTo(trail[0].x, trail[0].y)
    for (let k = 1; k < trail.length; k++) {
      if (isFinite(trail[k].x) && isFinite(trail[k].y)) ctx.lineTo(trail[k].x, trail[k].y)
    }
    ctx.strokeStyle = isDark ? 'rgba(100,160,255,0.22)' : 'rgba(20,70,180,0.18)'
    ctx.lineWidth = 1.5 / t.scale; ctx.lineJoin = 'round'; ctx.stroke()
  })

  const jMap = {}
  joints.forEach(j => { if (j && j.id) jMap[j.id] = j })

  // Slider rails
  joints.forEach(j => {
    if (j && j.constraintType === 'SLIDER') drawSliderRail(ctx, j, t, isDark)
  })

  // Links
  const clrLink = isDark ? 'rgb(200,200,220)' : 'rgb(50,50,80)'
  links.forEach(lk => {
    if (!lk) return
    const ja = jMap[lk.aId], jb = jMap[lk.bId]
    if (!ja || !jb) return
    const isSel = selLIds.has(lk.id)
    drawNeonLine(ctx, ja, jb, isSel ? 'rgb(60,140,231)' : clrLink, isSel ? 3.5 : 2.2, t.scale)
    if (isFinite(ja.x) && isFinite(jb.x)) {
      const mx = (ja.x + jb.x) / 2, my = (ja.y + jb.y) / 2
      ctx.font = (10 / t.scale) + 'px system-ui'
      ctx.fillStyle = isDark ? 'rgba(180,180,220,0.55)' : 'rgba(80,80,100,0.55)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(dist2D(ja, jb).toFixed(1), mx, my - 4 / t.scale)
    }
  })

  // Joints
  joints.forEach(j => {
    if (!j) return
    if (j.constraintType === 'SLIDER') {
      drawSliderBlock(ctx, j, t, isDark, selJIds.has(j.id))
    } else {
      drawJointNode(ctx, j, t, isDark, selJIds.has(j.id), hovId === j.id)
    }
  })

  ctx.restore()
}

// ─── 主组件 ──────────────────────────────────────────────────────

export default function Sandbox() {
  const themeMode = useUserStore(s => s.resolvedTheme)
  const isDark = themeMode === 'dark'

  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Mutable refs
  const playingRef   = useRef(false)
  const thetaRef     = useRef(0)
  const speedRef     = useRef(1.0)
  const trailRef     = useRef({})
  const jointsRef    = useRef([])
  const linksRef     = useRef([])
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const selectedRef  = useRef([])
  const toolRef      = useRef('select')
  const draggingRef  = useRef(null)
  const panningRef   = useRef(false)
  const panStartRef  = useRef(null)
  const hoveredRef   = useRef(null)
  const rafRef       = useRef(null)
  const isDarkRef    = useRef(isDark)
  const deadPointRef = useRef(false)
  const prevPosRef   = useRef({})

  // FIX 3: 实时图表数据 — 用 React state 驱动，每帧更新
  const [liveChartData, setLiveChartData] = useState([])
  // FIX 3: invalid overlay 显示控制
  const [showInvalidOverlay, setShowInvalidOverlay] = useState(false)

  // Sync refs
  useEffect(() => { playingRef.current = state.playing }, [state.playing])
  useEffect(() => { speedRef.current = state.speed }, [state.speed])
  useEffect(() => { jointsRef.current = state.joints }, [state.joints])
  useEffect(() => { linksRef.current = state.links }, [state.links])
  useEffect(() => { transformRef.current = state.transform }, [state.transform])
  useEffect(() => { selectedRef.current = state.selected }, [state.selected])
  useEffect(() => { toolRef.current = state.tool }, [state.tool])
  useEffect(() => { isDarkRef.current = isDark }, [isDark])

  // FIX 4: 轨迹自动重置 — joints/links 结构变动时清空
  const prevJointCountRef = useRef(0)
  const prevLinkCountRef  = useRef(0)
  useEffect(() => {
    const jLen = state.joints.length
    const lLen = state.links.length
    if (jLen !== prevJointCountRef.current || lLen !== prevLinkCountRef.current) {
      trailRef.current = {}
      setLiveChartData([])
      prevJointCountRef.current = jLen
      prevLinkCountRef.current  = lLen
    }
  }, [state.joints.length, state.links.length])

  // ── Coordinate helpers ────────────────────────────────────────

  const screenToWorld = useCallback((sx, sy) => {
    const t = transformRef.current
    return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale }
  }, [])

  const getCanvasXY = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return { sx: 0, sy: 0 }
    const rect = canvas.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }, [])

  // ── Hit detection ─────────────────────────────────────────────

  const hitJoint = useCallback((sx, sy) => {
    const w = screenToWorld(sx, sy)
    const HIT_R = Math.max(14, 14 / transformRef.current.scale)
    const joints = jointsRef.current
    for (let i = joints.length - 1; i >= 0; i--) {
      const j = joints[i]
      if (!j || !isFinite(j.x) || !isFinite(j.y)) continue
      if (j.constraintType === 'SLIDER') {
        const hw = Math.max(20, 20 / transformRef.current.scale)
        const hh = Math.max(12, 12 / transformRef.current.scale)
        const d = j._axisDir ?? { x: 1, y: 0 }
        const angle = Math.atan2(d.y, d.x)
        const dx = w.x - j.x, dy = w.y - j.y
        const localX = dx * Math.cos(-angle) - dy * Math.sin(-angle)
        const localY = dx * Math.sin(-angle) + dy * Math.cos(-angle)
        if (Math.abs(localX) < hw && Math.abs(localY) < hh) return j
      } else {
        if (dist2D(j, w) < HIT_R) return j
      }
    }
    return null
  }, [screenToWorld])

  const hitLink = useCallback((sx, sy) => {
    const w = screenToWorld(sx, sy)
    const THRESH = Math.max(8, 8 / transformRef.current.scale)
    const jMap = {}
    jointsRef.current.forEach(j => { if (j && j.id) jMap[j.id] = j })
    for (let i = linksRef.current.length - 1; i >= 0; i--) {
      const lk = linksRef.current[i]; if (!lk) continue
      const ja = jMap[lk.aId], jb = jMap[lk.bId]; if (!ja || !jb) continue
      if (!isFinite(ja.x) || !isFinite(jb.x)) continue
      const dx = jb.x - ja.x, dy = jb.y - ja.y
      const len = Math.sqrt(dx * dx + dy * dy); if (!len) continue
      const tParam = Math.max(0, Math.min(1, ((w.x - ja.x) * dx + (w.y - ja.y) * dy) / (len * len)))
      const px = ja.x + tParam * dx - w.x, py = ja.y + tParam * dy - w.y
      if (Math.sqrt(px * px + py * py) < THRESH) return lk
    }
    return null
  }, [screenToWorld])

  // ── Animation loop ────────────────────────────────────────────

  const animate = useCallback(() => {
    try {
      const joints = jointsRef.current
      const links  = linksRef.current
      const t      = transformRef.current

      if (playingRef.current) {
        thetaRef.current = (thetaRef.current + speedRef.current * 0.022) % (2 * Math.PI)

        // Drive the driven joint
        const driven = joints.find(j => j && j.driven)
        if (driven && driven.constraintType !== 'SLIDER' && driven.pivotId) {
          const pivot = joints.find(j => j && j.id === driven.pivotId)
          if (pivot && isFinite(pivot.x) && safeNum(driven.radius) > 0) {
            driven.x = pivot.x + driven.radius * Math.cos(thetaRef.current)
            driven.y = pivot.y + driven.radius * Math.sin(thetaRef.current)
          }
        }

        // FIX 2: 增大容差到 0.15，避免微小数值抖动误报死点
        const idxMap = buildIdxMap(joints)
        const { converged, maxError } = solverSolve(joints, links, idxMap, 120, 0.15)

        // FIX 2: 只有 maxError > 5.0 (结构真正断裂) 才判定为死点
        const isDeadPoint = !converged && maxError > 5.0

        if (deadPointRef.current !== isDeadPoint) {
          deadPointRef.current = isDeadPoint
          dispatch({ type: 'SET_DEAD_POINT', payload: isDeadPoint })
          setShowInvalidOverlay(isDeadPoint)  // FIX 3: 控制 overlay

          // FIX 3: 死点时自动停止动画
          if (isDeadPoint) {
            playingRef.current = false
            dispatch({ type: 'SET_PLAYING', payload: false })
          }
        }

        // Warm-start save
        joints.forEach(j => {
          if (j && isFinite(j.x) && isFinite(j.y)) {
            prevPosRef.current[j.id] = { x: j.x, y: j.y }
          }
        })

        // Update trail for output joint
        const tr = trailRef.current
        joints.forEach(j => {
          if (!j || !j._isOutput) return
          if (!isFinite(j.x) || !isFinite(j.y) || isDeadPoint) return
          if (!tr[j.id]) tr[j.id] = []
          tr[j.id].push({ x: j.x, y: j.y })
          if (tr[j.id].length > 400) tr[j.id].shift()
        })

        // FIX 3: 每帧实时更新图表数据
        const outputJoint = joints.find(j => j && j._isOutput)
        const drivenJoint = joints.find(j => j && j.driven)
        if (outputJoint && drivenJoint && !isDeadPoint) {
          const angleDeg = Math.round((thetaRef.current * 180) / Math.PI) % 360
          setLiveChartData(prev => {
            const newPoint = {
              angle:        angleDeg,
              displacement: isFinite(outputJoint.x) ? parseFloat(outputJoint.x.toFixed(3)) : null,
            }
            // 保持最近 180 个数据点 (每 2° 一个)
            const next = [...prev.filter(p => p.angle !== angleDeg), newPoint]
              .sort((a, b) => a.angle - b.angle)
            return next.length > 180 ? next.slice(-180) : next
          })
        }

        dispatch({ type: 'SET_THETA', payload: thetaRef.current })
      }

      const selJointIds = new Set(selectedRef.current.filter(s => s.type === 'joint').map(s => s.id))
      const selLinkIds  = new Set(selectedRef.current.filter(s => s.type === 'link').map(s => s.id))

      renderCanvas(
        canvasRef.current, joints, links, trailRef, t,
        isDarkRef.current, hoveredRef.current,
        selJointIds, selLinkIds,
        deadPointRef.current,
        showInvalidOverlay
      )
    } catch (err) {
      console.error('[Sandbox animate error]', err)
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [])  // showInvalidOverlay deliberately excluded — canvas overlay is React-rendered

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate])

  // ── Canvas resize ─────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const resize = () => {
      canvas.width  = canvas.clientWidth
      canvas.height = canvas.clientHeight
      if (transformRef.current.x === 0 && transformRef.current.y === 0) {
        const newT = { x: canvas.width / 2, y: canvas.height / 2, scale: 1 }
        transformRef.current = newT
        dispatch({ type: 'SET_TRANSFORM', payload: newT })
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas); resize()
    return () => ro.disconnect()
  }, [])

  // ── Presets ───────────────────────────────────────────────────

  const loadPreset = useCallback((name) => {
    _idSeq = 1
    trailRef.current = {}
    thetaRef.current = 0
    playingRef.current = false
    prevPosRef.current = {}
    deadPointRef.current = false
    setShowInvalidOverlay(false)  // FIX 3: 清除 overlay
    setLiveChartData([])          // FIX 3: 清除图表

    let joints = [], links = []

    if (name === 'fourbar') {
      const O = { id: newId(), x: -120, y: 0, fixed: true }
      const D = { id: newId(), x: 120,  y: 0, fixed: true }
      const A = { id: newId(), x: -80,  y: 80, driven: true, pivotId: O.id, radius: dist2D({ x: -80, y: 80 }, O) }
      const B = { id: newId(), x: 80,   y: 70, _isOutput: true }
      joints = [O, D, A, B]
      links = [
        { id: newId(), aId: O.id, bId: A.id, length: dist2D(O, A) },
        { id: newId(), aId: A.id, bId: B.id, length: dist2D(A, B) },
        { id: newId(), aId: D.id, bId: B.id, length: dist2D(D, B) },
      ]
    } else if (name === 'slider') {
      const O = { id: newId(), x: -100, y: 0, fixed: true }
      const A = { id: newId(), x: -60, y: 70, driven: true, pivotId: O.id, radius: dist2D({ x: -60, y: 70 }, O) }
      const S = {
        id: newId(), x: 80, y: 0,
        constraintType: 'SLIDER',
        _axisOrigin: { x: 0, y: 0 },
        _axisDir:    { x: 1, y: 0 },
        _isOutput: true,
      }
      joints = [O, A, S]
      links = [
        { id: newId(), aId: O.id, bId: A.id, length: dist2D(O, A) },
        { id: newId(), aId: A.id, bId: S.id, length: dist2D(A, S) },
      ]
    } else if (name === 'crank') {
      const O = { id: newId(), x: 0, y: 0, fixed: true }
      const A = { id: newId(), x: 80, y: 0, driven: true, pivotId: O.id, radius: 80, _isOutput: true }
      joints = [O, A]
      links = [{ id: newId(), aId: O.id, bId: A.id, length: 80 }]
    }

    jointsRef.current = joints
    linksRef.current  = links
    dispatch({ type: 'LOAD_PRESET', joints, links })
    dispatch({ type: 'SET_PLAYING', payload: false })
    dispatch({ type: 'SET_DEAD_POINT', payload: false })
  }, [])

  // ── Mouse events ─────────────────────────────────────────────

  const handleMouseDown = useCallback((e) => {
    const { sx, sy } = getCanvasXY(e)
    if (e.button === 1 || e.button === 2) {
      panningRef.current = true
      panStartRef.current = { x: sx - transformRef.current.x, y: sy - transformRef.current.y }
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
      return
    }
    if (e.button !== 0) return

    const hj = hitJoint(sx, sy)
    const hl = !hj && hitLink(sx, sy)

    if (toolRef.current === 'select') {
      if (hj) {
        const next = e.shiftKey
          ? (selectedRef.current.find(s => s.type === 'joint' && s.id === hj.id)
              ? selectedRef.current.filter(s => !(s.type === 'joint' && s.id === hj.id))
              : [...selectedRef.current, { type: 'joint', id: hj.id }])
          : [{ type: 'joint', id: hj.id }]
        selectedRef.current = next
        dispatch({ type: 'SET_SELECTED', payload: next })
        if (!playingRef.current) draggingRef.current = { id: hj.id }
      } else if (hl) {
        const next = [{ type: 'link', id: hl.id }]
        selectedRef.current = next
        dispatch({ type: 'SET_SELECTED', payload: next })
      } else {
        selectedRef.current = []
        dispatch({ type: 'SET_SELECTED', payload: [] })
      }
    } else if (toolRef.current === 'joint') {
      const w = screenToWorld(sx, sy)
      jointsRef.current.forEach(j => { j._isOutput = false })
      const nj = { id: newId(), x: w.x, y: w.y, _isOutput: true }
      jointsRef.current = [...jointsRef.current, nj]
      dispatch({ type: 'ADD_JOINT', payload: nj })
    } else if (toolRef.current === 'slider') {
      const w = screenToWorld(sx, sy)
      jointsRef.current.forEach(j => { j._isOutput = false })
      const ns = {
        id: newId(),
        x: w.x, y: w.y,
        constraintType: 'SLIDER',
        _axisOrigin: { x: w.x, y: w.y },
        _axisDir:    { x: 1, y: 0 },
        _isOutput: true,
      }
      jointsRef.current = [...jointsRef.current, ns]
      dispatch({ type: 'ADD_JOINT', payload: ns })
    }
  }, [getCanvasXY, hitJoint, hitLink, screenToWorld])

  const handleMouseMove = useCallback((e) => {
    const { sx, sy } = getCanvasXY(e)
    if (panningRef.current && panStartRef.current) {
      const newT = { ...transformRef.current, x: sx - panStartRef.current.x, y: sy - panStartRef.current.y }
      transformRef.current = newT
      dispatch({ type: 'SET_TRANSFORM', payload: newT })
      return
    }
    if (draggingRef.current && !playingRef.current) {
      const w = screenToWorld(sx, sy)
      if (!isFinite(w.x) || !isFinite(w.y)) return
      const joints = jointsRef.current
      const jIdx = joints.findIndex(j => j && j.id === draggingRef.current.id)
      if (jIdx >= 0) {
        const j = joints[jIdx]
        let nx = w.x, ny = w.y
        if (j.constraintType === 'SLIDER' && j._axisDir) {
          const ao = j._axisOrigin ?? { x: j.x, y: j.y }
          const ad = j._axisDir
          const dx = w.x - ao.x, dy = w.y - ao.y
          const tParam = dx * ad.x + dy * ad.y
          nx = ao.x + tParam * ad.x
          ny = ao.y + tParam * ad.y
        }
        joints[jIdx] = { ...j, x: nx, y: ny }
        linksRef.current = linksRef.current.map(lk => {
          if (!lk) return lk
          if (lk.aId !== draggingRef.current.id && lk.bId !== draggingRef.current.id) return lk
          const ja = joints.find(jj => jj && jj.id === lk.aId)
          const jb = joints.find(jj => jj && jj.id === lk.bId)
          if (!ja || !jb) return lk
          const newLen = dist2D(ja, jb)
          return (isFinite(newLen) && newLen > 0) ? { ...lk, length: newLen } : lk
        })
        jointsRef.current = [...joints]
      }
      return
    }
    const hj = hitJoint(sx, sy)
    hoveredRef.current = hj ? hj.id : null
  }, [getCanvasXY, screenToWorld, hitJoint])

  const handleMouseUp = useCallback(() => {
    if (panningRef.current) {
      panningRef.current = false
      if (canvasRef.current) canvasRef.current.style.cursor = toolRef.current === 'joint' ? 'crosshair' : 'default'
    }
    if (draggingRef.current) {
      dispatch({ type: 'SYNC_JOINTS', payload: [...jointsRef.current] })
      dispatch({ type: 'SYNC_LINKS',  payload: [...linksRef.current] })
      draggingRef.current = null
    }
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const { sx, sy } = getCanvasXY(e)
    const delta = e.deltaY < 0 ? 1.12 : 0.89
    const oldScale = transformRef.current.scale
    const newScale = Math.max(0.05, Math.min(30, oldScale * delta))
    const newT = {
      scale: newScale,
      x: sx - (sx - transformRef.current.x) * (newScale / oldScale),
      y: sy - (sy - transformRef.current.y) * (newScale / oldScale),
    }
    transformRef.current = newT
    dispatch({ type: 'SET_TRANSFORM', payload: newT })
  }, [getCanvasXY])

  const handleContextMenu = useCallback((e) => { e.preventDefault() }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      const key = e.key.toLowerCase()

      if (key === 's') { toolRef.current = 'select'; dispatch({ type: 'SET_TOOL', payload: 'select' }) }
      if (key === 'a') { toolRef.current = 'joint';  dispatch({ type: 'SET_TOOL', payload: 'joint' }) }
      if (key === 'p') { toolRef.current = 'slider'; dispatch({ type: 'SET_TOOL', payload: 'slider' }) }

      if (key === 'l') {
        const selJ = selectedRef.current.filter(s => s.type === 'joint')
        if (selJ.length >= 2) {
          const ja = jointsRef.current.find(j => j && j.id === selJ[0].id)
          const jb = jointsRef.current.find(j => j && j.id === selJ[1].id)
          if (ja && jb) {
            const exists = linksRef.current.find(l => l &&
              ((l.aId === ja.id && l.bId === jb.id) || (l.aId === jb.id && l.bId === ja.id)))
            if (!exists) {
              const len = dist2D(ja, jb)
              if (len > 0 && isFinite(len)) {
                const nl = { id: newId(), aId: ja.id, bId: jb.id, length: len }
                linksRef.current = [...linksRef.current, nl]
                dispatch({ type: 'ADD_LINK', payload: nl })
              }
            }
          }
          selectedRef.current = []
          dispatch({ type: 'SET_SELECTED', payload: [] })
        }
      }

      if (key === 'delete' || key === 'backspace') {
        const selJ = selectedRef.current.filter(s => s.type === 'joint').map(s => s.id)
        const selL = selectedRef.current.filter(s => s.type === 'link').map(s => s.id)
        if (selJ.length > 0) {
          jointsRef.current = jointsRef.current.filter(j => j && !selJ.includes(j.id))
          linksRef.current  = linksRef.current.filter(l => l && !selJ.includes(l.aId) && !selJ.includes(l.bId))
          dispatch({ type: 'DELETE_JOINTS', ids: selJ })
        }
        if (selL.length > 0) {
          linksRef.current = linksRef.current.filter(l => l && !selL.includes(l.id))
          dispatch({ type: 'DELETE_LINKS', ids: selL })
        }
        selectedRef.current = []
      }

      if (key === 'f') {
        const selJ = selectedRef.current.find(s => s.type === 'joint')
        if (selJ) {
          const jIdx = jointsRef.current.findIndex(j => j && j.id === selJ.id)
          if (jIdx >= 0) {
            const j = jointsRef.current[jIdx]
            const updated = { ...j, fixed: !j.fixed, driven: j.fixed ? j.driven : false }
            jointsRef.current[jIdx] = updated
            dispatch({ type: 'UPDATE_JOINT', id: selJ.id, patch: { fixed: updated.fixed, driven: updated.driven } })
          }
        }
      }

      if (key === ' ') {
        e.preventDefault()
        const next = !playingRef.current
        playingRef.current = next
        // 恢复时清除 overlay
        if (next) {
          setShowInvalidOverlay(false)
          deadPointRef.current = false
          dispatch({ type: 'SET_DEAD_POINT', payload: false })
        }
        dispatch({ type: 'SET_PLAYING', payload: next })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Bind canvas events ────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.addEventListener('mousedown',   handleMouseDown)
    canvas.addEventListener('mousemove',   handleMouseMove)
    canvas.addEventListener('mouseup',     handleMouseUp)
    canvas.addEventListener('wheel',       handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('mousedown',   handleMouseDown)
      canvas.removeEventListener('mousemove',   handleMouseMove)
      canvas.removeEventListener('mouseup',     handleMouseUp)
      canvas.removeEventListener('wheel',       handleWheel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleContextMenu])

  useEffect(() => { loadPreset('fourbar') }, [loadPreset])

  // ── Fullscreen ────────────────────────────────────────────────

  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [])
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // ── Lock moment ───────────────────────────────────────────────

  const [locked, setLocked] = useState(false)
  const handleLockToggle = useCallback(() => {
    setLocked(prev => {
      if (!prev) dispatch({ type: 'SET_PLAYING', payload: false })
      return !prev
    })
  }, [])

  // ── Displacement curve (static, for lock mode) ────────────────

  const outputJoint = state.joints.find(j => j._isOutput)
  const drivenJoint = state.joints.find(j => j.driven)

  const staticCurvData = useMemo(() => {
    if (!locked || !drivenJoint || !outputJoint) return []
    try {
      return computeDisplacementCurve(
        jointsRef.current.map(j => ({ ...j })),
        linksRef.current.map(l => ({ ...l })),
        drivenJoint.id,
        outputJoint.id
      )
    } catch { return [] }
  }, [state.joints.length, state.links.length, locked])

  // FIX 3: 图表数据 — 运行时用实时数据，锁定时用静态全周数据
  const chartData = locked ? staticCurvData : liveChartData

  const currentAngleDeg = Math.round((thetaRef.current * 180) / Math.PI) % 360

  // ── DOF ───────────────────────────────────────────────────────

  const dof = solverDOF(state.joints, state.links)
  let dofLabel = '—', dofColor = '#94a3b8'
  if (dof !== null) {
    if      (dof <= 0)  { dofLabel = `F=${dof} 过约束`; dofColor = '#f87171' }
    else if (dof === 1) { dofLabel = 'F=1 可动';        dofColor = '#34d399' }
    else                { dofLabel = `F=${dof} 欠约束`; dofColor = '#fbbf24' }
  }

  // ── Selected item ─────────────────────────────────────────────

  const selItem  = state.selected[0]
  const selJoint = selItem?.type === 'joint' ? state.joints.find(j => j && j.id === selItem.id) : null
  const selLink  = selItem?.type === 'link'  ? state.links.find(l => l && l.id === selItem.id)  : null

  const makeDriven = useCallback((joint) => {
    const pivot = jointsRef.current.find(j => j && j.id !== joint.id && j.fixed)
    if (!pivot) return
    const r = dist2D(joint, pivot)
    if (!isFinite(r) || r <= 0) return
    jointsRef.current = jointsRef.current.map(j => {
      if (!j) return j
      if (j.id === joint.id) return { ...j, driven: true, fixed: false, pivotId: pivot.id, radius: r }
      return { ...j, driven: false }
    })
    dispatch({ type: 'SYNC_JOINTS', payload: jointsRef.current })
  }, [])

  // ── Theme tokens ──────────────────────────────────────────────

  const clrCrank  = isDark ? '#a78bfa' : '#7c3aed'
  const clrOutput = isDark ? '#fb923c' : '#ea580c'
  const textPri   = isDark ? '#e2e8f0' : '#1e293b'
  const textSec   = isDark ? 'rgba(226,232,240,0.6)' : 'rgba(30,41,59,0.6)'
  const panelBg   = isDark ? 'rgba(15,20,35,0.85)' : 'rgba(255,255,255,0.85)'
  const panelBdr  = isDark ? 'rgba(167,139,250,0.22)' : 'rgba(124,58,237,0.15)'
  const glass = {
    background:           panelBg,
    border:               `0.5px solid ${panelBdr}`,
    borderRadius:         14,
    padding:              '14px 16px',
    backdropFilter:       'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  }

  const toolBtnStyle = (id) => ({
    padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
    background: state.tool === id ? 'rgba(167,139,250,0.18)' : 'transparent',
    color:      state.tool === id ? '#a78bfa' : textSec,
    border:     state.tool === id
      ? '0.5px solid rgba(167,139,250,0.45)'
      : '0.5px solid transparent',
    transition: 'all 0.15s',
  })

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className="sandbox-page"
      ref={containerRef}
      style={{
        minHeight: '100vh', overflowY: 'auto',
        background: isDark
          ? 'linear-gradient(135deg,#080b14 0%,#0d1120 50%,#080b14 100%)'
          : 'linear-gradient(135deg,#f1f5f9 0%,#e8edf5 100%)',
        padding: '0 0 32px',
        fontFamily: 'inherit',
        fontWeight: 400,
        color: textPri, transition: 'background 0.3s',
      }}
    >
      <style>{`
        .sandbox-page,
        .sandbox-page button,
        .sandbox-page input,
        .sandbox-page select,
        .sandbox-page textarea {
          font-family: inherit;
        }
        @keyframes overlay-pulse {
          0%,100% { opacity: 0.82; }
          50%      { opacity: 0.95; }
        }
      `}</style>

      {/* FIX 5: 主题响应式标题 — key={isDark} 强制重挂载确保颜色立即更新 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
        <div key={isDark ? 'title-dark' : 'title-light'}>
          <h1 style={{
            fontSize: 20, fontWeight: 600, margin: '0 0 4px',
            background: isDark
              ? 'linear-gradient(90deg,#a78bfa,#22d3ee)'
              : 'linear-gradient(90deg,#7c3aed,#0694a2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor:  'transparent',
            display: 'inline-block',
            transition: 'none',   // 避免渐变过渡闪烁
          }}>
            实战工坊 — 通用机构设计平台
          </h1>
          <p style={{ fontSize: 13, color: textSec, margin: 0 }}>
            支持转动副、滑块副 · 鲁棒约束求解 · 死点检测 · 实时位移曲线
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          style={{
            background: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
            border:     `0.5px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)'}`,
            color:      isDark ? '#a78bfa' : '#7c3aed',
            borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
          }}
        >
          {isFullscreen ? '⊡ 退出全屏' : '⊞ 全屏'}
        </button>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 270px', gap: 16, padding: '0 24px' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Toolbar */}
          <div style={{ ...glass, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {[
              { id: 'select', label: '↖ 选择', key: 'S' },
              { id: 'joint',  label: '● 节点', key: 'A' },
              { id: 'slider', label: '▬ 滑块', key: 'P' },
            ].map(tool => (
              <button
                key={tool.id}
                onClick={() => { toolRef.current = tool.id; dispatch({ type: 'SET_TOOL', payload: tool.id }) }}
                title={`${tool.label} (${tool.key})`}
                style={toolBtnStyle(tool.id)}
              >{tool.label}</button>
            ))}

            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />

            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: dofColor, border: `0.5px solid ${dofColor}`,
              background: `${dofColor}18`,
            }}>{dofLabel}</span>

            {state.deadPoint && (
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: '#f87171', border: '0.5px solid rgba(239,68,68,0.5)',
                background: 'rgba(239,68,68,0.12)',
              }}>⚠ 死点</span>
            )}

            <button
              onClick={() => {
                const next = !state.playing
                playingRef.current = next
                if (next) {
                  // 重新播放时清除死点状态
                  setShowInvalidOverlay(false)
                  deadPointRef.current = false
                  dispatch({ type: 'SET_DEAD_POINT', payload: false })
                }
                dispatch({ type: 'SET_PLAYING', payload: next })
              }}
              style={{
                padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: state.playing ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)',
                color:      state.playing ? '#f87171' : '#34d399',
                border:     state.playing
                  ? '0.5px solid rgba(248,113,113,0.4)'
                  : '0.5px solid rgba(52,211,153,0.4)',
              }}
            >
              {state.playing ? '⏸ 暂停' : '▶ 运行'}
            </button>

            <span style={{ fontSize: 11, color: textSec, marginLeft: 'auto' }}>
              {state.selected.length > 0
                ? `${state.selected.length} 已选 · Del=删除 · F=固定 · L=连线`
                : 'S=选择  A=节点  P=滑块  L=连线  F=固定  Del=删除  Space=运行'}
            </span>
          </div>

          {/* Canvas container with FIX 3 invalid overlay */}
          <div style={{
            ...glass, padding: 0, overflow: 'hidden', position: 'relative', height: 400,
            border: state.deadPoint
              ? '1.5px solid rgba(239,68,68,0.6)'
              : `0.5px solid ${panelBdr}`,
            transition: 'border-color 0.2s',
          }}>
            <canvas
              ref={canvasRef}
              style={{
                display: 'block', width: '100%', height: '100%',
                cursor: state.tool === 'joint'  ? 'crosshair'
                      : state.tool === 'slider' ? 'cell'
                      : 'default',
              }}
            />

            {/* FIX 3: Invalid Geometry Overlay — 半透明红色居中提示 */}
            {showInvalidOverlay && (
              <div style={{
                position:       'absolute',
                inset:          0,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                background:     'rgba(239,68,68,0.18)',
                backdropFilter: 'blur(2px)',
                animation:      'overlay-pulse 1.4s ease-in-out infinite',
                pointerEvents:  'none',
                zIndex:         10,
              }}>
                <div style={{
                  padding:      '14px 28px',
                  borderRadius: 12,
                  background:   'rgba(15,5,5,0.72)',
                  border:       '1.5px solid rgba(239,68,68,0.55)',
                  textAlign:    'center',
                  boxShadow:    '0 4px 24px rgba(239,68,68,0.3)',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', letterSpacing: '0.04em' }}>
                    机构处于非法位置
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(252,165,165,0.75)', marginTop: 4 }}>
                    Invalid Geometry — 动画已自动停止
                  </div>
                  <button
                    style={{
                      marginTop:    10,
                      padding:      '5px 14px',
                      borderRadius: 8,
                      background:   'rgba(239,68,68,0.2)',
                      border:       '0.5px solid rgba(239,68,68,0.5)',
                      color:        '#fca5a5',
                      cursor:       'pointer',
                      fontSize:     11,
                      fontWeight:   600,
                      pointerEvents:'auto',
                    }}
                    onClick={() => {
                      setShowInvalidOverlay(false)
                      deadPointRef.current = false
                      dispatch({ type: 'SET_DEAD_POINT', payload: false })
                    }}
                  >
                    关闭提示
                  </button>
                </div>
              </div>
            )}

            {/* Status badge */}
            <div style={{
              position:       'absolute', top: 12, left: 12,
              background:     isDark ? 'rgba(10,13,24,0.78)' : 'rgba(255,255,255,0.82)',
              border:         `0.5px solid ${isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)'}`,
              borderRadius:   8, padding: '6px 12px', fontSize: 12, color: textSec,
              backdropFilter: 'blur(8px)', zIndex: 5,
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <span>θ = <span style={{ color: clrCrank, fontWeight: 600, fontFamily: 'monospace' }}>{currentAngleDeg}°</span></span>
              {outputJoint && isFinite(outputJoint.x) && (
                <span>E.x = <span style={{ color: clrOutput, fontWeight: 600, fontFamily: 'monospace' }}>{outputJoint.x.toFixed(2)}</span></span>
              )}
              {locked && <span style={{ color: '#fb923c', fontSize: 11 }}>🔒 锁定</span>}
            </div>

            {/* Legend */}
            <div style={{
              position:       'absolute', bottom: 10, left: 12,
              display:        'flex', gap: 10, flexWrap: 'wrap',
              background:     isDark ? 'rgba(10,13,24,0.72)' : 'rgba(255,255,255,0.78)',
              border:         `0.5px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
              borderRadius:   8, padding: '5px 10px', fontSize: 11,
              backdropFilter: 'blur(8px)',
            }}>
              {[
                [isDark ? '#6a9ed6' : '#185fa5', '自由'],
                [isDark ? '#e07b3a' : '#b84e0c', '固定 F'],
                [isDark ? '#6dbf7e' : '#2e7d32', '驱动 D'],
                [isDark ? '#fb923c' : '#ea580c', '输出 E'],
                [isDark ? '#38bdf8' : '#0284c7', '滑块'],
              ].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: textSec }}>
                  <span style={{ width: 8, height: 8, borderRadius: l === '滑块' ? 2 : '50%', background: c, display: 'inline-block', boxShadow: `0 0 4px ${c}` }} />
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* FIX 3: Displacement chart — 运行时实时更新 */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: textSec, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>输出节点 E 的水平位移 x(θ) 曲线</span>
              {state.playing && !locked && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(52,211,153,0.15)', border: '0.5px solid rgba(52,211,153,0.4)',
                  color: '#34d399', fontWeight: 600,
                }}>● 实时</span>
              )}
              {chartData.length === 0 && (
                <span style={{ color: '#fbbf24', fontSize: 11 }}>（运行后自动显示）</span>
              )}
              {locked && chartData.length > 0 && (
                <span style={{ color: '#fb923c', fontSize: 11 }}>· 点击图表跳转角度</span>
              )}
            </div>
            <div style={{ minHeight: 190 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 20, bottom: 4, left: -10 }}
                    onClick={locked ? (data) => {
                      if (data?.activeLabel != null) thetaRef.current = (data.activeLabel * Math.PI) / 180
                    } : undefined}
                    style={{ cursor: locked ? 'crosshair' : 'default' }}
                  >
                    <CartesianGrid strokeDasharray="4 4" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
                    <XAxis dataKey="angle" tick={{ fontSize: 10, fill: textSec }} tickLine={false} axisLine={false} tickFormatter={v => `${v}°`} />
                    <YAxis tick={{ fontSize: 10, fill: textSec }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} />
                    <Tooltip
                      contentStyle={{ background: isDark ? 'rgba(15,20,35,0.94)' : 'rgba(255,255,255,0.94)', border: `0.5px solid ${isDark ? 'rgba(251,146,60,0.4)' : 'rgba(234,88,12,0.3)'}`, borderRadius: 8, fontSize: 11, color: textPri }}
                      formatter={v => v !== null ? [v.toFixed(3), 'E.x'] : ['— 死点', 'E.x']}
                      labelFormatter={l => `θ = ${l}°`}
                    />
                    <ReferenceLine x={currentAngleDeg - (currentAngleDeg % 2)} stroke={clrCrank} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.7} />
                    <Line type="monotone" dataKey="displacement" stroke={clrOutput} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, fill: clrOutput }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 13 }}>
                  运行机构后即可实时看到位移曲线
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Playback control */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>动画控制</div>
            <button
              onClick={() => {
                if (!locked) {
                  const n = !state.playing
                  playingRef.current = n
                  if (n) {
                    setShowInvalidOverlay(false)
                    deadPointRef.current = false
                    dispatch({ type: 'SET_DEAD_POINT', payload: false })
                  }
                  dispatch({ type: 'SET_PLAYING', payload: n })
                }
              }}
              disabled={locked}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 9,
                background: state.playing && !locked ? 'rgba(167,139,250,0.15)' : 'rgba(34,211,238,0.15)',
                color:      state.playing && !locked ? '#a78bfa' : '#22d3ee',
                border:     state.playing && !locked
                  ? '0.5px solid rgba(167,139,250,0.45)'
                  : '0.5px solid rgba(34,211,238,0.45)',
                cursor: locked ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: locked ? 0.45 : 1,
              }}
            >{state.playing && !locked ? '⏸ 暂停' : '▶ 播放'}</button>

            {/* Lock toggle */}
            <div style={{
              marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 9,
              background: locked
                ? (isDark ? 'rgba(251,146,60,0.10)' : 'rgba(234,88,12,0.07)')
                : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
              border: `0.5px solid ${locked
                ? (isDark ? 'rgba(251,146,60,0.40)' : 'rgba(234,88,12,0.30)')
                : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)')}`,
            }}>
              <span style={{ fontSize: 12, color: locked ? clrOutput : textSec, fontWeight: locked ? 500 : 400 }}>🔒 锁定时刻</span>
              <button onClick={handleLockToggle} style={{
                width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: locked ? clrOutput : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'),
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <span style={{ position: 'absolute', top: 2, left: locked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
            {locked && <p style={{ fontSize: 11, color: textSec, margin: '6px 0 0', lineHeight: 1.5 }}>点击位移图上任意点可跳转至该角度</p>}

            {/* Speed */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSec, marginBottom: 4 }}>
                <span>转速倍数</span>
                <span style={{ fontFamily: 'monospace', color: '#22d3ee', fontWeight: 600 }}>{state.speed.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.1" max="5" step="0.1" value={state.speed}
                onChange={e => { const v = +e.target.value; speedRef.current = v; dispatch({ type: 'SET_SPEED', payload: v }) }}
                style={{ width: '100%', accentColor: '#22d3ee' }} />
            </div>

            {/* Manual angle */}
            {(!state.playing || locked) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSec, marginBottom: 4 }}>
                  <span>手动角度 θ</span>
                  <span style={{ fontFamily: 'monospace', color: clrCrank, fontWeight: 600 }}>{currentAngleDeg}°</span>
                </div>
                <input type="range" min="0" max="359" step="1" value={currentAngleDeg}
                  onChange={e => { thetaRef.current = (+e.target.value * Math.PI) / 180 }}
                  style={{ width: '100%', accentColor: clrCrank }} />
              </div>
            )}
          </div>

          {/* Presets */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>快速预设</div>
            {[
              { id: 'fourbar', label: '🔧 四连杆 (four-bar)' },
              { id: 'slider',  label: '🎯 曲柄滑块 (slider-crank)' },
              { id: 'crank',   label: '🌀 简单曲柄 (crank)' },
            ].map(p => (
              <button key={p.id} onClick={() => loadPreset(p.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                border:     `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
                color: textPri,
              }}>{p.label}</button>
            ))}
            <button onClick={() => {
              jointsRef.current = []; linksRef.current = []; trailRef.current = {}
              playingRef.current = false; selectedRef.current = []; _idSeq = 1
              prevPosRef.current = {}; deadPointRef.current = false
              setShowInvalidOverlay(false)
              setLiveChartData([])
              dispatch({ type: 'CLEAR' })
            }} style={{
              display: 'block', width: '100%', textAlign: 'left', marginTop: 4,
              padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)', color: '#f87171',
            }}>🗑️ 清空画布</button>
          </div>

          {/* Properties panel */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>属性</div>
            {selJoint ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: textPri }}>
                  {selJoint.constraintType === 'SLIDER' ? '滑块副' : '节点'} <span style={{ color: textSec }}>{selJoint.id}</span>
                </div>
                {[['X', 'x'], ['Y', 'y']].map(([lbl, key]) => (
                  <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                    {lbl}
                    <input type="number" defaultValue={selJoint[key]?.toFixed(1)} step="5" style={{
                      width: 72, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                      borderRadius: 6, padding: '3px 6px', color: textPri, fontSize: 11,
                    }}
                    onChange={e => {
                      const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                      if (j) { const v = parseFloat(e.target.value); if (isFinite(v)) { j[key] = v; dispatch({ type: 'UPDATE_JOINT', id: j.id, patch: { [key]: v } }) } }
                    }} />
                  </label>
                ))}
                {selJoint.constraintType === 'SLIDER' && (
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                    轴角度°
                    <input type="number" defaultValue={
                      selJoint._axisDir ? Math.round(Math.atan2(selJoint._axisDir.y, selJoint._axisDir.x) * 180 / Math.PI) : 0
                    } step="15" style={{
                      width: 72, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                      borderRadius: 6, padding: '3px 6px', color: textPri, fontSize: 11,
                    }}
                    onChange={e => {
                      const angDeg = parseFloat(e.target.value)
                      if (!isFinite(angDeg)) return
                      const ang = angDeg * Math.PI / 180
                      const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                      if (j) {
                        j._axisDir = { x: Math.cos(ang), y: Math.sin(ang) }
                        dispatch({ type: 'UPDATE_JOINT', id: j.id, patch: { _axisDir: j._axisDir } })
                      }
                    }} />
                  </label>
                )}
                <div style={{ fontSize: 11, color: textSec }}>
                  状态：{selJoint.constraintType === 'SLIDER' ? '🔵 滑块副' : selJoint.fixed ? '🟠 固定' : selJoint.driven ? '🟢 驱动' : '🔵 自由'}
                  {selJoint._isOutput ? ' · 🟠 输出点 E' : ''}
                </div>
                {selJoint.constraintType !== 'SLIDER' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      border:     `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
                      color: textPri,
                    }} onClick={() => {
                      const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                      if (!j) return
                      const upd = { ...j, fixed: !j.fixed, driven: j.fixed ? j.driven : false }
                      jointsRef.current[jointsRef.current.indexOf(j)] = upd
                      dispatch({ type: 'UPDATE_JOINT', id: upd.id, patch: { fixed: upd.fixed, driven: upd.driven } })
                    }}>{selJoint.fixed ? '取消固定' : '设为固定 (F)'}</button>
                    <button style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: 'rgba(52,211,153,0.10)', border: '0.5px solid rgba(52,211,153,0.30)', color: '#34d399',
                    }} onClick={() => makeDriven(selJoint)}>设为驱动</button>
                  </div>
                )}
                <button style={{
                  padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                  background: 'rgba(251,146,60,0.10)', border: '0.5px solid rgba(251,146,60,0.30)', color: '#fb923c',
                }} onClick={() => {
                  jointsRef.current.forEach(j => { if (j) j._isOutput = false })
                  const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                  if (j) { j._isOutput = true; dispatch({ type: 'SYNC_JOINTS', payload: [...jointsRef.current] }) }
                }}>标记为输出点 E</button>
              </div>
            ) : selLink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: textPri }}>连杆 <span style={{ color: textSec }}>{selLink.id}</span></div>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                  长度
                  <input type="number" defaultValue={selLink.length?.toFixed(2)} step="5" style={{
                    width: 72, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                    border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                    borderRadius: 6, padding: '3px 6px', color: textPri, fontSize: 11,
                  }}
                  onChange={e => {
                    const l = linksRef.current.find(l => l && l.id === selLink.id)
                    if (l) { const v = Math.max(1, parseFloat(e.target.value) || 1); l.length = v; dispatch({ type: 'UPDATE_LINK', id: l.id, patch: { length: v } }) }
                  }} />
                </label>
                <div style={{ fontSize: 11, color: textSec }}>{selLink.aId} → {selLink.bId}</div>
              </div>
            ) : (
              <div style={{ color: textSec, fontSize: 12 }}>未选中任何对象</div>
            )}
          </div>

          {/* Help */}
          <div style={{ ...glass, fontSize: 11, lineHeight: 1.85, color: textSec, marginTop: 'auto' }}>
            <div style={{ color: textPri, fontWeight: 500, marginBottom: 6 }}>操作说明</div>
            <div>S — 选择/拖拽节点</div>
            <div>A — 添加旋转节点</div>
            <div>P — 添加滑块副</div>
            <div><span style={{ color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 600 }}>L — 连接已选两节点（Shift 多选后按 L）</span></div>
            <div>F — 切换固定状态</div>
            <div>Del — 删除选中对象</div>
            <div>Space — 运行/暂停</div>
            <div>滚轮 — 缩放 · 右键拖拽 — 平移</div>
            <div style={{ marginTop: 8, padding: '6px 8px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
              <div style={{ color: textPri, fontWeight: 500, marginBottom: 4 }}>DOF 公式</div>
              F = 3(n−1) − 2P<br />
              F=1 → 机构可正常运动
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ margin: '16px 24px 0', ...glass, fontSize: 12, lineHeight: 1.75, color: textSec }}>
        <strong style={{ color: textPri }}>机构说明：</strong>
        旋转节点（圆形）可被连杆约束；固定节点（F）作为地面铰链；驱动节点（D）绕固定点做圆周运动；
        <span style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>滑块副（矩形）被限制沿导轨方向平动</span>，可在属性面板调节轴角度；
        输出节点（E）的轨迹显示于位移曲线图。当机构进入死点（几何无解）时动画自动停止并显示红色⚠提示。
      </div>
    </div>
  )
}