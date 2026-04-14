// frontend/src/pages/TeacherUpload.jsx
// Architecture:
//   <TeacherUpload>          page shell, theme wiring
//     <SubjectTabs>          horizontal filter tabs
//     <UploadCard>           drop zone + subject selector
//     <FileListCard>         stats + table
//       <FileRow>            single file row

import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react'
import useTeacherStore from '../store/teacherStore'
import useUserStore    from '../store/userStore'

// ── Subject catalogue ─────────────────────────────────────────────
export const SUBJECTS = [
  { id: 'all',         label: '全部'               },
  { id: 'c_language',  label: 'C 语言程序设计'      },
  { id: 'aerospace',   label: '航空航天概论'         },
  { id: 'thermo',      label: '工程热力学'           },
  { id: 'math',        label: '高等数学'             },
  { id: 'physics',     label: '大学物理'             },
  { id: 'circuits',    label: '电路原理'             },
]

const SUBJECT_MAP = Object.fromEntries(SUBJECTS.map(s => [s.id, s.label]))

// ── File format config ────────────────────────────────────────────
const ACCEPTED_EXT  = ['.pdf', '.pptx', '.docx', '.txt']
const ACCEPTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

// ── Parse status config ───────────────────────────────────────────
const STATUS = {
  pending: { label: '待处理',     spin: false },
  parsing: { label: '正在拆解中…', spin: true  },
  done:    { label: '已完成',     spin: false },
  error:   { label: '解析失败',   spin: false },
}

// ── Utils ─────────────────────────────────────────────────────────
const uid   = () => Math.random().toString(36).slice(2, 10)
const fmtSz = b  =>
  b < 1024 ? `${b} B` :
  b < 1024**2 ? `${(b/1024).toFixed(1)} KB` :
  `${(b/1024**2).toFixed(2)} MB`
const fmtTs = ts =>
  new Date(ts).toLocaleString('zh-CN', {
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit',
  })
const isValidFile = f =>
  ACCEPTED_EXT.some(e => f.name.toLowerCase().endsWith(e)) ||
  ACCEPTED_MIME.includes(f.type)

// ── Blob helpers ──────────────────────────────────────────────────
function openBlob(url, name) {
  if (!url) { alert('文件数据已在刷新后释放，请重新上传以预览。'); return }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function downloadBlob(url, name) {
  if (!url) { alert('文件数据已在刷新后释放，请重新上传以下载。'); return }
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
}

// ── Mock API layer (swap for real axios calls) ────────────────────
const apiUpload = async (file, onProgress) => {
  // const fd = new FormData()
  // fd.append('file', file)
  // fd.append('subject', subjectId)
  // const res = await axios.post('/api/teacher/upload', fd, {
  //   onUploadProgress: e => onProgress(Math.round(e.loaded / e.total * 100)),
  // })
  // return res.data
  await new Promise(r => setTimeout(r, 700 + Math.random() * 600))
  onProgress(100)
}

const apiReparse = async id => {
  // await axios.post(`/api/teacher/reparse/${id}`)
  await new Promise(r => setTimeout(r, 1400 + Math.random() * 800))
}

const apiDelete = async id => {
  // await axios.delete(`/api/teacher/file/${id}`)
  await new Promise(r => setTimeout(r, 250))
}

// ════════════════════════════════════════════════════════════════
// SVG Icon library
// ════════════════════════════════════════════════════════════════
function Ico({ d, s = 16, stroke = 'currentColor', sw = 1.8, fill = 'none', className = '' }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24"
      fill={fill} stroke={stroke} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  )
}

const Icons = {
  Upload:   ({ s=38 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  File:     ({ s=15 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  Trash:    ({ s=13 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Refresh:  ({ s=13, cls='' }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={cls}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Download: ({ s=13 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Eye:      ({ s=13 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Check:    ({ s=12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  XIcon:    ({ s=12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Empty:    ({ s=44 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      opacity="0.35">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="12" y2="17"/>
    </svg>
  ),
}

// ════════════════════════════════════════════════════════════════
// Theme CSS injected once — all colour tokens live here
// ════════════════════════════════════════════════════════════════
const THEME_CSS = `
  :root {
    /* accent colours — same in both modes */
    --t-purple: #a855f7;
    --t-cyan:   #0ea5e9;
    --t-green:  #10b981;
    --t-red:    #ef4444;
    --t-amber:  #f59e0b;
    --t-muted:  #94a3b8;

    /* light mode surfaces */
    --t-page:        #f1f5f9;
    --t-card:        rgba(255,255,255,0.72);
    --t-row:         rgba(0,0,0,0.025);
    --t-row-hover:   rgba(168,85,247,0.05);
    --t-drop-bg:     rgba(168,85,247,0.03);
    --t-border:      rgba(0,0,0,0.08);
    --t-border-acc:  rgba(168,85,247,0.30);
    --t-text:        #1e293b;
    --t-text-sub:    #64748b;
    --t-blur:        blur(18px);
    --t-tab-active:  rgba(168,85,247,0.08);
    --t-select-bg:   #fff;
  }

  [data-theme="dark"] {
    --t-page:        #080b14;
    --t-card:        rgba(255,255,255,0.030);
    --t-row:         rgba(255,255,255,0.020);
    --t-row-hover:   rgba(168,85,247,0.06);
    --t-drop-bg:     rgba(168,85,247,0.05);
    --t-border:      rgba(255,255,255,0.07);
    --t-border-acc:  rgba(168,85,247,0.38);
    --t-text:        #e2e8f0;
    --t-text-sub:    #64748b;
    --t-blur:        blur(12px);
    --t-tab-active:  rgba(168,85,247,0.12);
    --t-select-bg:   rgba(15,20,35,0.90);
  }

  @keyframes tu-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes tu-breathe {
    0%,100% {
      box-shadow:
        0 0 16px 4px  rgba(168,85,247,0.20),
        0 0 42px 10px rgba(14,165,233,0.08);
    }
    50% {
      box-shadow:
        0 0 30px 8px  rgba(168,85,247,0.38),
        0 0 65px 18px rgba(14,165,233,0.16);
    }
  }

  .tu-spin     { animation: tu-spin    1s linear      infinite; }
  .tu-breathe  { animation: tu-breathe 1.3s ease-in-out infinite; }

  .tu-row { transition: background 0.12s; }
  .tu-row:hover { background: var(--t-row-hover) !important; }

  .tu-tab { transition: color 0.15s, background 0.15s, border-color 0.15s; }

  .tu-action { transition: opacity 0.15s, filter 0.15s; }
  .tu-action:hover:not(:disabled) { filter: brightness(1.3); }
  .tu-action:disabled { opacity: 0.35 !important; cursor: not-allowed; }

  .tu-fname { transition: color 0.15s; }
  .tu-fname:hover { color: #38bdf8 !important; }
`

function injectCSS() {
  if (document.getElementById('tu-css')) return
  const el = document.createElement('style')
  el.id = 'tu-css'
  el.textContent = THEME_CSS
  document.head.appendChild(el)
}

// ════════════════════════════════════════════════════════════════
// Shared primitives
// ════════════════════════════════════════════════════════════════

function Card({ accent = 'rgba(168,85,247,0.16)', mb = 20, children }) {
  return (
    <div style={{
      background:     'var(--t-card)',
      border:         `0.5px solid ${accent}`,
      borderRadius:   16,
      padding:        22,
      backdropFilter: 'var(--t-blur)',
      WebkitBackdropFilter: 'var(--t-blur)',
      marginBottom:   mb,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--t-text-sub)',
      margin: '0 0 12px',
    }}>
      {children}
    </p>
  )
}

function ActionBtn({ onClick, disabled, title, hue, children }) {
  const cols = {
    cyan:   { bg:'rgba(14,165,233,0.09)',  border:'rgba(14,165,233,0.28)',  color:'#38bdf8'  },
    purple: { bg:'rgba(168,85,247,0.09)', border:'rgba(168,85,247,0.28)',  color:'#c084fc'  },
    red:    { bg:'rgba(239,68,68,0.08)',   border:'rgba(239,68,68,0.26)',   color:'#f87171'  },
    green:  { bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.26)',  color:'#34d399'  },
  }
  const c = cols[hue] || cols.cyan
  return (
    <button
      className="tu-action"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        width:30, height:30, borderRadius:7, flexShrink:0,
        background: c.bg, border:`0.5px solid ${c.border}`,
        color: c.color, cursor:'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════
// StatusBadge
// ════════════════════════════════════════════════════════════════
function StatusBadge({ status }) {
  const colorMap = {
    pending: 'var(--t-muted)',
    parsing: 'var(--t-cyan)',
    done:    'var(--t-green)',
    error:   'var(--t-red)',
  }
  const cfg   = STATUS[status] || STATUS.pending
  const color = colorMap[status] || colorMap.pending

  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      fontSize:11, fontWeight:500, color,
      background:`color-mix(in srgb, ${color} 13%, transparent)`,
      border:`0.5px solid color-mix(in srgb, ${color} 35%, transparent)`,
      borderRadius:20, padding:'3px 9px', whiteSpace:'nowrap',
    }}>
      {cfg.spin
        ? <Icons.Refresh s={11} cls="tu-spin"/>
        : status === 'done'  ? <Icons.Check s={11}/>
        : status === 'error' ? <Icons.XIcon s={11}/>
        : <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}}/>
      }
      {cfg.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════
// ProgressBar
// ════════════════════════════════════════════════════════════════
function ProgressBar({ pct }) {
  if (pct >= 100) return null
  return (
    <div style={{height:3,borderRadius:2,overflow:'hidden',background:'var(--t-border)',marginTop:5}}>
      <div style={{
        height:'100%', borderRadius:2, width:`${pct}%`,
        background:'linear-gradient(90deg,#a855f7,#0ea5e9)',
        transition:'width 0.3s ease',
      }}/>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// SubjectTabs
// ════════════════════════════════════════════════════════════════
function SubjectTabs({ active, onChange, counts }) {
  return (
    <div style={{
      display:'flex', gap:6, flexWrap:'wrap',
      padding:'4px 0', marginBottom:20,
    }}>
      {SUBJECTS.map(s => {
        const isActive = s.id === active
        const count    = s.id === 'all'
          ? Object.values(counts).reduce((a,b) => a+b, 0)
          : (counts[s.id] || 0)

        return (
          <button
            key={s.id}
            className="tu-tab"
            onClick={() => onChange(s.id)}
            style={{
              display:'inline-flex', alignItems:'center', gap:6,
              padding:'6px 14px',
              borderRadius:10,
              fontSize:12, fontWeight: isActive ? 500 : 400,
              cursor:'pointer',
              background: isActive ? 'var(--t-tab-active)' : 'transparent',
              border: isActive
                ? '0.5px solid rgba(168,85,247,0.45)'
                : '0.5px solid var(--t-border)',
              color: isActive ? '#c084fc' : 'var(--t-text-sub)',
              borderBottom: isActive
                ? '2px solid #a855f7'
                : '2px solid transparent',
              boxShadow: isActive
                ? '0 0 10px rgba(168,85,247,0.18)'
                : 'none',
              backdropFilter: 'var(--t-blur)',
            }}
          >
            {s.label}
            {count > 0 && (
              <span style={{
                background: isActive ? 'rgba(168,85,247,0.22)' : 'var(--t-border)',
                color: isActive ? '#c084fc' : 'var(--t-text-sub)',
                borderRadius:20, padding:'1px 7px',
                fontSize:10, fontWeight:500,
              }}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DropZone
// ════════════════════════════════════════════════════════════════
function DropZone({ selectedSubject, onSubjectChange, onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const process = fs => {
    const valid = [...fs].filter(isValidFile)
    if (valid.length) onFiles(valid, selectedSubject)
  }

  return (
    <div>
      {/* Subject selector */}
      <div style={{marginBottom:14}}>
        <label style={{
          fontSize:11, fontWeight:500, color:'var(--t-text-sub)',
          letterSpacing:'0.06em', textTransform:'uppercase',
          display:'block', marginBottom:6,
        }}>
          上传至科目
        </label>
        <select
          value={selectedSubject}
          onChange={e => onSubjectChange(e.target.value)}
          style={{
            width:'100%', maxWidth:280,
            padding:'8px 12px',
            borderRadius:9,
            border:'0.5px solid var(--t-border-acc)',
            background:'var(--t-select-bg)',
            color:'var(--t-text)',
            fontSize:13,
            cursor:'pointer',
            backdropFilter:'var(--t-blur)',
            outline:'none',
          }}
        >
          {SUBJECTS.filter(s => s.id !== 'all').map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Drop area */}
      <div
        className={dragging ? 'tu-breathe' : ''}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); process(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          gap:12, minHeight:168,
          borderRadius:14,
          border:`1.5px dashed ${dragging ? 'rgba(168,85,247,0.75)' : 'var(--t-border-acc)'}`,
          background: dragging ? 'rgba(168,85,247,0.07)' : 'var(--t-drop-bg)',
          cursor:'pointer',
          transition:'border-color 0.2s, background 0.2s',
          padding:'28px 20px',
          boxSizing:'border-box',
        }}
      >
        <span style={{
          color: dragging ? '#c084fc' : 'var(--t-purple)',
          opacity: dragging ? 1 : 0.65,
          transition:'color 0.2s, opacity 0.2s',
        }}>
          <Icons.Upload s={36}/>
        </span>

        <div style={{textAlign:'center'}}>
          <p style={{fontSize:13, fontWeight:500, color:'var(--t-text)', margin:'0 0 4px'}}>
            拖拽文件至此，或
            <span style={{color:'var(--t-purple)', marginLeft:4, textDecoration:'underline'}}>
              点击选择
            </span>
          </p>
          <p style={{fontSize:11, color:'var(--t-text-sub)', margin:0}}>
            支持 PDF · PPTX · DOCX · TXT
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT.join(',')}
          onChange={e => { process(e.target.files); e.target.value='' }}
          style={{display:'none'}}
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// StatsBar
// ════════════════════════════════════════════════════════════════
function StatsBar({ files }) {
  const chips = [
    { label:'全部',   n: files.length,                                     c:'#7dd3fc' },
    { label:'已完成', n: files.filter(f=>f.status==='done').length,         c:'#10b981' },
    { label:'解析中', n: files.filter(f=>f.status==='parsing').length,      c:'#0ea5e9' },
    { label:'待处理', n: files.filter(f=>f.status==='pending').length,      c:'#94a3b8' },
  ]
  return (
    <div style={{
      display:'flex', gap:18, flexWrap:'wrap',
      padding:'8px 14px', marginBottom:12,
      background:'var(--t-row)',
      border:'0.5px solid var(--t-border)',
      borderRadius:10,
    }}>
      {chips.map(({ label, n, c }) => (
        <div key={label} style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{
            width:7,height:7,borderRadius:'50%',
            background:c, display:'inline-block',
            boxShadow:`0 0 5px ${c}99`,
          }}/>
          <span style={{fontSize:11,color:'var(--t-text-sub)'}}>{label}</span>
          <span style={{fontSize:11,fontWeight:500,color:'var(--t-text)'}}>{n}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TableHeader
// ════════════════════════════════════════════════════════════════
function TableHeader() {
  const th = (t, align='left') => (
    <span style={{
      fontSize:10, fontWeight:500, color:'var(--t-text-sub)',
      letterSpacing:'0.07em', textTransform:'uppercase', textAlign:align,
    }}>{t}</span>
  )
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:'1fr 90px 90px 110px 130px',
      gap:10, padding:'4px 14px 10px',
      borderBottom:'0.5px solid var(--t-border)',
      marginBottom:5,
    }}>
      {th('文件名')}
      {th('科目','center')}
      {th('大小','right')}
      {th('解析状态','center')}
      {th('操作','right')}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FileRow
// ════════════════════════════════════════════════════════════════
function FileRow({ item, onDelete, onReparse }) {
  const getBlobUrl  = useTeacherStore(s => s.getBlobUrl)
  const [busy, setBusy] = useState({ del:false, parse:false })

  const blobUrl    = getBlobUrl(item.id)
  const hasBlob    = !!item._blobAvailable && !!blobUrl
  const isParsing  = item.status === 'parsing' || busy.parse

  const doOpen     = () => openBlob(blobUrl, item.name)
  const doDownload = () => downloadBlob(blobUrl, item.name)

  const doReparse  = async () => {
    setBusy(b=>({...b,parse:true}))
    onReparse(item.id,'parsing')
    await apiReparse(item.id)
    onReparse(item.id,'done')
    setBusy(b=>({...b,parse:false}))
  }

  const doDelete = async () => {
    setBusy(b=>({...b,del:true}))
    await apiDelete(item.id)
    onDelete(item.id)
  }

  return (
    <div
      className="tu-row"
      style={{
        display:'grid',
        gridTemplateColumns:'1fr 90px 90px 110px 130px',
        alignItems:'center',
        gap:10,
        padding:'10px 14px',
        borderRadius:10,
        background:'var(--t-row)',
        border:'0.5px solid var(--t-border)',
        marginBottom:6,
        boxSizing:'border-box',
      }}
    >
      {/* Filename */}
      <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
        <span style={{color:'var(--t-cyan)',flexShrink:0}}>
          <Icons.File s={13}/>
        </span>
        <button
          className="tu-fname"
          onClick={doOpen}
          title={hasBlob ? '点击预览' : '刷新后文件数据已释放'}
          style={{
            background:'none', border:'none', padding:0,
            cursor: hasBlob ? 'pointer' : 'default',
            fontSize:12, fontWeight:500,
            color: hasBlob ? 'var(--t-cyan)' : 'var(--t-text)',
            textDecoration: hasBlob ? 'underline' : 'none',
            textDecorationColor:'rgba(14,165,233,0.40)',
            textUnderlineOffset:2,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            maxWidth:'100%', textAlign:'left',
          }}
        >
          {item.name}
        </button>
      </div>

      {/* Subject pill */}
      <div style={{display:'flex',justifyContent:'center'}}>
        <span style={{
          fontSize:10, padding:'2px 8px', borderRadius:20,
          background:'rgba(168,85,247,0.10)',
          border:'0.5px solid rgba(168,85,247,0.25)',
          color:'#c084fc', whiteSpace:'nowrap', maxWidth:82,
          overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {SUBJECT_MAP[item.subject] || item.subject}
        </span>
      </div>

      {/* Size */}
      <span style={{fontSize:11,color:'var(--t-text-sub)',textAlign:'right'}}>
        {fmtSz(item.size)}
      </span>

      {/* Status */}
      <div style={{display:'flex',justifyContent:'center'}}>
        <StatusBadge status={item.status}/>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:5,justifyContent:'flex-end'}}>
        <ActionBtn onClick={doOpen}     disabled={!hasBlob} title="预览文件" hue="cyan">
          <Icons.Eye s={12}/>
        </ActionBtn>
        <ActionBtn onClick={doDownload} disabled={!hasBlob} title="下载文件" hue="purple">
          <Icons.Download s={12}/>
        </ActionBtn>
        <ActionBtn onClick={doReparse}  disabled={isParsing} title="重新解析" hue="green">
          <Icons.Refresh s={12} cls={isParsing ? 'tu-spin' : ''}/>
        </ActionBtn>
        <ActionBtn onClick={doDelete}   disabled={busy.del} title="删除文件" hue="red">
          <Icons.Trash s={12}/>
        </ActionBtn>
      </div>

      {/* Progress bar (full width) */}
      {item.progress < 100 && (
        <div style={{gridColumn:'1/-1',marginTop:-3}}>
          <ProgressBar pct={item.progress}/>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// EmptyState
// ════════════════════════════════════════════════════════════════
function EmptyState({ subject }) {
  const label = subject === 'all'
    ? '暂无上传文件'
    : `「${SUBJECT_MAP[subject]}」暂无资料`
  return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', gap:12,
      padding:'42px 0',
      color:'var(--t-text-sub)',
    }}>
      <Icons.Empty s={46}/>
      <p style={{fontSize:13,margin:0}}>{label}</p>
      <p style={{fontSize:11,margin:0,opacity:0.6}}>
        请在上方上传区选择对应科目后上传文件
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════════════════════
export default function TeacherUpload() {
  const theme = useUserStore(s => s.theme)

  const files        = useTeacherStore(s => s.files)
  const addFile      = useTeacherStore(s => s.addFile)
  const updateFile   = useTeacherStore(s => s.updateFile)
  const removeFile   = useTeacherStore(s => s.removeFile)
  const registerBlob = useTeacherStore(s => s.registerBlob)

  // Active subject filter tab
  const [activeTab,       setActiveTab]       = useState('all')
  // Subject chosen in the upload dropdown
  const [uploadSubject,   setUploadSubject]   = useState('c_language')

  // Inject CSS + sync theme attr
  useEffect(() => { injectCSS() }, [])
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme', theme === 'dark' ? 'dark' : 'light'
    )
  }, [theme])

  // ── File counts per subject (for tab badges) ──────────────────
  const subjectCounts = useMemo(() => {
    const counts = {}
    files.forEach(f => {
      counts[f.subject] = (counts[f.subject] || 0) + 1
    })
    return counts
  }, [files])

  // ── Filtered file list ────────────────────────────────────────
  const visibleFiles = useMemo(() => (
    activeTab === 'all' ? files : files.filter(f => f.subject === activeTab)
  ), [files, activeTab])

  // ── Simulate parse progression ────────────────────────────────
  const simulateParse = useCallback(id => {
    setTimeout(() => {
      updateFile(id, { status:'parsing' })
      setTimeout(() => {
        updateFile(id, { status:'done' })
      }, 1600 + Math.random() * 1200)
    }, 500)
  }, [updateFile])

  // ── Handle drop/select ────────────────────────────────────────
  const onFiles = useCallback(async (rawFiles, subject) => {
    for (const f of rawFiles) {
      const id   = uid()
      const meta = {
        id,
        name:           f.name,
        size:           f.size,
        subject,
        uploadedAt:     Date.now(),
        status:         'pending',
        progress:       0,
        _blobAvailable: false,
      }
      addFile(meta)
      registerBlob(id, f)

      try {
        await apiUpload(f, pct => updateFile(id, { progress: pct }))
        simulateParse(id)
      } catch {
        updateFile(id, { status: 'error' })
      }
    }
  }, [addFile, updateFile, registerBlob, simulateParse])

  const onDelete  = useCallback(id => removeFile(id), [removeFile])
  const onReparse = useCallback((id, status) => updateFile(id, { status }), [updateFile])

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:'100%',
      padding:'26px 22px',
      fontFamily:'var(--font-sans, system-ui, sans-serif)',
      color:'var(--t-text)',
      boxSizing:'border-box',
      transition:'color 0.2s',
    }}>

      {/* Page header */}
      <div style={{marginBottom:22}}>
        <h1 style={{
          fontSize:20, fontWeight:500, margin:'0 0 5px',
          background:'linear-gradient(90deg,#c084fc,#38bdf8)',
          WebkitBackgroundClip:'text',
          WebkitTextFillColor:'transparent',
          display:'inline-block',
        }}>
          课程资料管理
        </h1>
        <p style={{
          fontSize:13, color:'var(--t-text-sub)',
          margin:0, lineHeight:1.75, maxWidth:600,
        }}>
          欢迎，老师！请在此上传您的课程大纲或 PPT，AI 学伴将自动为您生成知识图谱和课后练习。
        </p>
      </div>

      {/* Upload card */}
      <Card accent="rgba(168,85,247,0.18)" mb={20}>
        <SectionLabel>上传文件</SectionLabel>
        <DropZone
          selectedSubject={uploadSubject}
          onSubjectChange={setUploadSubject}
          onFiles={onFiles}
        />
      </Card>

      {/* Subject filter tabs */}
      <SubjectTabs
        active={activeTab}
        onChange={setActiveTab}
        counts={subjectCounts}
      />

      {/* File list card */}
      <Card accent="rgba(14,165,233,0.15)" mb={0}>
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:14,
        }}>
          <SectionLabel>
            {activeTab === 'all'
              ? `文件列表（${files.length}）`
              : `${SUBJECT_MAP[activeTab]}（${visibleFiles.length}）`
            }
          </SectionLabel>
        </div>

        {visibleFiles.length > 0 && <StatsBar files={visibleFiles}/>}

        {visibleFiles.length === 0
          ? <EmptyState subject={activeTab}/>
          : (
            <>
              <TableHeader/>
              {visibleFiles.map(item => (
                <FileRow
                  key={item.id}
                  item={item}
                  onDelete={onDelete}
                  onReparse={onReparse}
                />
              ))}
            </>
          )
        }
      </Card>
    </div>
  )
}