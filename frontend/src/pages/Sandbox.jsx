/**
 * Sandbox.jsx — 曲柄连杆机构仿真
 * 修复内容：
 *   1. 全屏布局 + 图表可见性（overflow-y, min-height, null 填充）
 *   2. 黑夜模式深度同步（从 zustand store 读取，不再依赖 prefers-color-scheme）
 *   3. 锁定时刻 + 图表点击跳转
 *   4. 死点红色警告覆盖层
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import useUserStore from '../store/userStore'

// ─── 几何工具 ──────────────────────────────────────────────────

const vadd   = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
const vsub   = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const vscale = (v, s) => ({ x: v.x * s, y: v.y * s })
const vlen   = v => Math.sqrt(v.x * v.x + v.y * v.y)
const vnorm  = v => { const l = vlen(v); return l < 1e-10 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l } }
const dist   = (a, b) => vlen(vsub(b, a))

const getIntersection = (P1, r1, P2, r2, flip = false) => {
  const d = dist(P1, P2)
  if (d > r1 + r2 + 1e-9) return null
  if (d < Math.abs(r1 - r2) - 1e-9) return null
  if (d < 1e-10) return null
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const h = h2 < 0 ? 0 : Math.sqrt(h2)
  const n = vnorm(vsub(P2, P1))
  const M = vadd(P1, vscale(n, a))
  const perp = { x: -n.y, y: n.x }
  return flip ? vsub(M, vscale(perp, h)) : vadd(M, vscale(perp, h))
}

const solveMechanism = (thetaDeg, la, lb, lc, ld, le) => {
  const theta = (thetaDeg * Math.PI) / 180
  const O = { x: 0, y: 0 }
  const D = { x: ld, y: 0 }
  const A = { x: la * Math.cos(theta), y: la * Math.sin(theta) }
  const B = getIntersection(A, lb, D, lc, false)
  if (!B) return null
  const DB = vsub(B, D)
  const lenDB = vlen(DB)
  const C = lenDB < 1e-10 ? B : vadd(D, vscale(vnorm(DB), lc))
  const DC = vsub(C, D)
  const lenDC = vlen(DC)
  const E = lenDC < 1e-10 ? C : vadd(C, vscale(vnorm(DC), le))
  return { O, A, B, C, D, E }
}

// 位移曲线：死点处填 null 而不是跳过，保持 x 轴连续
const computeDisplacementCurve = (la, lb, lc, ld, le) => {
  const pts = []
  for (let deg = 0; deg < 360; deg += 2) {
    const result = solveMechanism(deg, la, lb, lc, ld, le)
    pts.push({
      angle: deg,
      displacement: result ? parseFloat(result.E.x.toFixed(3)) : null
    })
  }
  return pts
}

// ─── Canvas 渲染 ───────────────────────────────────────────────

const toCanvas = (pt, cx, cy, scale) => ({ x: cx + pt.x * scale, y: cy - pt.y * scale })

const drawNeonLine = (ctx, p1, p2, color, width = 2) => {
  const rgba = (alpha) => color.replace('rgb(', `rgba(`).replace(')', `, ${alpha})`)
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = rgba(0.15); ctx.lineWidth = width * 5; ctx.lineCap = 'round'; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = rgba(0.4); ctx.lineWidth = width * 2.5; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y)
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke()
}

const drawJoint = (ctx, pt, radius, color) => {
  const rgba = (alpha) => color.replace('rgb(', `rgba(`).replace(')', `, ${alpha})`)
  ctx.beginPath(); ctx.arc(pt.x, pt.y, radius * 3, 0, Math.PI * 2)
  const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius * 3)
  grd.addColorStop(0, rgba(0.5)); grd.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grd; ctx.fill()
  ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  ctx.beginPath(); ctx.arc(pt.x - radius * 0.3, pt.y - radius * 0.3, radius * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill()
}

const drawMechanism = (canvas, pts, isDark, trailPoints) => {
  if (!canvas || !pts) return
  const { O, A, B, C, D, E } = pts
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = isDark ? '#0a0d18' : '#f8faff'
  ctx.fillRect(0, 0, W, H)
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5
  for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  const cx = W * 0.35, cy = H * 0.52
  const scale = Math.min(W, H) / 6.5
  const toC = p => toCanvas(p, cx, cy, scale)
  const pO = toC(O), pA = toC(A), pB = toC(B), pC = toC(C), pD = toC(D), pE = toC(E)
  const clrCrank  = isDark ? 'rgb(167,139,250)' : 'rgb(124,58,237)'
  const clrLink   = isDark ? 'rgb(34,211,238)'  : 'rgb(6,148,162)'
  const clrRocker = isDark ? 'rgb(52,211,153)'  : 'rgb(5,150,105)'
  const clrOutput = isDark ? 'rgb(251,146,60)'  : 'rgb(234,88,12)'
  const clrGround = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)'
  if (trailPoints && trailPoints.length > 1) {
    for (let i = 1; i < trailPoints.length; i++) {
      const t1 = toC(trailPoints[i - 1]), t2 = toC(trailPoints[i])
      const alpha = i / trailPoints.length
      ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y)
      ctx.strokeStyle = isDark ? `rgba(251,146,60,${alpha * 0.5})` : `rgba(234,88,12,${alpha * 0.4})`
      ctx.lineWidth = 1.5 * alpha; ctx.lineCap = 'round'; ctx.stroke()
    }
  }
  const drawGround = p => {
    ctx.strokeStyle = clrGround; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y + 10); ctx.lineTo(p.x + 12, p.y + 10); ctx.stroke()
    for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(p.x + i, p.y + 10); ctx.lineTo(p.x + i - 4, p.y + 16); ctx.stroke() }
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 10); ctx.stroke()
  }
  drawGround(pO); drawGround(pD)
  ctx.setLineDash([6, 4]); drawNeonLine(ctx, pO, pD, clrGround, 1); ctx.setLineDash([])
  drawNeonLine(ctx, pO, pA, clrCrank, 3)
  drawNeonLine(ctx, pA, pB, clrLink, 2.5)
  drawNeonLine(ctx, pD, pC, clrRocker, 2.5)
  drawNeonLine(ctx, pC, pE, clrOutput, 2)
  const jR = 5
  drawJoint(ctx, pO, jR + 1, isDark ? 'rgb(226,232,240)' : 'rgb(30,41,59)')
  drawJoint(ctx, pD, jR + 1, isDark ? 'rgb(226,232,240)' : 'rgb(30,41,59)')
  drawJoint(ctx, pA, jR, clrCrank)
  drawJoint(ctx, pB, jR, clrLink)
  drawJoint(ctx, pC, jR, clrRocker)
  drawJoint(ctx, pE, jR + 2, clrOutput)
  ctx.fillStyle = isDark ? 'rgba(226,232,240,0.85)' : 'rgba(30,41,59,0.85)'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillText('O', pO.x - 16, pO.y - 8); ctx.fillText('A', pA.x + 8, pA.y - 8)
  ctx.fillText('B', pB.x + 8, pB.y - 8); ctx.fillText('C', pC.x + 8, pC.y - 8)
  ctx.fillText('D', pD.x + 8, pD.y - 8)
  ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = clrOutput
  ctx.fillText('E', pE.x + 10, pE.y - 8)
  const arcR = scale * 0.3
  ctx.beginPath(); ctx.arc(pO.x, pO.y, arcR, 0, -Math.atan2(pA.y - pO.y, pA.x - pO.x), true)
  ctx.strokeStyle = isDark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.3)'
  ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([])
}

// ─── 滑块行 ───────────────────────────────────────────────────

const SliderRow = ({ label, value, min, max, step, onChange, color, isDark }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: isDark ? 'rgba(226,232,240,0.8)' : 'rgba(30,41,59,0.8)' }}>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
      </span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: color }} />
  </div>
)

// ─── 死点覆盖层 ────────────────────────────────────────────────

const SingularityOverlay = ({ visible }) => {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(220,38,38,0.18)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 14,
      zIndex: 10,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(239,68,68,0.6)',
        borderRadius: 12,
        padding: '14px 24px',
        textAlign: 'center',
        color: '#fca5a5',
        fontWeight: 500,
        fontSize: 14,
        lineHeight: 1.6,
        maxWidth: 340,
      }}>
        <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️</div>
        机构死点<br />
        <span style={{ fontSize: 12, color: 'rgba(252,165,165,0.75)', fontWeight: 400 }}>
          当前参数组合无法构成封闭矢量环
        </span>
      </div>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────

const TRAIL_MAX = 80

export default function Sandbox() {
  // FIX 2: 从 zustand 读取主题，不再依赖 prefers-color-scheme
  const themeMode = useUserStore(s => s.theme)
  const isDark = themeMode === 'dark'

  const [la, setLa] = useState(1.0)
  const [lb, setLb] = useState(2.5)
  const [lc, setLc] = useState(2.0)
  const [ld, setLd] = useState(3.0)
  const [le, setLe] = useState(1.0)

  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed]         = useState(1.0)
  const [theta, setTheta]         = useState(0)
  // FIX 3: 锁定时刻开关
  const [locked, setLocked]       = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const canvasRef   = useRef(null)
  const containerRef = useRef(null)
  const rafRef      = useRef(null)
  const lastTimeRef = useRef(null)
  const thetaRef    = useRef(0)
  const trailRef    = useRef([])
  const playingRef  = useRef(true)
  const lockedRef   = useRef(false)
  const speedRef    = useRef(1.0)

  useEffect(() => { playingRef.current = isPlaying && !locked }, [isPlaying, locked])
  useEffect(() => { lockedRef.current = locked }, [locked])
  useEffect(() => { speedRef.current = speed }, [speed])

  // FIX 1: 位移曲线，useMemo，死点处返回 null 而非跳过
  const curvData = useMemo(
    () => computeDisplacementCurve(la, lb, lc, ld, le),
    [la, lb, lc, ld, le]
  )

  const pts = useMemo(
    () => solveMechanism(theta, la, lb, lc, ld, le),
    [theta, la, lb, lc, ld, le]
  )

  // 动画循环
  useEffect(() => {
    const animate = ts => {
      if (lastTimeRef.current === null) lastTimeRef.current = ts
      const dt = (ts - lastTimeRef.current) / 1000
      lastTimeRef.current = ts
      if (playingRef.current) {
        thetaRef.current = (thetaRef.current + dt * speedRef.current * 90) % 360
        setTheta(Math.round(thetaRef.current * 10) / 10)
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafRef.current); lastTimeRef.current = null }
  }, [])

  // 轨迹更新
  useEffect(() => {
    if (!pts) return
    trailRef.current = [...trailRef.current, { x: pts.E.x, y: pts.E.y }]
    if (trailRef.current.length > TRAIL_MAX) trailRef.current = trailRef.current.slice(-TRAIL_MAX)
  }, [pts])

  useEffect(() => { trailRef.current = [] }, [la, lb, lc, ld, le])

  // Canvas 绘制（依赖 pts 和 isDark）
  useEffect(() => {
    drawMechanism(canvasRef.current, pts, isDark, trailRef.current)
  }, [pts, isDark])

  // FIX 4: 全屏状态监听，切换后强制重绘
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const fn = () => {
      const isFull = !!document.fullscreenElement
      setIsFullscreen(isFull)
      // 重绘以适配新尺寸
      setTimeout(() => drawMechanism(canvasRef.current, pts, isDark, trailRef.current), 50)
    }
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [pts, isDark])

  // FIX 3: 图表点击 → 跳转角度
  const handleChartClick = useCallback(data => {
    if (!data || !data.activePayload) return
    const angle = data.activeLabel
    if (angle === undefined) return
    thetaRef.current = angle
    setTheta(angle)
  }, [])

  // FIX 3: 锁定时自动暂停
  const handleLockToggle = useCallback(() => {
    setLocked(prev => {
      if (!prev) setIsPlaying(false)
      return !prev
    })
  }, [])

  // 颜色
  const clrCrank  = isDark ? '#a78bfa' : '#7c3aed'
  const clrLink   = isDark ? '#22d3ee' : '#0694a2'
  const clrRocker = isDark ? '#34d399' : '#059669'
  const clrOutput = isDark ? '#fb923c' : '#ea580c'
  const textPrimary   = isDark ? '#e2e8f0' : '#1e293b'
  const textSecondary = isDark ? 'rgba(226,232,240,0.6)' : 'rgba(30,41,59,0.6)'
  const panelBg  = isDark ? 'rgba(15,20,35,0.82)' : 'rgba(255,255,255,0.82)'
  const panelBdr = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.18)'

  const glassPanel = {
    background: panelBg,
    border: `0.5px solid ${panelBdr}`,
    borderRadius: 14,
    padding: '16px 18px',
  }

  const currentEx = pts ? parseFloat(pts.E.x.toFixed(3)) : null

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        // FIX 1: 全屏下允许滚动
        overflowY: 'auto',
        background: isDark
          ? 'linear-gradient(135deg,#080b14 0%,#0d1120 50%,#080b14 100%)'
          : 'linear-gradient(135deg,#f1f5f9 0%,#e8edf5 100%)',
        padding: '0 0 32px',
        fontFamily: 'system-ui, sans-serif',
        color: textPrimary,
        transition: 'background 0.3s',
      }}
    >
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 4px', background: isDark ? 'linear-gradient(90deg,#a78bfa,#22d3ee)' : 'linear-gradient(90deg,#7c3aed,#0694a2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            实战工坊 — 曲柄连杆机构仿真
          </h1>
          <p style={{ fontSize: 13, color: textSecondary, margin: 0 }}>
            调节连杆参数，实时观察机构运动规律与 E 点位移轨迹
          </p>
        </div>
        <button onClick={toggleFullscreen} style={{ background: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)', border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)'}`, color: isDark ? '#a78bfa' : '#7c3aed', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
          {isFullscreen ? '⊡ 退出全屏' : '⊞ 全屏'}
        </button>
      </div>

      {/* 主体 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 16, padding: '0 24px' }}>

        {/* 左：Canvas + 图表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Canvas 区 */}
          <div style={{ ...glassPanel, padding: 0, overflow: 'hidden', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={420}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />

            {/* FIX 4: 死点覆盖层 */}
            <SingularityOverlay visible={!pts} />

            {/* 状态角标 */}
            <div style={{ position: 'absolute', top: 12, left: 12, background: isDark ? 'rgba(10,13,24,0.75)' : 'rgba(255,255,255,0.8)', border: `0.5px solid ${isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: textSecondary, backdropFilter: 'blur(8px)', zIndex: 5 }}>
              θ =&nbsp;<span style={{ color: clrCrank, fontWeight: 600, fontFamily: 'monospace' }}>{theta.toFixed(1)}°</span>
              &nbsp;&nbsp;
              {pts
                ? <>E.x =&nbsp;<span style={{ color: clrOutput, fontWeight: 600, fontFamily: 'monospace' }}>{pts.E.x.toFixed(3)}</span></>
                : <span style={{ color: '#f87171' }}>死点（无解）</span>
              }
              {locked && <span style={{ marginLeft: 10, color: '#fb923c', fontSize: 11 }}>🔒 已锁定</span>}
            </div>

            {/* 图例 */}
            <div style={{ position: 'absolute', bottom: 10, left: 12, display: 'flex', gap: 12, background: isDark ? 'rgba(10,13,24,0.7)' : 'rgba(255,255,255,0.75)', border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 7, padding: '5px 10px', fontSize: 11, backdropFilter: 'blur(8px)' }}>
              {[[clrCrank, '曲柄 a'], [clrLink, '连杆 b'], [clrRocker, '摇杆 c'], [clrOutput, '输出 E']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: textSecondary }}>
                  <span style={{ width: 16, height: 3, borderRadius: 2, background: c, display: 'inline-block' }} />
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* FIX 1+3: 位移曲线图，min-height + 点击跳转 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: textSecondary, marginBottom: 6 }}>
              E 点水平位移 x 随曲柄角度 θ 的变化曲线
              {locked && <span style={{ marginLeft: 10, color: '#fb923c', fontSize: 11 }}>点击图表跳转角度</span>}
            </div>
            {/* FIX 1: 明确 min-height，防止全屏后图表消失 */}
            <div style={{ minHeight: 200 }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={curvData}
                  margin={{ top: 4, right: 20, bottom: 4, left: -10 }}
                  onClick={locked ? handleChartClick : undefined}
                  style={{ cursor: locked ? 'crosshair' : 'default' }}
                >
                  <CartesianGrid strokeDasharray="4 4" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="angle" tick={{ fontSize: 10, fill: textSecondary }} tickLine={false} axisLine={false} tickFormatter={v => `${v}°`} />
                  <YAxis tick={{ fontSize: 10, fill: textSecondary }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ background: isDark ? 'rgba(15,20,35,0.92)' : 'rgba(255,255,255,0.92)', border: `0.5px solid ${isDark ? 'rgba(251,146,60,0.4)' : 'rgba(234,88,12,0.3)'}`, borderRadius: 8, fontSize: 11, color: textPrimary }}
                    formatter={v => v !== null ? [v.toFixed(3), 'E.x'] : ['—', '死点']}
                    labelFormatter={l => `θ = ${l}°`}
                  />
                  {currentEx !== null && (
                    <ReferenceLine x={Math.round(theta / 2) * 2} stroke={clrCrank} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.7} />
                  )}
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
            </div>
          </div>
        </div>

        {/* 右：控制面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 播放控制 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              动画控制
            </div>

            <button
              onClick={() => { if (!locked) setIsPlaying(p => !p) }}
              disabled={locked}
              style={{ width: '100%', padding: '9px 0', background: isPlaying && !locked ? (isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.10)') : (isDark ? 'rgba(34,211,238,0.15)' : 'rgba(6,148,162,0.10)'), border: `0.5px solid ${isPlaying && !locked ? (isDark ? 'rgba(167,139,250,0.45)' : 'rgba(124,58,237,0.35)') : (isDark ? 'rgba(34,211,238,0.45)' : 'rgba(6,148,162,0.35)')}`, color: isPlaying && !locked ? clrCrank : clrLink, borderRadius: 9, cursor: locked ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: locked ? 0.5 : 1, transition: 'all 0.15s' }}
            >
              {isPlaying && !locked ? '⏸ 暂停' : '▶ 播放'}
            </button>

            {/* FIX 3: 锁定时刻开关 */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 9, background: locked ? (isDark ? 'rgba(251,146,60,0.1)' : 'rgba(234,88,12,0.07)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'), border: `0.5px solid ${locked ? (isDark ? 'rgba(251,146,60,0.4)' : 'rgba(234,88,12,0.3)') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}` }}>
              <span style={{ fontSize: 12, color: locked ? clrOutput : textSecondary, fontWeight: locked ? 500 : 400 }}>
                🔒 锁定时刻
              </span>
              <button
                onClick={handleLockToggle}
                style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: locked ? clrOutput : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'), position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 2, left: locked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
            {locked && (
              <p style={{ fontSize: 11, color: textSecondary, margin: '6px 0 0', lineHeight: 1.5 }}>
                点击图表上任意点可跳转到对应角度
              </p>
            )}

            <div style={{ marginTop: 14 }}>
              <SliderRow label="转速倍数" value={speed} min={0.1} max={4} step={0.1} onChange={setSpeed} color={clrLink} isDark={isDark} />
            </div>

            {(!isPlaying || locked) && (
              <div style={{ marginTop: 4 }}>
                <SliderRow label="手动调节角度 θ" value={theta} min={0} max={359} step={1} onChange={v => { thetaRef.current = v; setTheta(v) }} color={clrCrank} isDark={isDark} />
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

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 6 }}>快速预设</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { name: '标准',   v: [1.0, 2.5, 2.0, 3.0, 1.0] },
                  { name: '大行程', v: [1.5, 3.0, 2.5, 3.5, 1.5] },
                  { name: '短曲柄', v: [0.5, 2.0, 1.8, 2.8, 0.8] },
                ].map(({ name, v }) => (
                  <button key={name} onClick={() => { setLa(v[0]); setLb(v[1]); setLc(v[2]); setLd(v[3]); setLe(v[4]) }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`, color: textSecondary }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 关节坐标 */}
          <div style={{ ...glassPanel }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              关节坐标
            </div>
            {pts
              ? [['O', pts.O, isDark ? '#e2e8f0' : '#475569'], ['A', pts.A, clrCrank], ['B', pts.B, clrLink], ['C', pts.C, clrRocker], ['D', pts.D, isDark ? '#e2e8f0' : '#475569'], ['E', pts.E, clrOutput]].map(([name, pt, color]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5, color: textSecondary }}>
                  <span style={{ color, fontWeight: 600 }}>{name}</span>
                  <span style={{ fontFamily: 'monospace' }}>({pt.x.toFixed(2)}, {pt.y.toFixed(2)})</span>
                </div>
              ))
              : <div style={{ fontSize: 12, color: '#f87171' }}>当前角度为机构死点，无解</div>
            }
          </div>
        </div>
      </div>

      {/* 说明 */}
      <div style={{ margin: '16px 24px 0', ...glassPanel, fontSize: 12, lineHeight: 1.7, color: textSecondary }}>
        <strong style={{ color: textPrimary }}>机构说明：</strong>
        曲柄 OA（紫色）以匀角速度旋转，通过连杆 AB（青色）驱动以 D 为支点的摇杆 DC（绿色），
        输出杆 CE（橙色）随之摆动。E 点的水平位移曲线反映了该四连杆机构的运动特性。
        调节各连杆比例可改变行程、死点位置和运动规律。
        图表中断点（灰色空缺）表示该角度下机构进入死点。
      </div>
    </div>
  )
}