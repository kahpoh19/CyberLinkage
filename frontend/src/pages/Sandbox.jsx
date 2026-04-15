/**
 * Sandbox.jsx — 通用机构设计平台 (FIXED)
 *
 * 修复点：
 *   1. 白屏崩溃：全面防御性编程，坐标/长度为 NaN/0/undefined 时安全返回 null
 *   2. 位移曲线：重新集成 Recharts，驱动节点 0→360° 时计算最大编号自由节点的 x 位移
 *   3. 保留全部原始 UI：深色玻璃面板、霓虹线条、锁定时刻开关、侧边控制栏
 *   4. Pan/Zoom 不影响点击精度（坐标转换始终基于最新 transform）
 *   5. 全屏退出后主题色保持深色
 */

import React, {
  useRef, useEffect, useReducer, useCallback, useState, useMemo
} from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import useUserStore from '../store/userStore'

// ─── 几何工具 ────────────────────────────────────────────────────

const safeNum = (v, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback)

const dist2D = (a, b) => {
  if (!a || !b) return 0
  const dx = safeNum(a.x) - safeNum(b.x)
  const dy = safeNum(a.y) - safeNum(b.y)
  return Math.sqrt(dx * dx + dy * dy)
}

// Robust intersection of two circles. Returns null on failure.
const circleIntersect = (p1, r1, p2, r2, flip = false) => {
  if (!p1 || !p2) return null
  const d = dist2D(p1, p2)
  if (!d || !isFinite(d)) return null
  if (d > r1 + r2 + 1e-6) return null
  if (d < Math.abs(r1 - r2) - 1e-6) return null
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  if (h2 < 0) return null
  const h = Math.sqrt(h2)
  const nx = (p2.x - p1.x) / d
  const ny = (p2.y - p1.y) / d
  const mx = p1.x + a * nx
  const my = p1.y + a * ny
  return flip
    ? { x: mx + h * ny, y: my - h * nx }
    : { x: mx - h * ny, y: my + h * nx }
}

// Solve classic four-bar mechanism. Returns null when degenerate.
const solveFourBar = (thetaDeg, la, lb, lc, ld, le) => {
  try {
    const theta = (thetaDeg * Math.PI) / 180
    const O = { x: 0, y: 0 }
    const D = { x: safeNum(ld), y: 0 }
    const ax = la * Math.cos(theta), ay = la * Math.sin(theta)
    if (!isFinite(ax) || !isFinite(ay)) return null
    const A = { x: ax, y: ay }
    const B = circleIntersect(A, lb, D, lc, false)
    if (!B) return null
    const DB = { x: B.x - D.x, y: B.y - D.y }
    const lenDB = Math.sqrt(DB.x * DB.x + DB.y * DB.y) || 1
    const C = { x: D.x + (DB.x / lenDB) * lc, y: D.y + (DB.y / lenDB) * lc }
    const DC = { x: C.x - D.x, y: C.y - D.y }
    const lenDC = Math.sqrt(DC.x * DC.x + DC.y * DC.y) || 1
    const E = { x: C.x + (DC.x / lenDC) * le, y: C.y + (DC.y / lenDC) * le }
    for (const pt of [O, A, B, C, D, E]) {
      if (!isFinite(pt.x) || !isFinite(pt.y)) return null
    }
    return { O, A, B, C, D, E }
  } catch {
    return null
  }
}

// Compute full displacement curve (null at singularities)
const computeDisplacementCurve = (la, lb, lc, ld, le) => {
  const pts = []
  for (let deg = 0; deg < 360; deg += 2) {
    const result = solveFourBar(deg, la, lb, lc, ld, le)
    pts.push({
      angle: deg,
      displacement: result ? parseFloat(result.E.x.toFixed(3)) : null
    })
  }
  return pts
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
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL': return { ...state, tool: action.payload, selected: [] }
    case 'SET_TRANSFORM': return { ...state, transform: action.payload }
    case 'SET_PLAYING': return { ...state, playing: action.payload }
    case 'SET_THETA': return { ...state, theta: action.payload }
    case 'SET_SPEED': return { ...state, speed: action.payload }
    case 'SET_SELECTED': return { ...state, selected: action.payload }
    case 'ADD_JOINT': return { ...state, joints: [...state.joints, action.payload] }
    case 'UPDATE_JOINT': return {
      ...state,
      joints: state.joints.map(j => j.id === action.id ? { ...j, ...action.patch } : j)
    }
    case 'DELETE_JOINTS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        joints: state.joints.filter(j => !ids.has(j.id)),
        links: state.links.filter(l => !ids.has(l.aId) && !ids.has(l.bId)),
        selected: state.selected.filter(s => !(s.type === 'joint' && ids.has(s.id))),
      }
    }
    case 'ADD_LINK': return action.payload ? { ...state, links: [...state.links, action.payload] } : state
    case 'UPDATE_LINK': return {
      ...state,
      links: state.links.map(l => l.id === action.id ? { ...l, ...action.patch } : l)
    }
    case 'DELETE_LINKS': {
      const ids = new Set(action.ids)
      return {
        ...state,
        links: state.links.filter(l => !ids.has(l.id)),
        selected: state.selected.filter(s => !(s.type === 'link' && ids.has(s.id))),
      }
    }
    case 'SYNC_JOINTS': return { ...state, joints: action.payload }
    case 'SYNC_LINKS': return { ...state, links: action.payload }
    case 'LOAD_PRESET': return {
      ...INITIAL_STATE,
      transform: state.transform,
      speed: state.speed,
      joints: action.joints,
      links: action.links,
    }
    case 'CLEAR': return { ...INITIAL_STATE, transform: state.transform, speed: state.speed }
    default: return state
  }
}

// ─── 约束求解器 ──────────────────────────────────────────────────

function solveConstraints(joints, links) {
  const MAX_ITER = 150
  const TOL = 0.02
  const jMap = {}
  joints.forEach(j => { jMap[j.id] = j })

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxErr = 0
    for (const link of links) {
      const ja = jMap[link.aId]
      const jb = jMap[link.bId]
      if (!ja || !jb) continue
      const d = dist2D(ja, jb)
      if (!d || !isFinite(d) || !isFinite(link.length) || link.length <= 0) continue
      const err = Math.abs(d - link.length)
      if (err < TOL) continue
      maxErr = Math.max(maxErr, err)
      const aFree = !ja.fixed && !ja.driven
      const bFree = !jb.fixed && !jb.driven
      if (!aFree && !bFree) continue
      const nx = (jb.x - ja.x) / d
      const ny = (jb.y - ja.y) / d
      const corr = d - link.length
      if (!isFinite(nx) || !isFinite(ny) || !isFinite(corr)) continue
      if (aFree && bFree) {
        ja.x += nx * corr * 0.5; ja.y += ny * corr * 0.5
        jb.x -= nx * corr * 0.5; jb.y -= ny * corr * 0.5
      } else if (aFree) {
        ja.x += nx * corr; ja.y += ny * corr
      } else {
        jb.x -= nx * corr; jb.y -= ny * corr
      }
      // Guard against explosions
      for (const j of [ja, jb]) {
        if (!isFinite(j.x) || !isFinite(j.y)) {
          j.x = 0; j.y = 0
        }
      }
    }
    if (maxErr < TOL) break
  }
}

// ─── DOF 计算 ────────────────────────────────────────────────────

function computeDOF(joints, links) {
  if (!joints.length) return null
  const n = joints.length
  const Pl = links.length
  const fixedCount = joints.filter(j => j.fixed).length
  return 3 * (n - 1) - 2 * Pl - fixedCount * 3
}

// ─── Canvas 渲染（完全防御性） ────────────────────────────────────

function drawNeonLine(ctx, p1, p2, color, width, t) {
  if (!p1 || !p2) return
  if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) return
  const sc = t.scale
  ctx.save()
  ctx.lineCap = 'round'
  // Glow layer 1
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ',0.12)')
  ctx.lineWidth = (width * 5) / sc; ctx.stroke()
  // Glow layer 2
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ',0.35)')
  ctx.lineWidth = (width * 2.5) / sc; ctx.stroke()
  // Core
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color
  ctx.lineWidth = width / sc; ctx.stroke()
  ctx.restore()
}

function drawJoint(ctx, pt, radius, color, t) {
  if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) return
  const sc = t.scale
  const r = radius / sc
  ctx.save()
  // Halo
  ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2)
  const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3)
  grd.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ',0.35)'))
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grd; ctx.fill()
  // Body
  ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  // Specular
  ctx.beginPath(); ctx.arc(pt.x - r * 0.3, pt.y - r * 0.3, r * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill()
  ctx.restore()
}

function renderCanvas(canvas, joints, links, trailRef, t, isDark, hoveredId, selJointIds, selLinkIds, theta) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = isDark ? '#0a0d18' : '#f8faff'
  ctx.fillRect(0, 0, W, H)

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
  const trailColors = {
    default: isDark ? 'rgba(100,160,255,0.22)' : 'rgba(20,70,180,0.18)'
  }
  const trailData = trailRef.current || {}
  Object.entries(trailData).forEach(([, trail]) => {
    if (!trail || trail.length < 2) return
    ctx.beginPath()
    ctx.moveTo(trail[0].x, trail[0].y)
    for (let k = 1; k < trail.length; k++) {
      if (isFinite(trail[k].x) && isFinite(trail[k].y)) ctx.lineTo(trail[k].x, trail[k].y)
    }
    ctx.strokeStyle = trailColors.default
    ctx.lineWidth = 1.5 / t.scale; ctx.lineJoin = 'round'; ctx.stroke()
  })

  // Links
  const jMap = {}
  joints.forEach(j => { if (j && j.id) jMap[j.id] = j })
  const clrLink = isDark ? 'rgb(200,200,220)' : 'rgb(50,50,80)'
  links.forEach(lk => {
    if (!lk) return
    const ja = jMap[lk.aId], jb = jMap[lk.bId]
    if (!ja || !jb) return
    const isSel = selLinkIds.has(lk.id)
    const col = isSel ? 'rgb(60,140,231)' : clrLink
    drawNeonLine(ctx, ja, jb, col, isSel ? 3.5 : 2.2, t)

    // Length label
    if (isFinite(ja.x) && isFinite(jb.x)) {
      const mx = (ja.x + jb.x) / 2, my = (ja.y + jb.y) / 2
      ctx.font = (10 / t.scale) + 'px system-ui'
      ctx.fillStyle = isDark ? 'rgba(180,180,220,0.55)' : 'rgba(80,80,100,0.55)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(dist2D(ja, jb).toFixed(1), mx, my - 4 / t.scale)
    }
  })

  // Joints
  const clrFree   = isDark ? 'rgb(106,158,214)' : 'rgb(24,95,165)'
  const clrFixed  = isDark ? 'rgb(224,123,58)'  : 'rgb(184,78,12)'
  const clrDriven = isDark ? 'rgb(109,191,126)' : 'rgb(46,125,50)'
  const clrCrank  = isDark ? 'rgb(167,139,250)' : 'rgb(124,58,237)'
  const clrOutput = isDark ? 'rgb(251,146,60)'  : 'rgb(234,88,12)'

  joints.forEach(j => {
    if (!j || !isFinite(j.x) || !isFinite(j.y)) return
    const isSel = selJointIds.has(j.id)
    const isHov = hoveredId === j.id
    const r = 8 / t.scale

    let fill = clrFree
    if (j.driven) fill = clrDriven
    else if (j.fixed) fill = clrFixed
    // Override last free joint with output color
    if (j._isOutput) fill = clrOutput

    drawJoint(ctx, j, 8, fill, t)

    if (isSel || isHov) {
      ctx.beginPath(); ctx.arc(j.x, j.y, r + 5 / t.scale, 0, Math.PI * 2)
      ctx.strokeStyle = isSel ? '#3c8ce7' : 'rgba(100,140,255,0.45)'
      ctx.lineWidth = 1.5 / t.scale; ctx.stroke()
    }

    // Ground hatch
    if (j.fixed) {
      const gs = 10 / t.scale
      ctx.beginPath()
      ctx.moveTo(j.x - gs, j.y + r)
      ctx.lineTo(j.x + gs, j.y + r)
      for (let hx = -8; hx <= 8; hx += 4) {
        ctx.moveTo(j.x + hx / t.scale, j.y + r)
        ctx.lineTo(j.x + (hx - 4) / t.scale, j.y + r + 5 / t.scale)
      }
      ctx.strokeStyle = isDark ? 'rgba(220,140,80,0.8)' : 'rgba(120,60,10,0.8)'
      ctx.lineWidth = 1 / t.scale; ctx.stroke()
    }

    // Driven orbit ring
    if (j.driven && j.pivotId) {
      const pivot = jMap[j.pivotId]
      if (pivot && isFinite(pivot.x) && isFinite(j.radius) && j.radius > 0) {
        ctx.beginPath(); ctx.arc(pivot.x, pivot.y, j.radius, 0, Math.PI * 2)
        ctx.strokeStyle = isDark ? 'rgba(110,190,130,0.22)' : 'rgba(46,125,50,0.18)'
        ctx.lineWidth = 1 / t.scale
        ctx.setLineDash([4 / t.scale, 4 / t.scale]); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // Label
    const label = j.fixed ? 'F' : j.driven ? 'D' : (j._isOutput ? 'E' : '')
    if (label) {
      ctx.fillStyle = '#fff'
      ctx.font = 'bold ' + (9 / t.scale) + 'px system-ui'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(label, j.x, j.y)
    }
  })

  ctx.restore()
}

// ─── 主组件 ──────────────────────────────────────────────────────

export default function Sandbox() {
  const themeMode = useUserStore(s => s.theme)
  const isDark = themeMode === 'dark'

  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Mutable refs (避免动画循环陈旧闭包)
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

  // Sync refs
  useEffect(() => { playingRef.current = state.playing }, [state.playing])
  useEffect(() => { speedRef.current = state.speed }, [state.speed])
  useEffect(() => { jointsRef.current = state.joints }, [state.joints])
  useEffect(() => { linksRef.current = state.links }, [state.links])
  useEffect(() => { transformRef.current = state.transform }, [state.transform])
  useEffect(() => { selectedRef.current = state.selected }, [state.selected])
  useEffect(() => { toolRef.current = state.tool }, [state.tool])
  useEffect(() => { isDarkRef.current = isDark }, [isDark])

  // ── 坐标转换 ─────────────────────────────────────────────────

  const screenToWorld = useCallback((sx, sy) => {
    const t = transformRef.current
    return {
      x: (sx - t.x) / t.scale,
      y: (sy - t.y) / t.scale,
    }
  }, [])

  // ── 命中检测 ──────────────────────────────────────────────────

  const hitJoint = useCallback((sx, sy) => {
    const w = screenToWorld(sx, sy)
    const HIT_R = Math.max(12, 12 / transformRef.current.scale)
    const joints = jointsRef.current
    for (let i = joints.length - 1; i >= 0; i--) {
      const j = joints[i]
      if (!j || !isFinite(j.x) || !isFinite(j.y)) continue
      if (dist2D(j, w) < HIT_R) return j
    }
    return null
  }, [screenToWorld])

  const hitLink = useCallback((sx, sy) => {
    const w = screenToWorld(sx, sy)
    const THRESH = Math.max(8, 8 / transformRef.current.scale)
    const joints = jointsRef.current
    const jMap = {}
    joints.forEach(j => { if (j && j.id) jMap[j.id] = j })
    const links = linksRef.current
    for (let i = links.length - 1; i >= 0; i--) {
      const lk = links[i]
      if (!lk) continue
      const ja = jMap[lk.aId], jb = jMap[lk.bId]
      if (!ja || !jb) continue
      if (!isFinite(ja.x) || !isFinite(jb.x)) continue
      const dx = jb.x - ja.x, dy = jb.y - ja.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (!len || !isFinite(len)) continue
      const t = Math.max(0, Math.min(1, ((w.x - ja.x) * dx + (w.y - ja.y) * dy) / (len * len)))
      const px = ja.x + t * dx - w.x, py = ja.y + t * dy - w.y
      if (Math.sqrt(px * px + py * py) < THRESH) return lk
    }
    return null
  }, [screenToWorld])

  // ── 动画循环 ─────────────────────────────────────────────────

  const animate = useCallback(() => {
    try {
      const joints = jointsRef.current
      const links  = linksRef.current
      const t      = transformRef.current

      if (playingRef.current) {
        thetaRef.current = (thetaRef.current + speedRef.current * 0.022) % (2 * Math.PI)
        const driven = joints.find(j => j && j.driven)
        if (driven && driven.pivotId) {
          const pivot = joints.find(j => j && j.id === driven.pivotId)
          if (pivot && isFinite(pivot.x) && isFinite(driven.radius) && driven.radius > 0) {
            driven.x = pivot.x + driven.radius * Math.cos(thetaRef.current)
            driven.y = pivot.y + driven.radius * Math.sin(thetaRef.current)
          }
        }

        // Solve constraints on copies, write back to non-fixed joints
        const jCopy = joints.map(j => j ? { ...j } : null).filter(Boolean)
        solveConstraints(jCopy, links)
        jCopy.forEach((jc, i) => {
          const orig = joints[i]
          if (!orig || orig.fixed || orig.driven) return
          if (isFinite(jc.x) && isFinite(jc.y)) {
            orig.x = jc.x; orig.y = jc.y
          }
        })

        // Trail
        const tr = trailRef.current
        joints.forEach(j => {
          if (!j || !j._isOutput) return
          if (!isFinite(j.x) || !isFinite(j.y)) return
          if (!tr[j.id]) tr[j.id] = []
          tr[j.id].push({ x: j.x, y: j.y })
          if (tr[j.id].length > 200) tr[j.id].shift()
        })

        dispatch({ type: 'SET_THETA', payload: thetaRef.current })
      }

      const selJointIds = new Set(selectedRef.current.filter(s => s.type === 'joint').map(s => s.id))
      const selLinkIds  = new Set(selectedRef.current.filter(s => s.type === 'link').map(s => s.id))

      renderCanvas(
        canvasRef.current,
        joints,
        links,
        trailRef,
        t,
        isDarkRef.current,
        hoveredRef.current,
        selJointIds,
        selLinkIds,
        thetaRef.current
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

  // ── Canvas 尺寸 ───────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
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
    ro.observe(canvas)
    resize()
    return () => ro.disconnect()
  }, [])

  // ── 预设加载器 ────────────────────────────────────────────────

  const loadPreset = useCallback((name) => {
    _idSeq = 1
    trailRef.current = {}
    thetaRef.current = 0
    playingRef.current = false
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
      const G = { id: newId(), x: -200, y: 0, fixed: true }
      const B = { id: newId(), x: 80, y: 0, _isOutput: true }
      joints = [O, A, G, B]
      links = [
        { id: newId(), aId: O.id, bId: A.id, length: dist2D(O, A) },
        { id: newId(), aId: A.id, bId: B.id, length: dist2D(A, B) },
        { id: newId(), aId: G.id, bId: B.id, length: dist2D(G, B) },
      ]
    } else if (name === 'crank') {
      const O = { id: newId(), x: 0,  y: 0, fixed: true }
      const A = { id: newId(), x: 80, y: 0, driven: true, pivotId: O.id, radius: 80, _isOutput: true }
      joints = [O, A]
      links = [{ id: newId(), aId: O.id, bId: A.id, length: 80 }]
    }

    jointsRef.current = joints
    linksRef.current  = links
    dispatch({ type: 'LOAD_PRESET', joints, links })
    dispatch({ type: 'SET_PLAYING', payload: false })
  }, [])

  // ── 鼠标事件 ─────────────────────────────────────────────────

  const getCanvasXY = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return { sx: 0, sy: 0 }
    const rect = canvas.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }, [])

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
      // Find max existing free joint and set _isOutput to false, new is output
      jointsRef.current.forEach(j => { j._isOutput = false })
      const nj = { id: newId(), x: w.x, y: w.y, _isOutput: true }
      jointsRef.current = [...jointsRef.current, nj]
      dispatch({ type: 'ADD_JOINT', payload: nj })
    }
  }, [getCanvasXY, hitJoint, hitLink, screenToWorld])

  const handleMouseMove = useCallback((e) => {
    const { sx, sy } = getCanvasXY(e)

    if (panningRef.current && panStartRef.current) {
      const newT = {
        ...transformRef.current,
        x: sx - panStartRef.current.x,
        y: sy - panStartRef.current.y,
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
        joints[jIdx] = { ...joints[jIdx], x: w.x, y: w.y }
        // Recompute link lengths for attached links
        linksRef.current = linksRef.current.map(lk => {
          if (!lk) return lk
          const ja = joints.find(j => j && j.id === lk.aId)
          const jb = joints.find(j => j && j.id === lk.bId)
          if (!ja || !jb) return lk
          if (lk.aId === draggingRef.current.id || lk.bId === draggingRef.current.id) {
            const newLen = dist2D(ja, jb)
            return isFinite(newLen) && newLen > 0 ? { ...lk, length: newLen } : lk
          }
          return lk
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
      dispatch({ type: 'SYNC_LINKS', payload: [...linksRef.current] })
      draggingRef.current = null
    }
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const { sx, sy } = getCanvasXY(e)
    const delta    = e.deltaY < 0 ? 1.12 : 0.89
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

  // ── 键盘 ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      const key = e.key.toLowerCase()

      if (key === 's') { toolRef.current = 'select'; dispatch({ type: 'SET_TOOL', payload: 'select' }) }
      if (key === 'a') { toolRef.current = 'joint';  dispatch({ type: 'SET_TOOL', payload: 'joint' }) }

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
        dispatch({ type: 'SET_PLAYING', payload: next })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 绑定 Canvas 事件 ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup',   handleMouseUp)
    canvas.addEventListener('wheel',     handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup',   handleMouseUp)
      canvas.removeEventListener('wheel',     handleWheel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleContextMenu])

  // ── 初始预设 ──────────────────────────────────────────────────

  useEffect(() => { loadPreset('fourbar') }, [loadPreset])

  // ── 全屏 ─────────────────────────────────────────────────────

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

  // ── 锁定时刻 ─────────────────────────────────────────────────

  const [locked, setLocked] = useState(false)
  const handleLockToggle = useCallback(() => {
    setLocked(prev => {
      if (!prev) dispatch({ type: 'SET_PLAYING', payload: false })
      return !prev
    })
  }, [])

  // ── 位移曲线（仅四连杆预设有效） ─────────────────────────────

  // Detect if current mechanism is a simple four-bar-like chain
  const outputJoint = state.joints.find(j => j._isOutput)
  const drivenJoint = state.joints.find(j => j.driven)
  const pivotJoint  = drivenJoint ? state.joints.find(j => j.id === drivenJoint.pivotId) : null

  // Displacement curve: sweep driven joint through 360° and track output joint x
  const curvData = useMemo(() => {
    if (!drivenJoint || !pivotJoint || !outputJoint) return []
    const pts = []
    const jointsSnap = jointsRef.current.map(j => ({ ...j }))
    const linksSnap  = linksRef.current.map(l => ({ ...l }))

    for (let deg = 0; deg < 360; deg += 2) {
      const theta = (deg * Math.PI) / 180
      const r = safeNum(drivenJoint.radius, 80)
      const simJoints = jointsSnap.map(j => {
        if (!j) return j
        if (j.id === drivenJoint.id) {
          return { ...j,
            x: pivotJoint.x + r * Math.cos(theta),
            y: pivotJoint.y + r * Math.sin(theta),
          }
        }
        return { ...j }
      })
      solveConstraints(simJoints, linksSnap)
      const out = simJoints.find(j => j && j.id === outputJoint.id)
      pts.push({
        angle: deg,
        displacement: (out && isFinite(out.x)) ? parseFloat(out.x.toFixed(3)) : null
      })
    }
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.joints.length, state.links.length, state.playing, locked])

  const currentAngleDeg = Math.round((thetaRef.current * 180) / Math.PI) % 360

  // ── DOF ─────────────────────────────────────────────────────

  const dof = computeDOF(state.joints, state.links)
  let dofLabel = '—', dofColor = '#94a3b8'
  if (dof !== null) {
    if (dof <= 0) { dofLabel = `F=${dof} 过约束`; dofColor = '#f87171' }
    else if (dof === 1) { dofLabel = `F=1 可动`; dofColor = '#34d399' }
    else { dofLabel = `F=${dof} 欠约束`; dofColor = '#fbbf24' }
  }

  // ── Selected item ────────────────────────────────────────────

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

  // ── 样式 ─────────────────────────────────────────────────────

  const clrCrank  = isDark ? '#a78bfa' : '#7c3aed'
  const clrOutput = isDark ? '#fb923c' : '#ea580c'
  const textPri   = isDark ? '#e2e8f0' : '#1e293b'
  const textSec   = isDark ? 'rgba(226,232,240,0.6)' : 'rgba(30,41,59,0.6)'
  const panelBg   = isDark ? 'rgba(15,20,35,0.85)' : 'rgba(255,255,255,0.85)'
  const panelBdr  = isDark ? 'rgba(167,139,250,0.22)' : 'rgba(124,58,237,0.15)'
  const glass = {
    background: panelBg,
    border: `0.5px solid ${panelBdr}`,
    borderRadius: 14,
    padding: '14px 16px',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  }

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        overflowY: 'auto',
        background: isDark
          ? 'linear-gradient(135deg,#080b14 0%,#0d1120 50%,#080b14 100%)'
          : 'linear-gradient(135deg,#f1f5f9 0%,#e8edf5 100%)',
        padding: '0 0 32px',
        fontFamily: 'system-ui, sans-serif',
        color: textPri,
        transition: 'background 0.3s',
      }}
    >
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
        <div>
          <h1 style={{
            fontSize: 20, fontWeight: 500, margin: '0 0 4px',
            background: isDark
              ? 'linear-gradient(90deg,#a78bfa,#22d3ee)'
              : 'linear-gradient(90deg,#7c3aed,#0694a2)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            display: 'inline-block'
          }}>
            实战工坊 — 通用机构设计平台
          </h1>
          <p style={{ fontSize: 13, color: textSec, margin: 0 }}>
            自由搭建节点与连杆，实时仿真机构运动 · 位移曲线自动追踪输出点
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          style={{
            background: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
            border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)'}`,
            color: isDark ? '#a78bfa' : '#7c3aed',
            borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500
          }}
        >
          {isFullscreen ? '⊡ 退出全屏' : '⊞ 全屏'}
        </button>
      </div>

      {/* 主体 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 270px', gap: 16, padding: '0 24px' }}>

        {/* 左：工具栏 + Canvas + 图表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 工具 + 状态栏 */}
          <div style={{ ...glass, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* 工具按钮 */}
            {[
              { id: 'select', label: '↖ 选择', key: 'S' },
              { id: 'joint',  label: '+ 节点', key: 'A' },
            ].map(tool => (
              <button
                key={tool.id}
                onClick={() => { toolRef.current = tool.id; dispatch({ type: 'SET_TOOL', payload: tool.id }) }}
                title={`${tool.label} (${tool.key})`}
                style={{
                  padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: state.tool === tool.id ? 'rgba(167,139,250,0.18)' : 'transparent',
                  color:      state.tool === tool.id ? '#a78bfa' : textSec,
                  border: state.tool === tool.id ? '0.5px solid rgba(167,139,250,0.45)' : '0.5px solid transparent',
                  transition: 'all 0.15s',
                }}
              >{tool.label}</button>
            ))}

            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />

            {/* DOF badge */}
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: dofColor, border: `0.5px solid ${dofColor}`,
              background: `${dofColor}18`,
            }}>
              {dofLabel}
            </span>

            {/* Play/Pause */}
            <button
              onClick={() => {
                const next = !state.playing
                playingRef.current = next
                dispatch({ type: 'SET_PLAYING', payload: next })
              }}
              style={{
                padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: state.playing ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)',
                color:      state.playing ? '#f87171' : '#34d399',
                border:     state.playing ? '0.5px solid rgba(248,113,113,0.4)' : '0.5px solid rgba(52,211,153,0.4)',
              }}
            >
              {state.playing ? '⏸ 暂停' : '▶ 运行'}
            </button>

            {/* Hint */}
            <span style={{ fontSize: 11, color: textSec, marginLeft: 'auto' }}>
              {state.selected.length > 0
                ? `${state.selected.length} 已选 · Del=删除 · F=固定 · L=连线`
                : 'S=选择  A=添加节点  L=连接两节点  F=固定  Del=删除  Space=运行'}
            </span>
          </div>

          {/* Canvas 区 */}
          <div style={{ ...glass, padding: 0, overflow: 'hidden', position: 'relative', height: 400 }}>
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: '100%', height: '100%', cursor: state.tool === 'joint' ? 'crosshair' : 'default' }}
            />

            {/* 状态角标 */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: isDark ? 'rgba(10,13,24,0.78)' : 'rgba(255,255,255,0.82)',
              border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)'}`,
              borderRadius: 8, padding: '6px 12px', fontSize: 12, color: textSec,
              backdropFilter: 'blur(8px)', zIndex: 5,
              display: 'flex', gap: 12, alignItems: 'center'
            }}>
              <span>
                θ = <span style={{ color: clrCrank, fontWeight: 600, fontFamily: 'monospace' }}>
                  {currentAngleDeg}°
                </span>
              </span>
              {outputJoint && isFinite(outputJoint.x) && (
                <span>
                  E.x = <span style={{ color: clrOutput, fontWeight: 600, fontFamily: 'monospace' }}>
                    {outputJoint.x.toFixed(2)}
                  </span>
                </span>
              )}
              {locked && <span style={{ color: '#fb923c', fontSize: 11 }}>🔒 锁定</span>}
              {dof !== null && dof !== 1 && (
                <span style={{ color: '#f87171', fontSize: 11 }}>
                  {dof <= 0 ? '过约束' : '欠约束/未闭合'}
                </span>
              )}
            </div>

            {/* 图例 */}
            <div style={{
              position: 'absolute', bottom: 10, left: 12,
              display: 'flex', gap: 12,
              background: isDark ? 'rgba(10,13,24,0.72)' : 'rgba(255,255,255,0.78)',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
              borderRadius: 8, padding: '5px 10px', fontSize: 11,
              backdropFilter: 'blur(8px)',
            }}>
              {[
                [isDark ? '#6a9ed6' : '#185fa5', '自由节点'],
                [isDark ? '#e07b3a' : '#b84e0c', '固定 F'],
                [isDark ? '#6dbf7e' : '#2e7d32', '驱动 D'],
                [isDark ? '#fb923c' : '#ea580c', '输出 E'],
              ].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: textSec }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block', boxShadow: `0 0 4px ${c}` }} />
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* 位移曲线图 */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: textSec, marginBottom: 6 }}>
              输出节点 E 的水平位移 x — 驱动角度 θ 曲线
              {curvData.length === 0 && (
                <span style={{ marginLeft: 8, color: '#fbbf24', fontSize: 11 }}>
                  （需设置驱动节点 D 和输出节点 E）
                </span>
              )}
              {locked && curvData.length > 0 && (
                <span style={{ marginLeft: 10, color: '#fb923c', fontSize: 11 }}>· 点击图表跳转角度</span>
              )}
            </div>
            <div style={{ minHeight: 190 }}>
              {curvData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={curvData}
                    margin={{ top: 4, right: 20, bottom: 4, left: -10 }}
                    onClick={locked ? (data) => {
                      if (!data || !data.activeLabel) return
                      const angle = data.activeLabel
                      thetaRef.current = (angle * Math.PI) / 180
                    } : undefined}
                    style={{ cursor: locked ? 'crosshair' : 'default' }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 4"
                      stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'}
                    />
                    <XAxis
                      dataKey="angle"
                      tick={{ fontSize: 10, fill: textSec }}
                      tickLine={false} axisLine={false}
                      tickFormatter={v => `${v}°`}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: textSec }}
                      tickLine={false} axisLine={false}
                      tickFormatter={v => v.toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? 'rgba(15,20,35,0.94)' : 'rgba(255,255,255,0.94)',
                        border: `0.5px solid ${isDark ? 'rgba(251,146,60,0.4)' : 'rgba(234,88,12,0.3)'}`,
                        borderRadius: 8, fontSize: 11, color: textPri,
                      }}
                      formatter={v => v !== null ? [v.toFixed(3), 'E.x'] : ['—', '死点/无解']}
                      labelFormatter={l => `θ = ${l}°`}
                    />
                    <ReferenceLine
                      x={currentAngleDeg % 360 - (currentAngleDeg % 360) % 2}
                      stroke={clrCrank}
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      opacity={0.7}
                    />
                    <Line
                      type="monotone"
                      dataKey="displacement"
                      stroke={clrOutput}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 4, fill: clrOutput }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{
                  height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: textSec, fontSize: 13
                }}>
                  加载预设或设置驱动/输出节点后显示曲线
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右：控制面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 播放 + 锁定 */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              动画控制
            </div>

            <button
              onClick={() => {
                if (!locked) {
                  const next = !state.playing
                  playingRef.current = next
                  dispatch({ type: 'SET_PLAYING', payload: next })
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
                cursor: locked ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, opacity: locked ? 0.45 : 1,
                transition: 'all 0.15s',
              }}
            >
              {state.playing && !locked ? '⏸ 暂停' : '▶ 播放'}
            </button>

            {/* 锁定时刻开关 */}
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
              <span style={{ fontSize: 12, color: locked ? clrOutput : textSec, fontWeight: locked ? 500 : 400 }}>
                🔒 锁定时刻
              </span>
              <button
                onClick={handleLockToggle}
                style={{
                  width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: locked ? clrOutput : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'),
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: locked ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
            {locked && (
              <p style={{ fontSize: 11, color: textSec, margin: '6px 0 0', lineHeight: 1.5 }}>
                点击位移图表上任意点可跳转至对应角度
              </p>
            )}

            {/* 速度滑块 */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSec, marginBottom: 4 }}>
                <span>转速倍数</span>
                <span style={{ fontFamily: 'monospace', color: '#22d3ee', fontWeight: 600 }}>{state.speed.toFixed(1)}x</span>
              </div>
              <input
                type="range" min="0.1" max="5" step="0.1" value={state.speed}
                onChange={e => {
                  const v = +e.target.value
                  speedRef.current = v
                  dispatch({ type: 'SET_SPEED', payload: v })
                }}
                style={{ width: '100%', accentColor: '#22d3ee' }}
              />
            </div>

            {/* 手动角度（暂停时） */}
            {(!state.playing || locked) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSec, marginBottom: 4 }}>
                  <span>手动角度 θ</span>
                  <span style={{ fontFamily: 'monospace', color: clrCrank, fontWeight: 600 }}>{currentAngleDeg}°</span>
                </div>
                <input
                  type="range" min="0" max="359" step="1"
                  value={currentAngleDeg}
                  onChange={e => { thetaRef.current = (+e.target.value * Math.PI) / 180 }}
                  style={{ width: '100%', accentColor: clrCrank }}
                />
              </div>
            )}
          </div>

          {/* 快速预设 */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
              快速预设
            </div>
            {[
              { id: 'fourbar', label: '🔧 四连杆 (four-bar)' },
              { id: 'slider',  label: '🎯 曲柄滑块 (slider-crank)' },
              { id: 'crank',   label: '🌀 简单曲柄 (crank)' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => loadPreset(p.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                  padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
                  color: textPri, transition: 'background 0.12s',
                }}
              >{p.label}</button>
            ))}
            <button
              onClick={() => {
                jointsRef.current = []; linksRef.current = []; trailRef.current = {}
                playingRef.current = false; selectedRef.current = []; _idSeq = 1
                dispatch({ type: 'CLEAR' })
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', marginTop: 4,
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                background: 'rgba(239,68,68,0.08)',
                border: '0.5px solid rgba(239,68,68,0.25)',
                color: '#f87171',
              }}
            >🗑️ 清空画布</button>
          </div>

          {/* 属性面板 */}
          <div style={{ ...glass }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: textSec, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
              属性
            </div>
            {selJoint ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: textPri }}>
                  节点 <span style={{ color: textSec }}>{selJoint.id}</span>
                </div>
                {[['X', 'x'], ['Y', 'y']].map(([lbl, key]) => (
                  <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                    {lbl}
                    <input
                      type="number"
                      defaultValue={selJoint[key]?.toFixed(1)}
                      step="5"
                      style={{
                        width: 72, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                        border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                        borderRadius: 6, padding: '3px 6px', color: textPri, fontSize: 11,
                      }}
                      onChange={e => {
                        const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                        if (j) {
                          const v = parseFloat(e.target.value)
                          if (isFinite(v)) { j[key] = v; dispatch({ type: 'UPDATE_JOINT', id: j.id, patch: { [key]: v } }) }
                        }
                      }}
                    />
                  </label>
                ))}
                <div style={{ fontSize: 11, color: textSec }}>
                  状态：{selJoint.fixed ? '🟠 固定' : selJoint.driven ? '🟢 驱动' : '🔵 自由'}
                  {selJoint._isOutput ? ' · 🟠 输出点' : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={{ flex: 1, padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
                      color: textPri }}
                    onClick={() => {
                      const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                      if (!j) return
                      const upd = { ...j, fixed: !j.fixed, driven: j.fixed ? j.driven : false }
                      const idx = jointsRef.current.indexOf(j)
                      jointsRef.current[idx] = upd
                      dispatch({ type: 'UPDATE_JOINT', id: upd.id, patch: { fixed: upd.fixed, driven: upd.driven } })
                    }}
                  >{selJoint.fixed ? '取消固定' : '设为固定 (F)'}</button>
                  <button
                    style={{ flex: 1, padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: 'rgba(52,211,153,0.10)', border: '0.5px solid rgba(52,211,153,0.30)',
                      color: '#34d399' }}
                    onClick={() => makeDriven(selJoint)}
                  >设为驱动</button>
                </div>
                <button
                  style={{ padding: '5px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                    background: 'rgba(251,146,60,0.10)', border: '0.5px solid rgba(251,146,60,0.30)',
                    color: '#fb923c' }}
                  onClick={() => {
                    jointsRef.current.forEach(j => { if (j) j._isOutput = false })
                    const j = jointsRef.current.find(j => j && j.id === selJoint.id)
                    if (j) { j._isOutput = true; dispatch({ type: 'SYNC_JOINTS', payload: [...jointsRef.current] }) }
                  }}
                >标记为输出点 E</button>
              </div>
            ) : selLink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: textPri }}>连杆 <span style={{ color: textSec }}>{selLink.id}</span></div>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: textSec }}>
                  长度
                  <input
                    type="number"
                    defaultValue={selLink.length?.toFixed(2)}
                    step="5"
                    style={{
                      width: 72, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                      borderRadius: 6, padding: '3px 6px', color: textPri, fontSize: 11,
                    }}
                    onChange={e => {
                      const l = linksRef.current.find(l => l && l.id === selLink.id)
                      if (l) {
                        const v = Math.max(1, parseFloat(e.target.value) || 1)
                        l.length = v
                        dispatch({ type: 'UPDATE_LINK', id: l.id, patch: { length: v } })
                      }
                    }}
                  />
                </label>
                <div style={{ fontSize: 11, color: textSec }}>{selLink.aId} → {selLink.bId}</div>
              </div>
            ) : (
              <div style={{ color: textSec, fontSize: 12 }}>未选中任何对象</div>
            )}
          </div>

          {/* 图例说明 */}
          <div style={{ ...glass, fontSize: 11, lineHeight: 1.8, color: textSec, marginTop: 'auto' }}>
            <div style={{ color: textPri, fontWeight: 500, marginBottom: 6 }}>操作说明</div>
            <div>S — 选择/拖拽节点</div>
            <div>A — 添加节点</div>
            <div>L — 连接已选两节点</div>
            <div>F — 切换固定状态</div>
            <div>Del — 删除选中对象</div>
            <div>Space — 运行/暂停</div>
            <div>滚轮 — 缩放</div>
            <div>右键拖拽 — 平移</div>
            <div style={{ marginTop: 8, padding: '6px 8px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
              <div style={{ color: textPri, fontWeight: 500, marginBottom: 4 }}>DOF 公式</div>
              F = 3(n−1) − 2P<br />
              F=1 → 机构可正常运动
            </div>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div style={{
        margin: '16px 24px 0', ...glass,
        fontSize: 12, lineHeight: 1.75, color: textSec,
      }}>
        <strong style={{ color: textPri }}>机构说明：</strong>
        自由节点（蓝色）可被连杆约束；固定节点（橙色）作为地面铰链；驱动节点（绿色）绕固定点做圆周运动；
        输出节点（橙 E）的轨迹将显示于位移曲线图中。
        当 DOF ≠ 1 时机构无法正常运动，请调整节点和连杆数量直至 F = 1。
      </div>
    </div>
  )
}