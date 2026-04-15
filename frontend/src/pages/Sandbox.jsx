/**
 * Sandbox.jsx — 实战工坊：曲柄连杆机构仿真
 *
 * 几何说明（五连杆 / Crank-Slider Mechanism）:
 *
 *   O (原点/固定枢轴)
 *   └─ a ──→ A  (曲柄，以角度 θ 旋转)
 *              └─ b ──→ B  (连杆 AB)
 *   D (固定枢轴，位于 (d, 0))
 *   └─ c ──→ C  (摇杆/摆杆，C 是圆弧上的点)
 *              └─ e ──→ E  (从 C 延长或偏移，称为输出点)
 *   B 同时落在以 A 为圆心半径 b、以 D 为圆心半径 c 的两圆交点上。
 *
 * JS 移植自 Python 原型 solve_mechanism / get_intersection：
 *   1. 计算 A = O + a·(cosθ, sinθ)
 *   2. 求圆(A,b) 与 圆(D,c) 的交点 → B
 *   3. 求圆(D,c) 上对应 B 的点 C（实际上 B=C 在本四连杆变体中，
 *      或 C 是从 D 到 B 方向上距离 c 处，E 则再延长 e）
 *   4. E = D + (c+e)/c · (B - D)
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// ─── 几何工具函数 ──────────────────────────────────────────────────────────────

/** 向量加法 */
const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
/** 向量减法 */
const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
/** 向量缩放 */
const vscale = (v, s) => ({ x: v.x * s, y: v.y * s })
/** 向量模长 */
const vlen = (v) => Math.sqrt(v.x * v.x + v.y * v.y)
/** 向量归一化 */
const vnorm = (v) => { const l = vlen(v); return l < 1e-10 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l } }
/** 两点距离 */
const dist = (a, b) => vlen(vsub(b, a))

/**
 * get_intersection: 求两圆的交点（对应 Python 版本）
 *
 * 圆1: 圆心 P1，半径 r1
 * 圆2: 圆心 P2，半径 r2
 * flip: false = 取"上方"交点，true = 取"下方"交点
 *
 * 解法：
 *   d = |P2 - P1|
 *   a = (r1² - r2² + d²) / (2d)  ← 从 P1 沿 P1→P2 方向的距离
 *   h = sqrt(r1² - a²)            ← 垂直偏移
 *   中点 M = P1 + a·n              ← n 为单位向量
 *   垂直方向 perp = (-n.y, n.x)
 *   交点 = M ± h·perp
 */
const getIntersection = (P1, r1, P2, r2, flip = false) => {
  const d = dist(P1, P2)
  // 无解或无穷多解时返回 null
  if (d > r1 + r2 + 1e-9) return null      // 两圆相离
  if (d < Math.abs(r1 - r2) - 1e-9) return null  // 内含
  if (d < 1e-10) return null                // 同心

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const h = h2 < 0 ? 0 : Math.sqrt(h2)

  const n = vnorm(vsub(P2, P1))           // P1→P2 单位向量
  const M = vadd(P1, vscale(n, a))        // 垂足中点

  // 垂直方向（逆时针旋转 90°）
  const perp = { x: -n.y, y: n.x }

  return flip
    ? vsub(M, vscale(perp, h))
    : vadd(M, vscale(perp, h))
}

/**
 * solve_mechanism: 根据曲柄角度 θ（弧度）和各杆长度计算所有关节坐标
 *
 * 机构定义：
 *   O = (0, 0)        固定枢轴（曲柄根部）
 *   A = O + a·(cosθ, sinθ)   曲柄末端
 *   D = (ld, 0)       第二固定枢轴
 *   B = getIntersection(A, lb, D, lc)  连杆与摇杆的交汇点
 *   C = D + lc/|B-D|·(B-D)            摇杆末端（即 B 方向上距 D 为 lc 处）
 *   E = C + le/lc·(C-D)               延长摇杆至 E（输出滑块位置）
 *
 * 返回 { O, A, B, C, D, E } 或 null（机构死点/无解）
 */
const solveMechanism = (thetaDeg, la, lb, lc, ld, le) => {
  const theta = (thetaDeg * Math.PI) / 180

  const O = { x: 0, y: 0 }
  const D = { x: ld, y: 0 }

  // A: 曲柄末端
  const A = { x: la * Math.cos(theta), y: la * Math.sin(theta) }

  // B: 连杆(半径 lb)以 A 为圆心 与 摇杆(半径 lc)以 D 为圆心 的交点
  const B = getIntersection(A, lb, D, lc, false)
  if (!B) return null // 机构死点，无解

  // C: D 到 B 方向，距 D 为 lc（即 B 本身在此四连杆中，但保留明确计算）
  const DB = vsub(B, D)
  const lenDB = vlen(DB)
  const C = lenDB < 1e-10 ? B : vadd(D, vscale(vnorm(DB), lc))

  // E: 从 C 沿 D→C 方向再延伸 le
  const DC = vsub(C, D)
  const lenDC = vlen(DC)
  const E = lenDC < 1e-10 ? C : vadd(C, vscale(vnorm(DC), le))

  return { O, A, B, C, D, E }
}

/**
 * 预计算一整圈（0°~359°）E 点的 x 坐标，用于位移曲线图
 */
const computeDisplacementCurve = (la, lb, lc, ld, le) => {
  const pts = []
  for (let deg = 0; deg < 360; deg += 2) {
    const result = solveMechanism(deg, la, lb, lc, ld, le)
    if (result) {
      pts.push({ angle: deg, displacement: parseFloat(result.E.x.toFixed(3)) })
    }
  }
  return pts
}

// ─── Canvas 渲染函数 ──────────────────────────────────────────────────────────

/**
 * 将机构坐标系映射到 Canvas 像素坐标
 * origin: 画布中心偏移，scale: 每单位长度对应像素数
 */
const toCanvas = (pt, cx, cy, scale) => ({
  x: cx + pt.x * scale,
  y: cy - pt.y * scale   // y 轴翻转（Canvas y 向下）
})

/**
 * 绘制霓虹发光线条（Neon Glow）
 * 通过多次叠加不同宽度/透明度的描边模拟发光效果
 */
const drawNeonLine = (ctx, p1, p2, color, width = 2) => {
  // 外层光晕（宽，低透明）
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace(')', ', 0.15)').replace('rgb(', 'rgba(').replace('hsl(', 'hsla(')
  ctx.lineWidth = width * 5
  ctx.lineCap = 'round'
  ctx.stroke()

  // 中层光晕
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color.replace(')', ', 0.4)').replace('rgb(', 'rgba(').replace('hsl(', 'hsla(')
  ctx.lineWidth = width * 2.5
  ctx.stroke()

  // 核心线（最亮）
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/**
 * 绘制发光关节圆点
 */
const drawJoint = (ctx, pt, radius, color, isDark) => {
  // 外圈光晕
  ctx.beginPath()
  ctx.arc(pt.x, pt.y, radius * 3, 0, Math.PI * 2)
  const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius * 3)
  grd.addColorStop(0, color.replace(')', ', 0.5)').replace('rgb(', 'rgba(').replace('hsl(', 'hsla('))
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grd
  ctx.fill()

  // 圆点实体
  ctx.beginPath()
  ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // 高光
  ctx.beginPath()
  ctx.arc(pt.x - radius * 0.3, pt.y - radius * 0.3, radius * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.8)'
  ctx.fill()
}

/**
 * 在 Canvas 上绘制整个机构
 */
const drawMechanism = (canvas, pts, isDark, trailPoints) => {
  if (!canvas || !pts) return
  const { O, A, B, C, D, E } = pts
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  ctx.clearRect(0, 0, W, H)

  // 背景
  ctx.fillStyle = isDark ? '#0a0d18' : '#f8faff'
  ctx.fillRect(0, 0, W, H)

  // 网格
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 0.5
  for (let x = 0; x < W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y < H; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // 坐标原点和比例尺（自动适配各连杆长度）
  const cx = W * 0.35
  const cy = H * 0.52
  const scale = Math.min(W, H) / 6.5

  // 将所有点转换到画布坐标
  const toC = (p) => toCanvas(p, cx, cy, scale)
  const pO = toC(O)
  const pA = toC(A)
  const pB = toC(B)
  const pC = toC(C)
  const pD = toC(D)
  const pE = toC(E)

  // 颜色方案（霓虹风格）
  const clrCrank  = isDark ? 'rgb(167,139,250)'  : 'rgb(124,58,237)'   // 紫色曲柄
  const clrLink   = isDark ? 'rgb(34,211,238)'   : 'rgb(6,148,162)'    // 青色连杆
  const clrRocker = isDark ? 'rgb(52,211,153)'   : 'rgb(5,150,105)'    // 绿色摇杆
  const clrOutput = isDark ? 'rgb(251,146,60)'   : 'rgb(234,88,12)'    // 橙色输出杆
  const clrGround = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)' // 地面连线

  // E 点运动轨迹（残影）
  if (trailPoints && trailPoints.length > 1) {
    for (let i = 1; i < trailPoints.length; i++) {
      const t1 = toC(trailPoints[i - 1])
      const t2 = toC(trailPoints[i])
      const alpha = i / trailPoints.length
      ctx.beginPath()
      ctx.moveTo(t1.x, t1.y)
      ctx.lineTo(t2.x, t2.y)
      ctx.strokeStyle = isDark
        ? `rgba(251,146,60,${alpha * 0.5})`
        : `rgba(234,88,12,${alpha * 0.4})`
      ctx.lineWidth = 1.5 * alpha
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  }

  // 地面固定符号（O 点和 D 点）
  const drawGround = (p) => {
    ctx.strokeStyle = clrGround
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y + 10); ctx.lineTo(p.x + 12, p.y + 10); ctx.stroke()
    for (let i = -10; i <= 10; i += 5) {
      ctx.beginPath(); ctx.moveTo(p.x + i, p.y + 10); ctx.lineTo(p.x + i - 4, p.y + 16); ctx.stroke()
    }
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 10); ctx.stroke()
  }
  drawGround(pO)
  drawGround(pD)

  // 地面连线（O→D）
  ctx.setLineDash([6, 4])
  drawNeonLine(ctx, pO, pD, clrGround, 1)
  ctx.setLineDash([])

  // 各连杆
  drawNeonLine(ctx, pO, pA, clrCrank,  3)   // 曲柄 OA
  drawNeonLine(ctx, pA, pB, clrLink,   2.5) // 连杆 AB
  drawNeonLine(ctx, pD, pC, clrRocker, 2.5) // 摇杆 DC
  drawNeonLine(ctx, pC, pE, clrOutput, 2)   // 输出杆 CE

  // 关节圆点（由大到小绘制，避免遮挡）
  const jR = 5
  drawJoint(ctx, pO, jR + 1, isDark ? '#e2e8f0' : '#1e293b', isDark)  // O 固定
  drawJoint(ctx, pD, jR + 1, isDark ? '#e2e8f0' : '#1e293b', isDark)  // D 固定
  drawJoint(ctx, pA, jR,     clrCrank,  isDark)
  drawJoint(ctx, pB, jR,     clrLink,   isDark)
  drawJoint(ctx, pC, jR,     clrRocker, isDark)
  drawJoint(ctx, pE, jR + 2, clrOutput, isDark)  // 输出点最大

  // 标签
  const labelStyle = isDark ? 'rgba(226,232,240,0.85)' : 'rgba(30,41,59,0.85)'
  ctx.fillStyle = labelStyle
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillText('O', pO.x - 16, pO.y - 8)
  ctx.fillText('A', pA.x + 8,  pA.y - 8)
  ctx.fillText('B', pB.x + 8,  pB.y - 8)
  ctx.fillText('C', pC.x + 8,  pC.y - 8)
  ctx.fillText('D', pD.x + 8,  pD.y - 8)
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillStyle = clrOutput
  ctx.fillText('E', pE.x + 10, pE.y - 8)

  // 角度圆弧（显示当前曲柄角度）
  const arcR = scale * 0.3
  ctx.beginPath()
  ctx.arc(pO.x, pO.y, arcR, 0, -Math.atan2(pA.y - pO.y, pA.x - pO.x), true)
  ctx.strokeStyle = isDark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.3)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])
}

// ─── 控制面板滑块组件 ─────────────────────────────────────────────────────────

const SliderRow = ({ label, value, min, max, step, onChange, color, isDark }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontSize: 12, marginBottom: 4,
      color: isDark ? 'rgba(226,232,240,0.8)' : 'rgba(30,41,59,0.8)'
    }}>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontWeight: 600,
        color: color,
        background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
        padding: '1px 6px', borderRadius: 4
      }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: color }}
    />
  </div>
)

// ─── 主组件 ──────────────────────────────────────────────────────────────────

const TRAIL_MAX = 80  // 最多保留的轨迹点数量

export default function Sandbox() {
  // 检测深色模式
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e) => setIsDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  // 连杆参数
  const [la, setLa] = useState(1.0)   // 曲柄长度
  const [lb, setLb] = useState(2.5)   // 连杆 AB 长度
  const [lc, setLc] = useState(2.0)   // 摇杆 DC 长度
  const [ld, setLd] = useState(3.0)   // 地面距离 OD
  const [le, setLe] = useState(1.0)   // 输出延伸 CE

  // 动画状态
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed]         = useState(1.0)    // 倍速
  const [theta, setTheta]         = useState(0)      // 当前角度（度）
  const [isFullscreen, setIsFullscreen] = useState(false)

  const canvasRef     = useRef(null)
  const rafRef        = useRef(null)
  const lastTimeRef   = useRef(null)
  const thetaRef      = useRef(0)
  const trailRef      = useRef([])    // E 点残影
  const playingRef    = useRef(true)
  const speedRef      = useRef(1.0)

  // 同步 ref（避免闭包过期）
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { speedRef.current = speed }, [speed])

  // 当前机构解
  const pts = useMemo(
    () => solveMechanism(theta, la, lb, lc, ld, le),
    [theta, la, lb, lc, ld, le]
  )

  // 位移曲线数据（参数变化时重算）
  const curvData = useMemo(
    () => computeDisplacementCurve(la, lb, lc, ld, le),
    [la, lb, lc, ld, le]
  )

  // 动画循环
  useEffect(() => {
    const animate = (timestamp) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp
      const dt = (timestamp - lastTimeRef.current) / 1000  // 秒
      lastTimeRef.current = timestamp

      if (playingRef.current) {
        thetaRef.current = (thetaRef.current + dt * speedRef.current * 90) % 360
        setTheta(Math.round(thetaRef.current * 10) / 10)
      }

      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafRef.current); lastTimeRef.current = null }
  }, [])

  // 每帧更新轨迹
  useEffect(() => {
    if (!pts) return
    trailRef.current = [...trailRef.current, { x: pts.E.x, y: pts.E.y }]
    if (trailRef.current.length > TRAIL_MAX) {
      trailRef.current = trailRef.current.slice(-TRAIL_MAX)
    }
  }, [pts])

  // 重置轨迹（参数变化时）
  useEffect(() => { trailRef.current = [] }, [la, lb, lc, ld, le])

  // 绘制 Canvas
  useEffect(() => {
    drawMechanism(canvasRef.current, pts, isDark, trailRef.current)
  }, [pts, isDark])

  // 处理全屏
  const containerRef = useRef(null)
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // 颜色常量
  const clrCrank  = isDark ? '#a78bfa' : '#7c3aed'
  const clrLink   = isDark ? '#22d3ee' : '#0694a2'
  const clrRocker = isDark ? '#34d399' : '#059669'
  const clrOutput = isDark ? '#fb923c' : '#ea580c'

  // 玻璃面板样式
  const glassPanel = {
    background: isDark
      ? 'rgba(15,20,35,0.75)'
      : 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.18)'}`,
    borderRadius: 14,
    padding: '16px 18px',
  }

  const textPrimary   = isDark ? '#e2e8f0' : '#1e293b'
  const textSecondary = isDark ? 'rgba(226,232,240,0.6)' : 'rgba(30,41,59,0.6)'

  // 当前 E 点 x 位移（用于图表参考线）
  const currentEx = pts ? parseFloat(pts.E.x.toFixed(3)) : null

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        background: isDark
          ? 'linear-gradient(135deg,#080b14 0%,#0d1120 50%,#080b14 100%)'
          : 'linear-gradient(135deg,#f1f5f9 0%,#e8edf5 100%)',
        padding: isFullscreen ? 16 : '0 0 32px',
        transition: 'background 0.3s',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* 页头 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 12px',
      }}>
        <div>
          <h1 style={{
            fontSize: 20, fontWeight: 500, margin: '0 0 4px',
            background: isDark
              ? 'linear-gradient(90deg,#a78bfa,#22d3ee)'
              : 'linear-gradient(90deg,#7c3aed,#0694a2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            实战工坊 — 曲柄连杆机构仿真
          </h1>
          <p style={{ fontSize: 13, color: textSecondary, margin: 0 }}>
            调节连杆参数，实时观察机构运动规律与 E 点位移轨迹
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏模式'}
          style={{
            background: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
            border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)'}`,
            color: isDark ? '#a78bfa' : '#7c3aed',
            borderRadius: 8, padding: '7px 14px',
            fontSize: 12, cursor: 'pointer', fontWeight: 500,
          }}
        >
          {isFullscreen ? '⊡ 退出全屏' : '⊞ 全屏'}
        </button>
      </div>

      {/* 主体布局 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 260px',
        gap: 16, padding: '0 24px',
      }}>

        {/* 左侧：Canvas + 图表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Canvas 仿真区 */}
          <div style={{ ...glassPanel, padding: 0, overflow: 'hidden', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={420}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />

            {/* 浮动状态角标 */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: isDark ? 'rgba(10,13,24,0.75)' : 'rgba(255,255,255,0.8)',
              border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)'}`,
              borderRadius: 8, padding: '6px 12px',
              fontSize: 12, color: textSecondary,
              backdropFilter: 'blur(8px)',
            }}>
              θ =&nbsp;<span style={{ color: clrCrank, fontWeight: 600, fontFamily: 'monospace' }}>
                {theta.toFixed(1)}°
              </span>
              &nbsp;&nbsp;
              {pts
                ? <>E.x =&nbsp;<span style={{ color: clrOutput, fontWeight: 600, fontFamily: 'monospace' }}>{pts.E.x.toFixed(3)}</span></>
                : <span style={{ color: '#f87171' }}>死点（无解）</span>
              }
            </div>

            {/* 图例 */}
            <div style={{
              position: 'absolute', bottom: 10, left: 12,
              display: 'flex', gap: 12,
              background: isDark ? 'rgba(10,13,24,0.7)' : 'rgba(255,255,255,0.75)',
              border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 7, padding: '5px 10px',
              fontSize: 11, backdropFilter: 'blur(8px)',
            }}>
              {[
                { c: clrCrank, l: '曲柄 a' },
                { c: clrLink,  l: '连杆 b' },
                { c: clrRocker,l: '摇杆 c' },
                { c: clrOutput,l: '输出 E' },
              ].map(({ c, l }) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: textSecondary }}>
                  <span style={{
                    width: 16, height: 3, borderRadius: 2,
                    background: c, display: 'inline-block',
                    boxShadow: `0 0 4px ${c}`,
                  }}/>
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* 位移曲线图 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: textSecondary, marginBottom: 10 }}>
              E 点水平位移 x 随曲柄角度 θ 的变化曲线
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={curvData} margin={{ top: 4, right: 20, bottom: 4, left: -10 }}>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                />
                <XAxis
                  dataKey="angle"
                  tick={{ fontSize: 10, fill: textSecondary }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}°`}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: textSecondary }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    background: isDark ? 'rgba(15,20,35,0.92)' : 'rgba(255,255,255,0.92)',
                    border: `0.5px solid ${isDark ? 'rgba(251,146,60,0.4)' : 'rgba(234,88,12,0.3)'}`,
                    borderRadius: 8, fontSize: 11,
                    color: textPrimary,
                  }}
                  formatter={(v) => [v.toFixed(3), 'E.x']}
                  labelFormatter={(l) => `θ = ${l}°`}
                />
                {/* 当前角度参考线 */}
                {currentEx !== null && (
                  <ReferenceLine
                    x={Math.round(theta / 2) * 2}
                    stroke={clrCrank}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="displacement"
                  stroke={clrOutput}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: clrOutput }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 右侧：控制面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 播放控制 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              动画控制
            </div>

            <button
              onClick={() => setIsPlaying(p => !p)}
              style={{
                width: '100%', padding: '9px 0',
                background: isPlaying
                  ? (isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.10)')
                  : (isDark ? 'rgba(34,211,238,0.15)'  : 'rgba(6,148,162,0.10)'),
                border: `0.5px solid ${isPlaying
                  ? (isDark ? 'rgba(167,139,250,0.45)' : 'rgba(124,58,237,0.35)')
                  : (isDark ? 'rgba(34,211,238,0.45)'  : 'rgba(6,148,162,0.35)')}`,
                color: isPlaying ? clrCrank : clrLink,
                borderRadius: 9, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              {isPlaying ? '⏸ 暂停' : '▶ 播放'}
            </button>

            <div style={{ marginTop: 14 }}>
              <SliderRow
                label="转速倍数"
                value={speed}
                min={0.1} max={4} step={0.1}
                onChange={setSpeed}
                color={clrLink}
                isDark={isDark}
              />
            </div>

            {/* 手动拨角（暂停时用） */}
            {!isPlaying && (
              <div style={{ marginTop: 4 }}>
                <SliderRow
                  label="手动调节角度 θ"
                  value={theta}
                  min={0} max={359} step={1}
                  onChange={(v) => { thetaRef.current = v; setTheta(v) }}
                  color={clrCrank}
                  isDark={isDark}
                />
              </div>
            )}
          </div>

          {/* 连杆参数 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              连杆参数
            </div>

            <SliderRow label="Link a（曲柄）" value={la} min={0.3} max={2.0} step={0.1} onChange={setLa} color={clrCrank}  isDark={isDark} />
            <SliderRow label="Link b（连杆）"  value={lb} min={1.0} max={4.0} step={0.1} onChange={setLb} color={clrLink}   isDark={isDark} />
            <SliderRow label="Link c（摇杆）"  value={lc} min={0.8} max={3.5} step={0.1} onChange={setLc} color={clrRocker} isDark={isDark} />
            <SliderRow label="Link d（地面）"  value={ld} min={1.0} max={4.5} step={0.1} onChange={setLd} color={isDark ? '#e2e8f0' : '#475569'} isDark={isDark} />
            <SliderRow label="Link e（输出）"  value={le} min={0.1} max={2.5} step={0.1} onChange={setLe} color={clrOutput} isDark={isDark} />

            {/* 快速预设 */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 6 }}>快速预设</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { name: '标准',  v: [1.0, 2.5, 2.0, 3.0, 1.0] },
                  { name: '大行程', v: [1.5, 3.0, 2.5, 3.5, 1.5] },
                  { name: '短曲柄', v: [0.5, 2.0, 1.8, 2.8, 0.8] },
                ].map(({ name, v }) => (
                  <button
                    key={name}
                    onClick={() => { setLa(v[0]); setLb(v[1]); setLc(v[2]); setLd(v[3]); setLe(v[4]) }}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                      color: textSecondary,
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 当前坐标显示 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              关节坐标
            </div>
            {pts
              ? [['O', pts.O, isDark ? '#e2e8f0' : '#475569'],
                 ['A', pts.A, clrCrank],
                 ['B', pts.B, clrLink],
                 ['C', pts.C, clrRocker],
                 ['D', pts.D, isDark ? '#e2e8f0' : '#475569'],
                 ['E', pts.E, clrOutput]].map(([name, pt, color]) => (
                <div key={name} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, marginBottom: 5,
                  color: textSecondary,
                }}>
                  <span style={{ color, fontWeight: 600 }}>{name}</span>
                  <span style={{ fontFamily: 'monospace', color: textSecondary }}>
                    ({pt.x.toFixed(2)}, {pt.y.toFixed(2)})
                  </span>
                </div>
              ))
              : <div style={{ fontSize: 12, color: '#f87171' }}>当前角度为机构死点，无解</div>
            }
          </div>

        </div>
      </div>

      {/* 说明文字 */}
      <div style={{
        margin: '16px 24px 0',
        ...glassPanel,
        fontSize: 12, lineHeight: 1.7, color: textSecondary,
      }}>
        <strong style={{ color: textPrimary }}>机构说明：</strong>
        曲柄 OA（紫色）以匀角速度旋转，通过连杆 AB（青色）驱动以 D 为支点的摇杆 DC（绿色），
        输出杆 CE（橙色）随之摆动。E 点的水平位移曲线反映了该四连杆机构的运动特性。
        调节各连杆比例可改变行程、死点位置和运动规律。
      </div>
    </div>
  )
}