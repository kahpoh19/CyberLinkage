// frontend/src/pages/StudentResources.jsx
//
// Student-facing file browser.
// Only shows files where: isVisible === true AND (releaseAt == null OR releaseAt <= now)
// Mirrors the teacher upload table's dark-glass aesthetic but with Read/Download actions only.

import React, {
  useState, useMemo, useEffect, useCallback,
} from 'react'
import useTeacherStore from '../store/teacherStore'
import { filterFilesForStudent } from '../hooks/useFileAccess'
import useUserStore from '../store/userStore'
import ResourcePreviewModal from '../components/ResourcePreviewModal'

const ALL_SUBJECT_OPTION = { id: 'all', label: '全部' }

const fmtSz = b =>
  b < 1024 ? `${b} B` :
  b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` :
  `${(b / 1024 ** 2).toFixed(2)} MB`

const fmtTs = ts =>
  new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

// ── File-type icon ────────────────────────────────────────────────────────────
function FileIcon({ name, size = 15 }) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const color =
    ext === 'pdf'  ? '#ff4d4f' :
    ext === 'pptx' ? '#fa8c16' :
    ext === 'docx' ? '#1677ff' :
    ext === 'md'   ? '#7c3aed' :
    '#8c8c8c'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const Icons = {}

Icons.Eye = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

Icons.Download = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

Icons.Empty = ({ s = 52 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
    opacity="0.28">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="12" y2="17"/>
  </svg>
)

Icons.ChevronDown = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

Icons.Search = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ── Theme CSS (scoped to .sr-page) ────────────────────────────────────────────
const THEME_CSS = `
  .sr-page {
    --sr-cyan:   #0ea5e9;
    --sr-purple: #a855f7;
    --sr-green:  #10b981;
    --sr-muted:  #94a3b8;

    --sr-page:       #f1f5f9;
    --sr-card:       rgba(255,255,255,0.75);
    --sr-row:        rgba(0,0,0,0.025);
    --sr-row-hover:  rgba(14,165,233,0.06);
    --sr-border:     rgba(0,0,0,0.08);
    --sr-border-acc: rgba(14,165,233,0.28);
    --sr-text:       #1e293b;
    --sr-text-sub:   #64748b;
    --sr-blur:       blur(18px);
    --sr-tab-active: rgba(14,165,233,0.10);
    --sr-input-bg:   #fff;
  }

  [data-theme="dark"] .sr-page {
    --sr-page:       #080b14;
    --sr-card:       rgba(255,255,255,0.030);
    --sr-row:        rgba(255,255,255,0.018);
    --sr-row-hover:  rgba(14,165,233,0.07);
    --sr-border:     rgba(255,255,255,0.07);
    --sr-border-acc: rgba(14,165,233,0.30);
    --sr-text:       #e2e8f0;
    --sr-text-sub:   #64748b;
    --sr-blur:       blur(12px);
    --sr-tab-active: rgba(14,165,233,0.13);
    --sr-input-bg:   rgba(20,28,50,0.90);
  }

  .sr-row-wrap    { transition: background 0.12s; }
  .sr-row-wrap:hover { background: var(--sr-row-hover) !important; }
  .sr-tab-btn     { transition: color 0.15s, background 0.15s, border-color 0.15s; }
  .sr-action-btn  { transition: opacity 0.15s, filter 0.15s; }
  .sr-action-btn:hover { filter: brightness(1.25); }
  .sr-fname-btn:hover  { color: #38bdf8 !important; }
`

function injectCSS() {
  let el = document.getElementById('sr-css')
  if (!el) {
    el = document.createElement('style')
    el.id = 'sr-css'
    document.head.appendChild(el)
  }
  if (el.textContent !== THEME_CSS) el.textContent = THEME_CSS
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ onClick, title, hue, children }) {
  const cols = {
    cyan:   { bg: 'rgba(14,165,233,0.10)',  border: 'rgba(14,165,233,0.30)',  color: '#38bdf8' },
    purple: { bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.30)', color: '#c084fc' },
  }
  const c = cols[hue] || cols.cyan
  return (
    <button
      className="sr-action-btn"
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 7, flexShrink: 0,
        background: c.bg, border: `0.5px solid ${c.border}`,
        color: c.color, cursor: 'pointer', fontSize: 12, fontWeight: 500,
      }}
    >
      {children}
    </button>
  )
}

// ── Subject tabs ──────────────────────────────────────────────────────────────
function SubjectTabs({ active, onChange, counts, subjects }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0', marginBottom: 20 }}>
      {subjects.map(s => {
        const isActive = s.id === active
        const count =
          s.id === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[s.id] || 0)
        return (
          <button
            key={s.id}
            className="sr-tab-btn"
            onClick={() => onChange(s.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 10,
              fontSize: 13, fontWeight: isActive ? 500 : 400, cursor: 'pointer',
              background:   isActive ? 'var(--sr-tab-active)' : 'transparent',
              border:       isActive ? '0.5px solid rgba(14,165,233,0.45)' : '0.5px solid var(--sr-border)',
              color:        isActive ? '#38bdf8' : 'var(--sr-text-sub)',
              borderBottom: isActive ? '2px solid #0ea5e9' : '2px solid transparent',
              boxShadow:    isActive ? '0 0 10px rgba(14,165,233,0.18)' : 'none',
              backdropFilter: 'var(--sr-blur)',
            }}
          >
            {s.label}
            {count > 0 && (
              <span style={{
                background: isActive ? 'rgba(14,165,233,0.22)' : 'var(--sr-border)',
                color: isActive ? '#38bdf8' : 'var(--sr-text-sub)',
                borderRadius: 20, padding: '1px 7px',
                fontSize: 11, fontWeight: 500,
              }}>{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Table header ──────────────────────────────────────────────────────────────
function TableHeader() {
  const th = (t, align = 'left') => (
    <span style={{
      fontSize: 11, fontWeight: 500, color: 'var(--sr-text-sub)',
      letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: align,
    }}>{t}</span>
  )
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 90px 80px 80px 160px',
      gap: 8, padding: '4px 14px 10px',
      borderBottom: '0.5px solid var(--sr-border)', marginBottom: 5,
    }}>
      {th('文件名')}
      {th('科目', 'center')}
      {th('大小', 'right')}
      {th('解析', 'center')}
      {th('操作', 'right')}
    </div>
  )
}

// ── Parse badge (display-only) ────────────────────────────────────────────────
function ParseBadge({ status }) {
  const cfg = {
    pending: { label: '待处理', color: '#94a3b8' },
    parsing: { label: '处理中', color: '#0ea5e9' },
    done:    { label: '已完成', color: '#10b981' },
    error:   { label: '解析失败', color: '#ef4444' },
  }[status] || { label: '—', color: '#94a3b8' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 500, color: cfg.color,
      background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      border: `0.5px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
      borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ item, onPreview, onDownload, subjectMap }) {
  return (
    <div
      className="sr-row-wrap"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 80px 80px 160px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--sr-row)',
        border: '0.5px solid var(--sr-border)',
        marginBottom: 6,
        boxSizing: 'border-box',
      }}
    >
      {/* Filename */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}><FileIcon name={item.name} /></span>
        <div style={{ minWidth: 0 }}>
          <button
            className="sr-fname-btn"
            onClick={() => onPreview(item)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, color: 'var(--sr-cyan)',
              textDecoration: 'underline', textDecorationColor: 'rgba(14,165,233,0.35)',
              textUnderlineOffset: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '100%', textAlign: 'left', display: 'block',
              transition: 'color 0.15s',
            }}
            title={`在线预览：${item.name}`}
          >
            {item.name}
          </button>
          {item.uploadedAt && (
            <span style={{ fontSize: 11, color: 'var(--sr-text-sub)', display: 'block', marginTop: 1 }}>
              {fmtTs(item.uploadedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Subject */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 20,
          background: 'rgba(14,165,233,0.10)', border: '0.5px solid rgba(14,165,233,0.25)',
          color: '#38bdf8', whiteSpace: 'nowrap', maxWidth: 80,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {subjectMap[item.subject] || item.subject}
        </span>
      </div>

      {/* Size */}
      <span style={{ fontSize: 12, color: 'var(--sr-text-sub)', textAlign: 'right' }}>
        {fmtSz(item.size || 0)}
      </span>

      {/* Parse status */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ParseBadge status={item.status} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <ActionBtn onClick={() => onPreview(item)} title="在线预览文件" hue="cyan">
          <Icons.Eye s={12} />
          预览
        </ActionBtn>
        <ActionBtn onClick={() => onDownload(item)} title="下载文件" hue="purple">
          <Icons.Download s={12} />
          下载
        </ActionBtn>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ subject, subjectMap }) {
  const label =
    subject === 'all'
      ? '暂无老师分享的资料'
      : `「${subjectMap[subject] || subject}」暂无可用资料`
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      padding: '56px 0', color: 'var(--sr-text-sub)',
    }}>
      <Icons.Empty s={52} />
      <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 12, margin: 0, opacity: 0.6 }}>请等待老师发布课程资料</p>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ files }) {
  const byType = files.reduce((acc, f) => {
    const ext = (f.name || '').split('.').pop().toLowerCase()
    acc[ext] = (acc[ext] || 0) + 1
    return acc
  }, {})
  return (
    <div style={{
      display: 'flex', gap: 18, flexWrap: 'wrap', padding: '8px 14px', marginBottom: 12,
      background: 'var(--sr-row)', border: '0.5px solid var(--sr-border)', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
        <span style={{ fontSize: 12, color: 'var(--sr-text-sub)' }}>共</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--sr-text)' }}>{files.length} 份资料</span>
      </div>
      {Object.entries(byType).map(([ext, n]) => (
        <div key={ext} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--sr-text-sub)', textTransform: 'uppercase' }}>{ext}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--sr-text)' }}>×{n}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudentResources() {
  const files       = useTeacherStore(s => s.files)
  const getBlobUrl  = useTeacherStore(s => s.getBlobUrl)
  const subjects    = useUserStore(s => s.subjects)
  const resolvedTheme = useUserStore(s => s.resolvedTheme)

  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch]       = useState('')
  const [tick, setTick]           = useState(Date.now())
  const [previewFile, setPreviewFile] = useState(null)
  const subjectOptions = useMemo(
    () => [ALL_SUBJECT_OPTION, ...subjects.filter(subject => subject.id !== 'all')],
    [subjects],
  )
  const subjectMap = useMemo(
    () => Object.fromEntries(subjectOptions.map(subject => [subject.id, subject.label])),
    [subjectOptions],
  )

  // Inject CSS on every render (idempotent)
  useEffect(() => { injectCSS() })

  // Re-evaluate scheduled releases every minute
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (activeTab !== 'all' && !subjectOptions.some(subject => subject.id === activeTab)) {
      setActiveTab('all')
    }
  }, [activeTab, subjectOptions])

  // ── Core filter: only visible + released files ──────────────────────────────
  const visibleFiles = useMemo(
    () => filterFilesForStudent(files, tick),
    [files, tick]
  )

  // ── Subject counts from visible files only ──────────────────────────────────
  const subjectCounts = useMemo(() => {
    const counts = {}
    visibleFiles.forEach(f => { counts[f.subject] = (counts[f.subject] || 0) + 1 })
    return counts
  }, [visibleFiles])

  // ── Tab + search filter ─────────────────────────────────────────────────────
  const displayFiles = useMemo(() => {
    let list = activeTab === 'all'
      ? visibleFiles
      : visibleFiles.filter(f => f.subject === activeTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(f => (f.name || '').toLowerCase().includes(q))
    }
    return list
  }, [visibleFiles, activeTab, search])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handlePreview = useCallback((item) => {
    setPreviewFile(item)
  }, [])

  const handleDownload = useCallback((item) => {
    const url = getBlobUrl(item.id)
    if (!url) {
      alert('该文件当前无法下载（可能需要刷新页面后老师重新上传）。')
      return
    }
    const a = Object.assign(document.createElement('a'), { href: url, download: item.name })
    a.click()
  }, [getBlobUrl])

  return (
    <div
      className="sr-page"
      style={{
        minHeight: '100%',
        padding: '26px 22px',
        fontFamily: 'inherit',
        fontWeight: 400,
        color: 'var(--sr-text)',
        boxSizing: 'border-box',
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontSize: 20, fontWeight: 600, margin: '0 0 5px',
          background: 'linear-gradient(90deg,#38bdf8,#0ea5e9)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block',
        }}>
          学生资料
        </h1>
        <p style={{ fontSize: 13, color: 'var(--sr-text-sub)', margin: 0, lineHeight: 1.75, maxWidth: 600 }}>
          以下是老师分享的课程资料，点击文件名或「预览」即可在线阅读；md/txt 会直接渲染，其他格式可继续打开或下载。
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--sr-card)',
        border: '0.5px solid var(--sr-border-acc)',
        borderRadius: 12, padding: '8px 14px', marginBottom: 20,
        backdropFilter: 'var(--sr-blur)', WebkitBackdropFilter: 'var(--sr-blur)',
        maxWidth: 360,
      }}>
        <span style={{ color: 'var(--sr-text-sub)', flexShrink: 0 }}><Icons.Search /></span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索文件名…"
          style={{
            background: 'none', border: 'none', outline: 'none',
            fontSize: 13, color: 'var(--sr-text)', width: '100%',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sr-text-sub)', fontSize: 16, lineHeight: 1, padding: 0 }}
          >×</button>
        )}
      </div>

      {/* Subject tabs */}
      <SubjectTabs active={activeTab} onChange={setActiveTab} counts={subjectCounts} subjects={subjectOptions} />

      {/* File list card */}
      <div style={{
        background: 'var(--sr-card)',
        border: '0.5px solid rgba(14,165,233,0.18)',
        borderRadius: 16,
        padding: '18px 22px 22px',
        backdropFilter: 'var(--sr-blur)',
        WebkitBackdropFilter: 'var(--sr-blur)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
            textTransform: 'uppercase', color: 'var(--sr-text-sub)',
          }}>
            {activeTab === 'all'
              ? `资料列表（${displayFiles.length}）`
              : `${subjectMap[activeTab] || activeTab}（${displayFiles.length}）`}
          </span>
          {search && displayFiles.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--sr-text-sub)' }}>
              未找到匹配「{search}」的文件
            </span>
          )}
        </div>

        {displayFiles.length > 0 && <StatsBar files={displayFiles} />}

        {displayFiles.length === 0 ? (
          <EmptyState subject={activeTab} subjectMap={subjectMap} />
        ) : (
          <>
            <TableHeader />
            {displayFiles.map(item => (
              <FileRow
                key={item.id}
                item={item}
                subjectMap={subjectMap}
                onPreview={handlePreview}
                onDownload={handleDownload}
              />
            ))}
          </>
        )}
      </div>

      {/* Info note */}
      {visibleFiles.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--sr-text-sub)', marginTop: 14, opacity: 0.7 }}>
          💡 资料由老师发布，如需最新内容请刷新页面。
        </p>
      )}

      <ResourcePreviewModal
        open={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        getBlobUrl={getBlobUrl}
        onDownload={handleDownload}
        theme={resolvedTheme}
      />
    </div>
  )
}
