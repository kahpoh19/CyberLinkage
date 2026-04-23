/**
 * Sandbox.jsx — 通用机构设计平台 v4
 *
 * Fix 1: 横轴固定 0-360°，支持 x/y 位移维度切换
 * Fix 2: 移除简单曲柄预设，修正曲柄滑块参数（保证无死点）
 * Fix 3: 轨迹基于时间（3s）平滑淡出
 * Fix 4: 几何容错——acos/asin 输入截断 + 三角不等式预判 + 非阻塞式跳帧
 * Fix 5: 手动角度 θ 滑块优先级最高，拖动即停播放
 */

import React, {
  useRef, useEffect, useReducer, useCallback, useState, useMemo
} from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { explainSandboxMechanism, generateSandboxScene } from '../api'
import useUserStore from '../store/userStore'
import {
  solveConstraints as solverSolve,
  buildIdxMap,
  dist2D,
  computeDOF as solverDOF,
} from '../utils/mechanismSolver'

// ─── 几何工具 ────────────────────────────────────────────────────

const safeNum = (v, fb = 0) => (typeof v === 'number' && isFinite(v) ? v : fb)
const roundMaybe = (v, digits = 3) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(digits) : null)

function sampleCurveForAI(points) {
  const targetAngles = [0, 60, 120, 180, 240, 300]
  return targetAngles.map((target) => {
    const match = points.find(point => point && point.angle === target)
    if (!match) return null
    return {
      angle: match.angle,
      x: roundMaybe(match.x),
      y: roundMaybe(match.y),
    }
  }).filter(Boolean)
}

function inferMechanismLabel(joints, links) {
  const fixedCount = joints.filter(j => j.fixed).length
  const drivenCount = joints.filter(j => j.driven).length
  const sliderCount = joints.filter(j => j.constraint_type === 'SLIDER').length

  if (joints.length === 4 && links.length === 3 && fixedCount >= 2 && drivenCount === 1 && sliderCount === 0) {
    return '四连杆（推测）'
  }
  if (joints.length === 3 && links.length === 2 && sliderCount === 1 && drivenCount === 1) {
    return '曲柄滑块（推测）'
  }
  if (sliderCount > 0 && links.length > 0) return '含滑块的自定义机构'
  if (links.length > 0) return '自定义连杆机构'
  return '尚未形成完整机构'
}

// Fix 4: 安全 acos — 截断输入防止 NaN
const safeAcos = (v) => Math.acos(Math.max(-1, Math.min(1, v)))

// Fix 4: 三角不等式检查
function triangleValid(a, b, c) {
  return a + b > c && a + c > b && b + c > a
}

// Fix 4: 全量程位移曲线（含几何容错）
function computeDisplacementCurveSafe(joints, links, drivenId, outputId, dimension = 'x') {
  const STEP = 2
  const result = []
  const jSnap = joints.map(j => j ? { ...j } : null).filter(Boolean)
  const lSnap = links.map(l => l ? { ...l } : null).filter(Boolean)
  const idxMap = buildIdxMap(jSnap)

  const drivenIdx = idxMap[drivenId]
  const outputIdx = idxMap[outputId]
  if (drivenIdx === undefined || outputIdx === undefined) return result

  const driven = jSnap[drivenIdx]
  const pivot = driven.pivotId ? jSnap[idxMap[driven.pivotId]] : null
  if (!pivot && driven.constraintType !== 'SLIDER') return result

  for (let deg = 0; deg < 360; deg += STEP) {
    const theta = (deg * Math.PI) / 180

    if (driven.constraintType !== 'SLIDER' && pivot) {
      const r = driven.radius ?? dist2D(driven, pivot)
      driven.x = pivot.x + r * Math.cos(theta)
      driven.y = pivot.y + r * Math.sin(theta)
    }

    // Fix 4: 在求解前检查基本几何可行性
    const jMap = {}
    jSnap.forEach(j => { if (j && j.id) jMap[j.id] = j })
    let geometryOk = true
    for (const lk of lSnap) {
      if (!lk) continue
      const ja = jMap[lk.aId]
      const jb = jMap[lk.bId]
      if (!ja || !jb) continue
      const d = dist2D(ja, jb)
      // 如果杆长与当前距离差异过大（比如无法闭合），标记为不可行
      if (d > lk.length * 3 + 50) { geometryOk = false; break }
    }

    if (!geometryOk) {
      result.push({ angle: deg, x: null, y: null })
      continue
    }

    try {
      const { converged, maxError } = solverSolve(jSnap, lSnap, idxMap, 80, 0.1)
      const out = jSnap[outputIdx]
      const valid = converged && out && isFinite(out.x) && isFinite(out.y) && maxError < 5.0
      result.push({
        angle: deg,
        x: valid ? parseFloat(out.x.toFixed(3)) : null,
        y: valid ? parseFloat(out.y.toFixed(3)) : null,
      })
    } catch {
      result.push({ angle: deg, x: null, y: null })
    }
  }
  return result
}

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

function drawSliderBlock(ctx, j, t, isDark, isSelected) {
  if (!j || !isFinite(j.x) || !isFinite(j.y)) return
  const sc = t.scale
  const hw = 18 / sc
  const hh = 10 / sc
  const d = j._axisDir ?? { x: 1, y: 0 }
  const angle = Math.atan2(d.y, d.x)
  const isOutput = !!j._isOutput

  ctx.save()
  ctx.translate(j.x, j.y)
  ctx.rotate(angle)

  if (isOutput) {
    ctx.shadowColor = '#f97316'
    ctx.shadowBlur  = (isSelected ? 22 : 15) / sc
  } else {
    ctx.shadowColor = isDark ? '#38bdf8' : '#0ea5e9'
    ctx.shadowBlur  = (isSelected ? 18 : 10) / sc
  }

  ctx.beginPath()
  ctx.rect(-hw, -hh, hw * 2, hh * 2)
  if (isOutput) {
    ctx.fillStyle = isDark
      ? (isSelected ? 'rgba(249,115,22,0.45)' : 'rgba(249,115,22,0.30)')
      : (isSelected ? 'rgba(249,115,22,0.38)' : 'rgba(249,115,22,0.22)')
  } else {
    ctx.fillStyle = isDark
      ? (isSelected ? 'rgba(56,189,248,0.35)' : 'rgba(14,165,233,0.22)')
      : (isSelected ? 'rgba(14,165,233,0.30)' : 'rgba(14,165,233,0.15)')
  }
  ctx.fill()

  ctx.strokeStyle = isOutput
    ? (isSelected ? '#fb923c' : '#f97316')
    : (isSelected ? '#7dd3fc' : (isDark ? '#38bdf8' : '#0284c7'))
  ctx.lineWidth = (isSelected ? 2 : 1.5) / sc
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(-hw * 0.6, -hh * 0.7, hw * 1.2, hh * 0.4)

  ctx.restore()

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
  if (j.fixed)         fill = isDark ? 'rgb(224,123,58)'  : 'rgb(184,78,12)'
  else if (j.driven)   fill = isDark ? 'rgb(109,191,126)' : 'rgb(46,125,50)'
  else if (j._isOutput) fill = isDark ? 'rgb(251,146,60)' : 'rgb(234,88,12)'
  else                 fill = isDark ? 'rgb(106,158,214)' : 'rgb(24,95,165)'

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

// Fix 3: 渲染带时间透明度的轨迹
function renderTrailsWithFade(ctx, trailRef, now) {
  const TRAIL_LIFETIME = 3000
  const trailData = trailRef.current || {}
  Object.values(trailData).forEach(trail => {
    if (!trail || trail.length < 2) return

    // 过滤掉超过3秒的点
    const alive = trail.filter(p => (now - p.t) < TRAIL_LIFETIME)
    if (alive.length < 2) return

    for (let k = 1; k < alive.length; k++) {
      const p0 = alive[k - 1]
      const p1 = alive[k]
      if (!isFinite(p0.x) || !isFinite(p1.x)) continue

      const age = now - p1.t
      const alpha = Math.max(0, 1 - age / TRAIL_LIFETIME) * 0.55

      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.strokeStyle = `rgba(100,160,255,${alpha})`
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // 就地更新，移除过期点
    trailRef.current[Object.keys(trailData).find(k => trailData[k] === trail)] =
      alive
  })
}

function renderCanvas(canvas, joints, links, trailRef, t, isDark, hovId, selJIds, selLIds, deadPoint) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = isDark ? '#0a0d18' : '#f8faff'
  ctx.fillRect(0, 0, W, H)

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

  // Fix 3: 时间渐淡轨迹（在 scale 变换内绘制）
  renderTrailsWithFade(ctx, trailRef, Date.now())

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
  const prevStaticCurve = useRef([]) // ← 补充这行

  // Fix 1: Chart dimension toggle state
  const [chartDimension, setChartDimension] = useState('x')

  // Fix 3: Live chart data stores both x and y
  const [liveChartData, setLiveChartData] = useState([])
  const [showInvalidOverlay, setShowInvalidOverlay] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiLastQuestion, setAiLastQuestion] = useState('')
  const [aiExplainedKey, setAiExplainedKey] = useState('')
  const [scenePrompt, setScenePrompt] = useState('')
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneError, setSceneError] = useState('')
  const [sceneWarnings, setSceneWarnings] = useState([])
  const [sceneName, setSceneName] = useState('')

  // Sync refs
  useEffect(() => { playingRef.current = state.playing }, [state.playing])
  useEffect(() => { speedRef.current = state.speed }, [state.speed])
  useEffect(() => { jointsRef.current = state.joints }, [state.joints])
  useEffect(() => { linksRef.current = state.links }, [state.links])
  useEffect(() => { transformRef.current = state.transform }, [state.transform])
  useEffect(() => { selectedRef.current = state.selected }, [state.selected])
  useEffect(() => { toolRef.current = state.tool }, [state.tool])
  useEffect(() => { isDarkRef.current = isDark }, [isDark])

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
      const now    = Date.now()

      if (playingRef.current) {
        thetaRef.current = (thetaRef.current + speedRef.current * 0.022) % (2 * Math.PI)

        const driven = joints.find(j => j && j.driven)
        if (driven && driven.constraintType !== 'SLIDER' && driven.pivotId) {
          const pivot = joints.find(j => j && j.id === driven.pivotId)
          if (pivot && isFinite(pivot.x) && safeNum(driven.radius) > 0) {
            driven.x = pivot.x + driven.radius * Math.cos(thetaRef.current)
            driven.y = pivot.y + driven.radius * Math.sin(thetaRef.current)
          }
        }

        // Fix 4: 增大容差 + 仅在 maxError > 5 时判为死点（非阻塞）
        const idxMap = buildIdxMap(joints)
        let converged = false, maxError = 0
        try {
          const result = solverSolve(joints, links, idxMap, 120, 0.15)
          converged = result.converged
          maxError = result.maxError
        } catch {
          // Fix 4: 求解器异常时静默跳帧，不锁死
          rafRef.current = requestAnimationFrame(animate)
          return
        }

        const isDeadPoint = !converged && maxError > 5.0

        if (deadPointRef.current !== isDeadPoint) {
          deadPointRef.current = isDeadPoint
          dispatch({ type: 'SET_DEAD_POINT', payload: isDeadPoint })
          setShowInvalidOverlay(isDeadPoint)

          if (isDeadPoint) {
            playingRef.current = false
            dispatch({ type: 'SET_PLAYING', payload: false })
          }
        }

        joints.forEach(j => {
          if (j && isFinite(j.x) && isFinite(j.y)) {
            prevPosRef.current[j.id] = { x: j.x, y: j.y }
          }
        })

        // Fix 3: 轨迹点存储时间戳
        const tr = trailRef.current
        joints.forEach(j => {
          if (!j || !j._isOutput) return
          if (!isFinite(j.x) || !isFinite(j.y) || isDeadPoint) return
          if (!tr[j.id]) tr[j.id] = []
          tr[j.id].push({ x: j.x, y: j.y, t: now })
          // 限制数组长度，防止无限增长（3s * 60fps ≈ 180 点，给 500 的余量）
          if (tr[j.id].length > 500) tr[j.id].shift()
        })

        // Fix 1: 实时图表存储 x 和 y
        const outputJoint = joints.find(j => j && j._isOutput)
        if (outputJoint && !isDeadPoint) {
          const angleDeg = Math.round((thetaRef.current * 180) / Math.PI) % 360
          setLiveChartData(prev => {
            const newPoint = {
              angle: angleDeg,
              x: isFinite(outputJoint.x) ? parseFloat(outputJoint.x.toFixed(3)) : null,
              y: isFinite(outputJoint.y) ? parseFloat(outputJoint.y.toFixed(3)) : null,
            }
            const next = [...prev.filter(p => p.angle !== angleDeg), newPoint]
              .sort((a, b) => a.angle - b.angle)
            // return next.length > 180 ? next.slice(-180) : next
            return next
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
        deadPointRef.current
      )
    } catch (err) {
      console.error('[Sandbox animate error]', err)
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [])

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
    setShowInvalidOverlay(false)
    setLiveChartData([])
    prevStaticCurve.current = [] // ← 补充这行，同步清掉缓存
    let joints = [], links = []

    if (name === 'fourbar') {
      // Grashof: s+l <= p+q  =>  50+200 <= 160+110  =>  250 <= 270 ✓
      // O and D are ground pivots, 200 apart
      const O = { id: newId(), x: -100, y: 0, fixed: true }
      const D = { id: newId(), x:  100, y: 0, fixed: true }
      // A is crank end: radius=50 from O, initial theta=90deg
      const A = { id: newId(), x: -100, y: 50, driven: true, pivotId: null, radius: 50 }
      // B is coupler-rocker joint, positioned so coupler=160, rocker=110
      const B = { id: newId(), x: 60, y: 90, _isOutput: true }
      A.pivotId = O.id
      joints = [O, D, A, B]
      links = [
        { id: newId(), aId: O.id, bId: A.id, length: 50 },
        { id: newId(), aId: A.id, bId: B.id, length: 160 },
        { id: newId(), aId: D.id, bId: B.id, length: 110 },
      ]
    } else if (name === 'slider') {
      // Fix 2: 曲柄滑块，3 个节点，2 根杆
      // O: 固定机架  A: 曲柄端（绕 O 转，半径 80）  S: 水平导轨滑块
      // 连杆长度 200 >> 曲柄半径 80，保证全周无死点
      const O = { id: newId(), x: -100, y: 0, fixed: true }
      const A = {
        id: newId(), x: -100 + 80, y: 0,   // 初始 theta=0
        driven: true, pivotId: null,        // pivotId 在下面设置
        radius: 80,
      }
      A.pivotId = O.id
      const S = {
        id: newId(), x: 180, y: 0,
        constraintType: 'SLIDER',
        _axisOrigin: { x: 0, y: 0 },
        _axisDir:    { x: 1, y: 0 },
        _isOutput: true,
      }
      joints = [O, A, S]
      links = [
        { id: newId(), aId: O.id, bId: A.id, length: 80 },
        { id: newId(), aId: A.id, bId: S.id, length: dist2D(A, S) },
      ]
    }
    // Fix 2: 移除 'crank' 预设（简单曲柄已删除）

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
      // 改成这样
    const newT = { 
      ...transformRef.current, 
      x: sx - panStartRef.current.x, 
      y: sy - panStartRef.current.y   // ← 这里改了
    }
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
        
        if (j.constraintType === 'SLIDER') {
          // Allow free 2D translation of the entire slider track in edit mode
          nx = w.x
          ny = w.y
          joints[jIdx] = { ...j, x: nx, y: ny, _axisOrigin: { x: nx, y: ny } }
        } else {
          joints[jIdx] = { ...j, x: nx, y: ny }
        }

        joints.forEach((jj, idx) => {
                if (jj && jj.driven && jj.pivotId === j.id) {
                  joints[idx] = { ...jj, radius: dist2D(joints[jIdx], jj) }
                }
              })
        // Also handle if the user directly drags the driven node itself
        if (j.driven && j.pivotId) {
          const pivot = joints.find(jj => jj && jj.id === j.pivotId)
          if (pivot) {
            joints[jIdx] = { ...joints[jIdx], radius: dist2D(joints[jIdx], pivot) }
          }
        }

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
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false
      const tagName = target.tagName?.toUpperCase()
      return (
        tagName === 'INPUT'
        || tagName === 'TEXTAREA'
        || tagName === 'SELECT'
        || target.isContentEditable
      )
    }

    const onKey = (e) => {
      if (isEditableTarget(e.target)) return
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

  const applyGeneratedScene = useCallback((scene) => {
    const rawJoints = Array.isArray(scene?.joints) ? scene.joints : []
    const rawLinks = Array.isArray(scene?.links) ? scene.links : []
    if (!rawJoints.length || !rawLinks.length) {
      throw new Error('AI 返回的机构场景不完整。')
    }

    _idSeq = 1
    trailRef.current = {}
    thetaRef.current = (((safeNum(scene?.theta_deg, 0) % 360) + 360) % 360) * Math.PI / 180
    playingRef.current = false
    prevPosRef.current = {}
    deadPointRef.current = false
    selectedRef.current = []
    setLocked(false)
    setShowInvalidOverlay(false)
    setLiveChartData([])
    prevStaticCurve.current = []
    setAiResponse('')
    setAiError('')
    setAiLastQuestion('')
    setAiExplainedKey('')

    const jointIdMap = {}
    const joints = rawJoints.map((joint) => {
      const nextId = newId()
      jointIdMap[joint.id] = nextId

      const normalized = {
        id: nextId,
        x: safeNum(joint.x, 0),
        y: safeNum(joint.y, 0),
      }

      if (joint.fixed) normalized.fixed = true
      if (joint.output) normalized._isOutput = true

      if (joint.constraint_type === 'SLIDER') {
        const angle = (safeNum(joint.axis_angle_deg, 0) * Math.PI) / 180
        normalized.constraintType = 'SLIDER'
        normalized._axisDir = { x: Math.cos(angle), y: Math.sin(angle) }
        normalized._axisOrigin = {
          x: safeNum(joint.axis_origin_x, normalized.x),
          y: safeNum(joint.axis_origin_y, normalized.y),
        }
      }

      return normalized
    })

    joints.forEach((joint, index) => {
      const rawJoint = rawJoints[index]
      if (!rawJoint?.driven) return
      joint.driven = true
      joint.fixed = false
      joint.pivotId = rawJoint.pivot_id ? jointIdMap[rawJoint.pivot_id] : null
    })

    joints.forEach((joint, index) => {
      const rawJoint = rawJoints[index]
      if (!joint.driven || !joint.pivotId) return
      const pivot = joints.find(item => item.id === joint.pivotId)
      const givenRadius = safeNum(rawJoint?.radius, 0)
      joint.radius = givenRadius > 0 ? givenRadius : (pivot ? dist2D(joint, pivot) : undefined)
    })

    const links = rawLinks.map((link) => {
      const aId = jointIdMap[link.a_id]
      const bId = jointIdMap[link.b_id]
      if (!aId || !bId || aId === bId) return null

      const ja = joints.find(item => item.id === aId)
      const jb = joints.find(item => item.id === bId)
      if (!ja || !jb) return null

      const length = safeNum(link.length, dist2D(ja, jb))
      if (!(length > 0)) return null

      return {
        id: newId(),
        aId,
        bId,
        length,
      }
    }).filter(Boolean)

    const driven = joints.find(joint => joint.driven && joint.pivotId)
    if (driven) {
      const pivot = joints.find(joint => joint.id === driven.pivotId)
      if (pivot && safeNum(driven.radius, 0) > 0) {
        driven.x = pivot.x + driven.radius * Math.cos(thetaRef.current)
        driven.y = pivot.y + driven.radius * Math.sin(thetaRef.current)
      }
    }

    try {
      const idxMap = buildIdxMap(joints)
      solverSolve(joints, links, idxMap, 80, 0.15)
    } catch {
      // 静默容错，仍然允许用户继续手动调整
    }

    jointsRef.current = joints
    linksRef.current = links
    dispatch({ type: 'LOAD_PRESET', joints, links })
    dispatch({ type: 'SET_THETA', payload: thetaRef.current })
    dispatch({ type: 'SET_PLAYING', payload: false })
    dispatch({ type: 'SET_DEAD_POINT', payload: false })
  }, [])

  // Fix 1: Full 0-360° static curve for lock mode
  const outputJoint = state.joints.find(j => j._isOutput)
  const drivenJoint = state.joints.find(j => j.driven)

// Stable snapshot for locked curve — recompute when locked, dimension changes,
// or any joint position / link length changes
const jointSnapshot = JSON.stringify(
  state.joints.map(j => ({ id: j?.id, x: j?.x, y: j?.y, fixed: j?.fixed, driven: j?.driven, radius: j?.radius }))
)
const linkSnapshot = JSON.stringify(
  state.links.map(l => ({ id: l?.id, aId: l?.aId, bId: l?.bId, length: l?.length }))
)

const staticCurveData = useMemo(() => {
  if (!drivenJoint || !outputJoint) return []
  // 播放中直接返回上次结果
  if (playingRef.current) return prevStaticCurve.current  
  try {
    const result = computeDisplacementCurveSafe(
      jointsRef.current.map(j => ({ ...j })),
      linksRef.current.map(l => ({ ...l })),
      drivenJoint.id,
      outputJoint.id
    )
    prevStaticCurve.current = result // ← 补充这行：将结果存入缓存
    return result
  } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chartDimension, jointSnapshot, linkSnapshot])

  // It will only use the slow, dot-by-dot live tracking if you press Play.
  const chartData = staticCurveData
  const chartKey = chartDimension  // y-axis key to plot

  const currentAngleDeg = Math.round((thetaRef.current * 180) / Math.PI) % 360
  const sandboxAIStateKey = `${jointSnapshot}|${linkSnapshot}|${currentAngleDeg}|${state.deadPoint}|${state.speed.toFixed(1)}`
  const aiNeedsRefresh = !!aiResponse && !!aiExplainedKey && aiExplainedKey !== sandboxAIStateKey && !state.playing

  // ── DOF ───────────────────────────────────────────────────────

  // ── DOF ───────────────────────────────────────────────────────

  // Fix: Accurate Point-Mass DOF Calculation
  const movingJoints = state.joints.filter(j => j && !j.fixed)
  const totalFreeDOF = movingJoints.length * 2 // Each free point has X and Y freedom
  
  const linkConstraints = state.links.filter(l => l).length // Each link locks 1 distance
  const sliderConstraints = movingJoints.filter(j => j.constraintType === 'SLIDER').length // Each slider locks 1 axis
  
  const dof = totalFreeDOF - linkConstraints - sliderConstraints

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

  const buildSandboxMechanismState = useCallback(() => {
    const liveJoints = jointsRef.current.filter(Boolean)
    const liveLinks = linksRef.current.filter(Boolean)
    const serializedJoints = liveJoints.map(j => ({
      id: j.id,
      x: roundMaybe(j.x),
      y: roundMaybe(j.y),
      fixed: !!j.fixed,
      driven: !!j.driven,
      constraint_type: j.constraintType ?? null,
      pivot_id: j.pivotId ?? null,
      radius: roundMaybe(j.radius),
      output: !!j._isOutput,
      axis_angle_deg: j._axisDir
        ? Math.round((Math.atan2(j._axisDir.y, j._axisDir.x) * 180) / Math.PI)
        : null,
    }))
    const serializedLinks = liveLinks.map(l => ({
      id: l.id,
      a_id: l.aId,
      b_id: l.bId,
      length: roundMaybe(l.length),
    }))
    const liveOutput = liveJoints.find(j => j && j._isOutput)
    const liveDriven = liveJoints.find(j => j && j.driven)

    return {
      joints: serializedJoints,
      links: serializedLinks,
      playing: !!playingRef.current,
      speed: roundMaybe(speedRef.current, 2) ?? 1,
      theta_deg: currentAngleDeg,
      dead_point: !!deadPointRef.current,
      dof,
      chart_dimension: chartDimension,
      output_joint: liveOutput ? {
        id: liveOutput.id,
        x: roundMaybe(liveOutput.x),
        y: roundMaybe(liveOutput.y),
      } : null,
      driven_joint_id: liveDriven?.id ?? null,
      selected_items: selectedRef.current.map(item => ({ ...item })),
      curve_samples: sampleCurveForAI(staticCurveData),
      summary: {
        mechanism_guess: inferMechanismLabel(serializedJoints, serializedLinks),
        joint_count: serializedJoints.length,
        link_count: serializedLinks.length,
        fixed_joint_ids: serializedJoints.filter(j => j.fixed).map(j => j.id),
        driven_joint_ids: serializedJoints.filter(j => j.driven).map(j => j.id),
        slider_joint_ids: serializedJoints.filter(j => j.constraint_type === 'SLIDER').map(j => j.id),
        output_joint_ids: serializedJoints.filter(j => j.output).map(j => j.id),
        current_tool: toolRef.current,
        invalid_geometry: !!deadPointRef.current,
      },
    }
  }, [chartDimension, currentAngleDeg, dof, staticCurveData])

  const handleExplainSandbox = useCallback(async (presetQuestion = '') => {
    if (!jointsRef.current.length) {
      setAiError('请先在画布中创建或加载一个机构，再让 AI 解释。')
      return
    }

    const question = (presetQuestion || aiQuestion).trim()
      || '请解释当前机构的运动方式，并指出驱动点、输出点和位移趋势。'

    setAiLoading(true)
    setAiError('')

    try {
      const mechanismState = buildSandboxMechanismState()
      const res = await explainSandboxMechanism(mechanismState, question)
      setAiResponse(res.data?.response || 'AI 暂时没有返回解释。')
      setAiLastQuestion(question)
      setAiExplainedKey(sandboxAIStateKey)
    } catch (e) {
      const detail =
        e.response?.data?.detail ||
        e.response?.data?.message ||
        e.response?.data?.response ||
        e.message ||
        '网络错误，请稍后重试。'
      setAiError(detail)
    } finally {
      setAiLoading(false)
    }
  }, [aiQuestion, buildSandboxMechanismState, sandboxAIStateKey])

  const handleGenerateScene = useCallback(async (presetDescription = '') => {
    const description = (presetDescription || scenePrompt).trim()
    if (!description) {
      setSceneError('请先输入机构描述，再让 AI 布置场景。')
      return
    }

    setSceneLoading(true)
    setSceneError('')
    setSceneWarnings([])

    try {
      const res = await generateSandboxScene(description)
      const scene = res.data?.scene
      applyGeneratedScene(scene)
      setSceneName(scene?.name || 'AI 生成机构')
      setSceneWarnings(Array.isArray(res.data?.warnings) ? res.data.warnings : [])
      setAiQuestion('请解释这个新生成的机构，并指出驱动点、输出点和运动趋势。')
    } catch (e) {
      const detail =
        e.response?.data?.detail ||
        e.response?.data?.message ||
        e.response?.data?.response ||
        e.message ||
        '网络错误，请稍后重试。'
      setSceneError(detail)
    } finally {
      setSceneLoading(false)
    }
  }, [applyGeneratedScene, scenePrompt])

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
  const clrOutputY = isDark ? '#34d399' : '#059669'
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

  const dimBtnStyle = (dim) => ({
    padding: '3px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    background: chartDimension === dim
      ? (dim === 'x' ? 'rgba(251,146,60,0.20)' : 'rgba(52,211,153,0.20)')
      : 'transparent',
    color: chartDimension === dim
      ? (dim === 'x' ? clrOutput : clrOutputY)
      : textSec,
    border: chartDimension === dim
      ? `0.5px solid ${dim === 'x' ? 'rgba(251,146,60,0.5)' : 'rgba(52,211,153,0.5)'}`
      : '0.5px solid transparent',
    transition: 'all 0.15s',
  })

  const aiPanelCardStyle = {
    ...glass,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  }

  const aiPanelTitleStyle = {
    fontSize: 10,
    fontWeight: 500,
    color: textSec,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    marginBottom: 10,
  }

  const aiPanelIntroStyle = {
    fontSize: 12,
    color: textSec,
    lineHeight: 1.6,
    minHeight: 56,
  }

  const aiPanelTextareaStyle = {
    width: '100%',
    marginTop: 10,
    resize: 'vertical',
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
    borderRadius: 8,
    padding: '9px 10px',
    color: textPri,
    fontSize: 12,
    lineHeight: 1.6,
    outline: 'none',
  }

  const aiPanelResultStyle = {
    marginTop: 10,
    padding: '10px 12px',
    borderRadius: 10,
    minHeight: 120,
    background: isDark ? 'rgba(8,12,20,0.48)' : 'rgba(248,250,252,0.95)',
    border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.18)'}`,
  }

  const aiWorkspacePanels = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 12,
      alignItems: 'stretch',
    }}>
      <div style={aiPanelCardStyle}>
        <div style={aiPanelTitleStyle}>AI 动画解释</div>
        <div style={aiPanelIntroStyle}>
          AI 会读取当前节点、连杆、驱动角度、死点状态和位移曲线采样，解释这个机构现在是怎么动的。
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => handleExplainSandbox('请解释当前机构的运动方式，并指出驱动点、输出点和位移趋势。')}
            disabled={aiLoading}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: aiLoading ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600,
              background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
              border: '0.5px solid rgba(96,165,250,0.35)', opacity: aiLoading ? 0.65 : 1,
            }}
          >
            {aiLoading ? '分析中...' : '解释当前动画'}
          </button>
          <button
            onClick={() => handleExplainSandbox(
              state.deadPoint
                ? '当前机构为什么进入非法位置或死点？请指出最可能原因和调整建议。'
                : '请检查当前机构是否存在潜在死点、过约束或非法位置风险，并给出调整建议。'
            )}
            disabled={aiLoading}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: aiLoading ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600,
              background: 'rgba(251,146,60,0.15)', color: '#fb923c',
              border: '0.5px solid rgba(251,146,60,0.35)', opacity: aiLoading ? 0.65 : 1,
            }}
          >
            分析风险
          </button>
        </div>

        <textarea
          value={aiQuestion}
          onChange={e => {
            setAiQuestion(e.target.value)
            if (aiError) setAiError('')
          }}
          onKeyDown={e => e.stopPropagation()}
          placeholder="也可以继续追问，例如：为什么输出点在 180° 附近速度变慢？"
          rows={4}
          style={aiPanelTextareaStyle}
        />

        <button
          onClick={() => handleExplainSandbox()}
          disabled={aiLoading}
          style={{
            width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 8,
            background: isDark ? 'rgba(34,197,94,0.16)' : 'rgba(22,163,74,0.12)',
            color: isDark ? '#4ade80' : '#15803d',
            border: `0.5px solid ${isDark ? 'rgba(74,222,128,0.35)' : 'rgba(21,128,61,0.28)'}`,
            cursor: aiLoading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, opacity: aiLoading ? 0.7 : 1,
          }}
        >
          {aiLoading ? 'AI 正在读取当前机构...' : '发送当前问题'}
        </button>

        {aiNeedsRefresh && (
          <div style={{
            marginTop: 10, padding: '6px 8px', borderRadius: 8, fontSize: 11,
            background: 'rgba(251,191,36,0.10)', border: '0.5px solid rgba(251,191,36,0.25)', color: '#fbbf24',
          }}>
            当前机构状态已变化，建议重新解释一次。
          </div>
        )}

        {aiError && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 11, lineHeight: 1.6,
            background: 'rgba(239,68,68,0.10)', border: '0.5px solid rgba(239,68,68,0.25)', color: '#f87171',
          }}>
            {aiError}
          </div>
        )}

        <div style={aiPanelResultStyle}>
          {aiLastQuestion && (
            <div style={{ fontSize: 11, color: textSec, marginBottom: 8 }}>
              最近问题：{aiLastQuestion}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: aiResponse ? textPri : textSec, lineHeight: 1.75 }}>
            {aiLoading
              ? 'AI 正在结合当前机构状态分析，请稍候...'
              : aiResponse || '点击“解释当前动画”后，这里会显示对机构运动、驱动传递和异常风险的解释。'}
          </div>
        </div>
      </div>

      <div style={aiPanelCardStyle}>
        <div style={aiPanelTitleStyle}>AI 场景布置</div>
        <div style={aiPanelIntroStyle}>
          用自然语言描述你想要的机构，AI 会生成一个受约束的场景并直接加载到画布。
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => handleGenerateScene('请生成一个稳定的四连杆机构，两个固定铰点水平放置，包含一个曲柄驱动点和一个输出点。')}
            disabled={sceneLoading}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: sceneLoading ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600,
              background: 'rgba(167,139,250,0.14)', color: '#a78bfa',
              border: '0.5px solid rgba(167,139,250,0.35)', opacity: sceneLoading ? 0.65 : 1,
            }}
          >
            生成四连杆
          </button>
          <button
            onClick={() => handleGenerateScene('请生成一个曲柄滑块机构，包含一个固定支点、一个曲柄驱动点、一个水平滑块和一个输出点。')}
            disabled={sceneLoading}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, cursor: sceneLoading ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600,
              background: 'rgba(34,197,94,0.14)', color: '#4ade80',
              border: '0.5px solid rgba(74,222,128,0.35)', opacity: sceneLoading ? 0.65 : 1,
            }}
          >
            生成曲柄滑块
          </button>
        </div>

        <textarea
          value={scenePrompt}
          onChange={e => {
            setScenePrompt(e.target.value)
            if (sceneError) setSceneError('')
          }}
          onKeyDown={e => e.stopPropagation()}
          placeholder="例如：生成一个四连杆机构，机架水平，两端固定，中间一个驱动曲柄，输出点在右上方。"
          rows={4}
          style={aiPanelTextareaStyle}
        />

        <button
          onClick={() => handleGenerateScene()}
          disabled={sceneLoading}
          style={{
            width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 8,
            background: isDark ? 'rgba(251,191,36,0.16)' : 'rgba(202,138,4,0.12)',
            color: isDark ? '#fbbf24' : '#a16207',
            border: `0.5px solid ${isDark ? 'rgba(251,191,36,0.35)' : 'rgba(161,98,7,0.24)'}`,
            cursor: sceneLoading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, opacity: sceneLoading ? 0.7 : 1,
          }}
        >
          {sceneLoading ? 'AI 正在布置场景...' : '生成并加载到画布'}
        </button>

        {sceneError && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 11, lineHeight: 1.6,
            background: 'rgba(239,68,68,0.10)', border: '0.5px solid rgba(239,68,68,0.25)', color: '#f87171',
          }}>
            {sceneError}
          </div>
        )}

        {(sceneName || sceneWarnings.length > 0) && (
          <div style={aiPanelResultStyle}>
            {sceneName && (
              <div style={{ fontSize: 12, color: textPri, fontWeight: 600, marginBottom: sceneWarnings.length > 0 ? 8 : 0 }}>
                已加载：{sceneName}
              </div>
            )}
            {sceneWarnings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sceneWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} style={{ fontSize: 11, color: textSec, lineHeight: 1.6 }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : (
              sceneName && <div style={{ fontSize: 11, color: textSec }}>场景已加载，你可以继续让 AI 解释这个机构。</div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className="sandbox-page"
      ref={containerRef}
      style={{
        minHeight: '100%', overflowY: 'auto',
        background: 'var(--cy-page-bg, linear-gradient(135deg,#f1f5f9 0%,#e8edf5 100%))',
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

          {/* Canvas container */}
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

            {/* Invalid Geometry Overlay */}
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
                <span>
                  E.x = <span style={{ color: clrOutput, fontWeight: 600, fontFamily: 'monospace' }}>{outputJoint.x.toFixed(2)}</span>
                  <span style={{ marginLeft: 8 }}>
                    E.y = <span style={{ color: clrOutputY, fontWeight: 600, fontFamily: 'monospace' }}>{outputJoint.y.toFixed(2)}</span>
                  </span>
                </span>
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

          {/* Fix 1: Displacement chart with dimension toggle and fixed 0-360° x-axis */}
          <div style={{ ...glass }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: textSec }}>
                输出节点 E 位移曲线
              </span>
              {/* Dimension toggle */}
              <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                <button style={dimBtnStyle('x')} onClick={() => setChartDimension('x')}>
                  水平 x(θ)
                </button>
                <button style={dimBtnStyle('y')} onClick={() => setChartDimension('y')}>
                  铅垂 y(θ)
                </button>
              </div>
              {state.playing && !locked && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(52,211,153,0.15)', border: '0.5px solid rgba(52,211,153,0.4)',
                  color: '#34d399', fontWeight: 600, marginLeft: 'auto',
                }}>● 实时</span>
              )}
              {chartData.length === 0 && (
                <span style={{ color: '#fbbf24', fontSize: 11, marginLeft: 'auto' }}>（运行后显示）</span>
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
                    {/* Fix 1: 横轴固定 0-360° */}
                    <XAxis
                      dataKey="angle"
                      type="number"
                      domain={[0, 360]}
                      ticks={[0, 60, 120, 180, 240, 300, 360]}
                      tick={{ fontSize: 10, fill: textSec }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}°`}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: textSec }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => v.toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? 'rgba(15,20,35,0.94)' : 'rgba(255,255,255,0.94)',
                        border: `0.5px solid ${chartDimension === 'x' ? 'rgba(251,146,60,0.4)' : 'rgba(52,211,153,0.4)'}`,
                        borderRadius: 8, fontSize: 11, color: textPri
                      }}
                      formatter={v => v !== null ? [v.toFixed(3), `E.${chartDimension}`] : ['— 死点', `E.${chartDimension}`]}
                      labelFormatter={l => `θ = ${l}°`}
                    />
                    <ReferenceLine
                      x={currentAngleDeg}
                      stroke={clrCrank}
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      opacity={0.7}
                    />
                    <Line
                      type="monotone"
                      dataKey={chartKey}
                      stroke={chartDimension === 'x' ? clrOutput : clrOutputY}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 4, fill: chartDimension === 'x' ? clrOutput : clrOutputY }}
                      isAnimationActive={true}
                      animationDuration={300}
                      animationEasing="ease-in-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 13 }}>
                  运行机构后即可实时看到位移曲线
                </div>
              )}
            </div>
          </div>

          {aiWorkspacePanels}
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
            {locked && <p style={{ fontSize: 11, color: textSec, margin: '6px 0 0', lineHeight: 1.5 }}>锁定时显示完整 0-360° 曲线，点击图表任意点跳转角度</p>}

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

            {/* Fix 5: Manual theta slider — always works, stops playback on drag */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSec, marginBottom: 4 }}>
                <span style={{ color: state.playing ? textSec : clrCrank, fontWeight: state.playing ? 400 : 600 }}>
                  手动角度 θ {state.playing ? <span style={{ fontSize: 10, opacity: 0.6 }}>(播放中同步)</span> : ''}
                </span>
                <span style={{ fontFamily: 'monospace', color: clrCrank, fontWeight: 600 }}>{currentAngleDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="359"
                step="1"
                value={currentAngleDeg}
                // Fix 5: onMouseDown/onTouchStart 立即停止播放，抢占控制权
                onMouseDown={() => {
                  if (playingRef.current) {
                    playingRef.current = false
                    dispatch({ type: 'SET_PLAYING', payload: false })
                  }
                }}
                onTouchStart={() => {
                  if (playingRef.current) {
                    playingRef.current = false
                    dispatch({ type: 'SET_PLAYING', payload: false })
                  }
                }}
                onChange={e => {
                  // Fix 5: 直接写入 ref，立即生效，无需等待 React 重渲染
                  const deg = parseInt(e.target.value, 10)
                  thetaRef.current = (deg * Math.PI) / 180
                  // 同步驱动节点位置，触发即时重绘
                  const joints = jointsRef.current
                  const driven = joints.find(j => j && j.driven)
                  if (driven && driven.constraintType !== 'SLIDER' && driven.pivotId) {
                    const pivot = joints.find(j => j && j.id === driven.pivotId)
                    if (pivot && isFinite(pivot.x) && safeNum(driven.radius) > 0) {
                      driven.x = pivot.x + driven.radius * Math.cos(thetaRef.current)
                      driven.y = pivot.y + driven.radius * Math.sin(thetaRef.current)
                    }
                  }
                  // 触发约束求解（单次）
                  try {
                    const idxMap = buildIdxMap(joints)
                    solverSolve(joints, linksRef.current, idxMap, 60, 0.15)
                  } catch { /* 静默跳过 */ }
                  // 通知 React 更新显示数值
                  dispatch({ type: 'SET_THETA', payload: thetaRef.current })
                }}
                style={{ width: '100%', accentColor: clrCrank }}
              />
              <div style={{ fontSize: 10, color: textSec, marginTop: 2, opacity: 0.7 }}>
                拖动自动停止播放并立即更新机构位置
              </div>
            </div>
          </div>

          {/* Fix 2: Presets — removed simple crank */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>快速预设</div>
            {[
              { id: 'fourbar', label: '🔧 四连杆 (four-bar)' },
              { id: 'slider',  label: '🎯 曲柄滑块 (slider-crank)' },
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
                      if (j) { 
                        const v = parseFloat(e.target.value); 
                        if (isFinite(v)) { 
                          j[key] = v; 
                          const patch = { [key]: v }
                          // ✅ FIX: 如果是滑块，面板手动改坐标时，轨道锚点也要跟着平移
                          if (j.constraintType === 'SLIDER') {
                            j._axisOrigin = { ...j._axisOrigin, [key]: v }
                            patch._axisOrigin = j._axisOrigin
                          }
                          dispatch({ type: 'UPDATE_JOINT', id: j.id, patch }) 
                        } 
                      }
                    }} />
                  </label>
                ))}
                {selJoint.constraintType === 'SLIDER' && (
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                    轴角度°
                    <input type="number" value={
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
                        // ✅ FIX: 将轨道的锚点重置到滑块当前的中心，保证原地旋转
                        j._axisOrigin = { x: j.x, y: j.y }
                        dispatch({ type: 'UPDATE_JOINT', id: j.id, patch: { _axisDir: j._axisDir, _axisOrigin: j._axisOrigin } })
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
                    if (l) { 
                      const v = Math.max(1, parseFloat(e.target.value) || 1); 
                      l.length = v; 
                      // Sync radius if we are resizing a crank link
                      const ja = jointsRef.current.find(j => j && j.id === l.aId);
                      const jb = jointsRef.current.find(j => j && j.id === l.bId);
                      if (ja && jb) {
                        if (ja.driven && ja.pivotId === jb.id) ja.radius = v;
                        if (jb.driven && jb.pivotId === ja.id) jb.radius = v;
                      }
                      
                      dispatch({ type: 'UPDATE_LINK', id: l.id, patch: { length: v } }) 
                    }
                  }} />
                </label>
                <div style={{ fontSize: 11, color: textSec }}>{selLink.aId} → {selLink.bId}</div>
              </div>
            ) : (
              <div style={{ color: textSec, fontSize: 12 }}>未选中任何对象</div>
            )}
          </div>

          {/* Help */}
          <div style={{ ...glass, fontSize: 11, lineHeight: 1.85, color: textSec }}>
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
        输出节点（E）的轨迹随时间（3秒）自然淡出，并在位移曲线图中显示完整 0-360° 的运动规律。
        锁定模式下可查看全周期静态曲线，点击图表跳转至对应角度。
      </div>
    </div>
  )
}
