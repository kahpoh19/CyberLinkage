// frontend/src/pages/TeacherUpload.jsx
//
// Enhanced with:
//   • isVisible toggle  — per-file "student can see this" switch
//   • releaseAt picker  — schedule a future publish time (Ant Design DatePicker)
//   • Derived publish status: "published" | "scheduled" | "hidden"
//   • useFileAccess hook re-exported at the bottom for student-side filtering
//   • Dark-mode-safe DatePicker + visibility toggle styling injected via <style>

import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react'
import { DatePicker, Tooltip, Select, message } from 'antd'
import dayjs from 'dayjs'
import { generateKnowledgeGraph, generateQuestionBank, getGraph } from '../api'
import useTeacherStore from '../store/teacherStore'
import useUserStore from '../store/userStore'

// ── Subject catalogue ─────────────────────────────────────────────
export const SUBJECTS = [
  { id: 'all',        label: '全部'           },
  { id: 'c_language', label: 'C 语言程序设计'  },
  { id: 'aerospace',  label: '航空航天概论'     },
  { id: 'thermo',     label: '工程热力学'       },
  { id: 'math',       label: '高等数学'         },
  { id: 'physics',    label: '大学物理'         },
  { id: 'circuits',   label: '电路原理'         },
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
const PARSE_STATUS = {
  pending: { label: '待处理',     spin: false },
  parsing: { label: '正在拆解中…', spin: true  },
  done:    { label: '已完成',     spin: false },
  error:   { label: '解析失败',   spin: false },
}

// ── Publish status derivation ────────────────────────────────────
/**
 * Derives the student-facing publish status of a file.
 * @returns {'published'|'scheduled'|'hidden'}
 */
function derivePublishStatus(file, now = Date.now()) {
  if (!file.isVisible) return 'hidden'
  if (!file.releaseAt) return 'published'
  return now >= new Date(file.releaseAt).getTime() ? 'published' : 'scheduled'
}

const PUBLISH_STATUS_CONFIG = {
  published: { label: '已发布', bg: 'var(--color-background-success)', color: 'var(--color-text-success)', border: 'var(--color-border-success)' },
  scheduled: { label: '待发布', bg: 'var(--color-background-warning)', color: 'var(--color-text-warning)', border: 'var(--color-border-warning)' },
  hidden:    { label: '已隐藏', bg: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', border: 'var(--color-border-tertiary)' },
}

// ── Utils ─────────────────────────────────────────────────────────
const uid   = () => Math.random().toString(36).slice(2, 10)
const fmtSz = b  =>
  b < 1024 ? `${b} B` :
  b < 1024**2 ? `${(b/1024).toFixed(1)} KB` :
  `${(b/1024**2).toFixed(2)} MB`
const fmtTs = ts =>
  new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
const isValidFile = f =>
  ACCEPTED_EXT.some(e => f.name.toLowerCase().endsWith(e)) ||
  ACCEPTED_MIME.includes(f.type)

const range = (start, end) =>
  Array.from({ length: Math.max(end - start, 0) }, (_, i) => start + i)

const disabledReleaseDate = current =>
  current && current.isBefore(dayjs().startOf('day'))

const disabledReleaseTime = current => {
  const now = dayjs()
  if (!current || !current.isSame(now, 'day')) return {}

  return {
    disabledHours: () => range(0, now.hour()),
    disabledMinutes: selectedHour =>
      selectedHour === now.hour() ? range(0, now.minute() + 1) : [],
  }
}

const toFutureTimestamp = val =>
  val && val.valueOf() > Date.now() ? val.valueOf() : null

const clampQuestionCount = value => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 3
  return Math.min(10, Math.max(1, parsed))
}

const clampNodeCount = value => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 15
  return Math.min(80, Math.max(5, parsed))
}

const normalizeNumberDraft = value =>
  String(value ?? '').replace(/[^\d]/g, '')

const keepMinimumOnDelete = (nextValue, previousValue, minimumValue) => {
  const normalized = normalizeNumberDraft(nextValue)
  return normalized === '' && previousValue === String(minimumValue)
    ? String(minimumValue)
    : normalized
}

const getApiErrorMessage = error =>
  error?.response?.data?.detail
  || error?.response?.data?.message
  || error?.message
  || '请求失败，请稍后重试'

function resolvePreferredSubjectId(subjects, currentSubject) {
  if (subjects.some(subject => subject.id === currentSubject)) return currentSubject
  if (subjects.some(subject => subject.id === 'c_language')) return 'c_language'
  return subjects[0]?.id || 'c_language'
}

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

// ── Mock API layer ────────────────────────────────────────────────
const apiUpload  = async (file, onProgress) => {
  await new Promise(r => setTimeout(r, 700 + Math.random() * 600))
  onProgress(100)
}
const apiReparse = async id => { await new Promise(r => setTimeout(r, 1400 + Math.random() * 800)) }
const apiDelete  = async id => { await new Promise(r => setTimeout(r, 250)) }

// ════════════════════════════════════════════════════════════════
// SVG Icon library
// ════════════════════════════════════════════════════════════════
function Icons() {}

Icons.Upload = ({ s = 38 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

Icons.File = ({ s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

Icons.Trash = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

Icons.Refresh = ({ s = 13, cls = '' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={cls}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
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

Icons.Eye = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

Icons.Check = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

Icons.XIcon = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

Icons.Empty = ({ s = 44 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    opacity="0.35">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="12" y2="17"/>
  </svg>
)

Icons.Clock = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)

Icons.ChevronDown = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

// ════════════════════════════════════════════════════════════════
// Theme CSS
// ════════════════════════════════════════════════════════════════
const THEME_CSS = `
  :root {
    --t-purple: #a855f7;
    --t-cyan:   #0ea5e9;
    --t-green:  #10b981;
    --t-red:    #ef4444;
    --t-amber:  #f59e0b;
    --t-muted:  #94a3b8;

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
    --t-input-bg:    #fff;
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
    --t-input-bg:    rgba(20,28,50,0.90);
  }

  @keyframes tu-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes tu-breathe {
    0%,100% {
      box-shadow: 0 0 16px 4px rgba(168,85,247,0.20), 0 0 42px 10px rgba(14,165,233,0.08);
    }
    50% {
      box-shadow: 0 0 30px 8px rgba(168,85,247,0.38), 0 0 65px 18px rgba(14,165,233,0.16);
    }
  }

  .tu-spin    { animation: tu-spin 1s linear infinite; }
  .tu-breathe { animation: tu-breathe 1.3s ease-in-out infinite; }
  .tu-row     { transition: background 0.12s; }
  .tu-row:hover { background: var(--t-row-hover) !important; }
  .tu-tab     { transition: color 0.15s, background 0.15s, border-color 0.15s; }
  .tu-action  { transition: opacity 0.15s, filter 0.15s; }
  .tu-action:hover:not(:disabled) { filter: brightness(1.3); }
  .tu-action:disabled { opacity: 0.35 !important; cursor: not-allowed; }
  .tu-fname   { transition: color 0.15s; }
  .tu-fname:hover { color: #38bdf8 !important; }

  /* Ant Design DatePicker dark mode overrides */
  [data-theme="dark"] .ant-picker {
    background: var(--t-input-bg) !important;
    border-color: var(--t-border-acc) !important;
    color: var(--t-text) !important;
  }
  [data-theme="dark"] .ant-picker input {
    color: var(--t-text) !important;
    background: transparent !important;
  }
  [data-theme="dark"] .ant-picker-suffix {
    color: var(--t-text-sub) !important;
  }
  [data-theme="dark"] .ant-picker-clear {
    background: var(--t-input-bg) !important;
    color: var(--t-text-sub) !important;
  }
  .tu-release-picker.ant-picker {
    min-width: 206px;
    height: 38px;
    padding: 0 12px;
    border: 0.5px solid var(--t-border-acc) !important;
    border-radius: 10px !important;
    background: var(--t-input-bg) !important;
    color: var(--t-text) !important;
    box-shadow: none !important;
    display: inline-flex;
    align-items: center;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s !important;
  }
  .tu-release-picker.ant-picker:hover,
  .tu-release-picker.ant-picker-focused {
    border-color: rgba(168,85,247,0.58) !important;
    box-shadow: 0 0 0 3px rgba(168,85,247,0.10) !important;
  }
  .tu-release-picker .ant-picker-input > input {
    color: var(--t-text) !important;
    font-size: 13px;
  }
  .tu-release-picker .ant-picker-input > input::placeholder {
    color: var(--t-text-sub);
  }
  .tu-release-picker .ant-picker-suffix,
  .tu-release-picker .ant-picker-separator,
  .tu-release-picker .ant-picker-clear {
    color: var(--t-text-sub) !important;
  }
  .tu-release-picker-dropdown .ant-picker-panel-container {
    overflow: hidden;
    border: 0.5px solid var(--t-border-acc);
    border-radius: 14px;
    background: var(--t-select-bg) !important;
    box-shadow: 0 18px 44px rgba(15,23,42,0.18);
    backdrop-filter: var(--t-blur);
  }
  [data-theme="dark"] .tu-release-picker-dropdown .ant-picker-panel-container {
    box-shadow: 0 20px 50px rgba(0,0,0,0.46);
  }
  .tu-release-picker-dropdown .ant-picker-panel,
  .tu-release-picker-dropdown .ant-picker-date-panel,
  .tu-release-picker-dropdown .ant-picker-time-panel {
    background: transparent !important;
    border-color: var(--t-border) !important;
  }
  .tu-release-picker-dropdown .ant-picker-header {
    border-bottom-color: var(--t-border) !important;
  }
  .tu-release-picker-dropdown .ant-picker-header,
  .tu-release-picker-dropdown .ant-picker-header button,
  .tu-release-picker-dropdown .ant-picker-content th {
    color: var(--t-text) !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell {
    color: var(--t-text-sub) !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-in-view {
    color: var(--t-text) !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-disabled {
    color: rgba(100,116,139,0.42) !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-inner,
  .tu-release-picker-dropdown .ant-picker-time-panel-cell-inner {
    border-radius: 8px !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner,
  .tu-release-picker-dropdown .ant-picker-time-panel-column > li.ant-picker-time-panel-cell-selected .ant-picker-time-panel-cell-inner {
    background: rgba(168,85,247,0.18) !important;
    color: #c084fc !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner::before {
    border-color: rgba(14,165,233,0.70) !important;
  }
  .tu-release-picker-dropdown .ant-picker-cell-in-view:not(.ant-picker-cell-disabled):hover .ant-picker-cell-inner,
  .tu-release-picker-dropdown .ant-picker-time-panel-column > li.ant-picker-time-panel-cell:hover .ant-picker-time-panel-cell-inner {
    background: rgba(14,165,233,0.10) !important;
  }
  .tu-release-picker-dropdown .ant-picker-time-panel-column {
    scrollbar-color: rgba(168,85,247,0.35) transparent;
  }
  .tu-release-picker-dropdown .ant-picker-time-panel-column::after {
    height: 176px;
  }
  .tu-release-picker-dropdown .ant-picker-footer,
  .tu-release-picker-dropdown .ant-picker-ranges {
    border-top-color: var(--t-border) !important;
  }
  .tu-release-picker-dropdown .ant-picker-now-btn {
    color: #0ea5e9 !important;
  }
  .tu-release-picker-dropdown .ant-btn-primary {
    border-color: #a855f7 !important;
    background: #a855f7 !important;
    box-shadow: none !important;
  }

  .tu-subject-select .ant-select-selector {
    width: 320px !important;
    height: 40px !important;
    padding: 4px 42px 4px 14px !important;
    border-radius: 10px !important;
    border: 0.5px solid var(--t-border-acc) !important;
    background: var(--t-select-bg) !important;
    color: var(--t-text) !important;
    box-shadow: none !important;
    display: flex;
    align-items: center;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s !important;
  }
  .tu-subject-select .ant-select-selection-item {
    color: var(--t-text) !important;
    font-size: 13px;
    line-height: 30px !important;
  }
  .tu-subject-select .ant-select-arrow {
    inset-inline-end: 14px !important;
    top: 0 !important;
    bottom: 0 !important;
    width: 18px;
    height: 40px;
    margin-top: 0 !important;
    transform: none !important;
    color: var(--t-text-sub) !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .tu-select-chevron {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    transform: translateY(1px);
    transition: transform 0.16s ease;
  }
  .tu-subject-select.ant-select-open .tu-select-chevron {
    transform: translateY(1px) rotate(180deg);
  }
  .tu-select-chevron svg {
    display: block;
  }
  .tu-subject-popup {
    padding: 6px !important;
    border-radius: 12px !important;
    border: 0.5px solid var(--t-border-acc);
    background: var(--t-select-bg) !important;
    backdrop-filter: var(--t-blur);
  }
  .tu-subject-popup .ant-select-item {
    min-height: 34px;
    border-radius: 8px;
    color: var(--t-text);
    font-size: 13px;
    display: flex;
    align-items: center;
  }
  .tu-subject-popup .ant-select-item-option-active {
    background: rgba(168,85,247,0.10) !important;
  }
  .tu-subject-popup .ant-select-item-option-selected {
    background: rgba(168,85,247,0.16) !important;
    color: #c084fc !important;
    font-weight: 500;
  }
  [data-theme="dark"] .tu-subject-popup {
    box-shadow: 0 16px 36px rgba(0,0,0,0.42);
  }

  /* Visibility label text next to toggle */
  .tu-switch-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 262px;
  }
  .tu-switch-label {
    font-size: 12px;
    color: var(--t-text-sub);
    white-space: nowrap;
    width: 188px;
  }

  .teacher-upload-page,
  .teacher-upload-page button,
  .teacher-upload-page input,
  .teacher-upload-page select,
  .teacher-upload-page textarea {
    font-family: inherit;
  }

  .tu-visibility-toggle {
    width: 58px !important;
    min-width: 58px !important;
    max-width: 58px !important;
    flex: 0 0 58px !important;
    height: 26px !important;
    min-height: 26px !important;
    max-height: 26px !important;
    line-height: 26px !important;
    padding: 0 !important;
    margin: 0;
    border: 0 !important;
    border-radius: 13px !important;
    position: relative;
    align-self: center;
    vertical-align: middle;
    aspect-ratio: auto !important;
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    overflow: hidden;
    cursor: pointer;
    background: rgba(100,116,139,0.34);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    transition: background-color 0.15s, box-shadow 0.15s !important;
  }
  .tu-visibility-toggle.is-on {
    background: #a855f7;
  }
  .tu-visibility-toggle:hover {
    box-shadow: 0 0 0 3px rgba(168,85,247,0.10);
  }
  .tu-visibility-toggle:focus-visible {
    outline: 2px solid rgba(14,165,233,0.72);
    outline-offset: 2px;
  }
  .tu-visibility-toggle-text {
    position: absolute;
    inset: 0 8px 0 25px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    line-height: 26px;
    pointer-events: none;
  }
  .tu-visibility-toggle.is-on .tu-visibility-toggle-text {
    inset: 0 25px 0 8px;
  }
  .tu-visibility-toggle-thumb {
    position: absolute;
    top: 3px;
    inset-inline-start: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(15,23,42,0.22);
    transition: inset-inline-start 0.15s ease;
  }
  .tu-visibility-toggle.is-on .tu-visibility-toggle-thumb {
    inset-inline-start: calc(100% - 23px);
  }
`

function injectCSS() {
  let el = document.getElementById('tu-css')
  if (!el) {
    el = document.createElement('style')
    el.id = 'tu-css'
    document.head.appendChild(el)
  }
  if (el.textContent !== THEME_CSS) el.textContent = THEME_CSS
}

// ════════════════════════════════════════════════════════════════
// Primitives
// ════════════════════════════════════════════════════════════════
function Card({ accent = 'rgba(168,85,247,0.16)', mb = 20, children }) {
  return (
    <div style={{
      background:     'var(--t-card)',
      border:         `0.5px solid ${accent}`,
      borderRadius:   16,
      padding:        '18px 22px 22px',
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
      fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
      textTransform: 'uppercase', color: 'var(--t-text-sub)',
      margin: '0 0 14px',
    }}>
      {children}
    </p>
  )
}

function VisibilityToggle({ checked, onChange }) {
  const toggle = () => onChange(!checked)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tu-visibility-toggle${checked ? ' is-on' : ''}`}
      onClick={toggle}
      style={{
        width: 58,
        minWidth: 58,
        maxWidth: 58,
        flex: '0 0 58px',
        height: 26,
        minHeight: 26,
        maxHeight: 26,
        lineHeight: '26px',
        padding: 0,
        margin: 0,
        border: 0,
        borderRadius: 13,
        position: 'relative',
        alignSelf: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        appearance: 'none',
        WebkitAppearance: 'none',
        aspectRatio: 'auto',
        cursor: 'pointer',
        background: checked ? '#a855f7' : 'rgba(100,116,139,0.34)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        transition: 'background-color 0.15s, box-shadow 0.15s',
        verticalAlign: 'middle',
      }}
    >
      <span
        className="tu-visibility-toggle-text"
        style={{
          position: 'absolute',
          top: 0,
          right: checked ? 25 : 8,
          bottom: 0,
          left: checked ? 8 : 25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 26,
          lineHeight: '26px',
          pointerEvents: 'none',
        }}
      >
        {checked ? '可见' : '隐藏'}
      </span>
      <span
        className="tu-visibility-toggle-thumb"
        style={{
          position: 'absolute',
          top: 3,
          insetInlineStart: checked ? 'calc(100% - 23px)' : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(15,23,42,0.22)',
          transition: 'inset-inline-start 0.15s ease',
          pointerEvents: 'none',
        }}
      />
    </button>
  )
}

function ActionBtn({ onClick, disabled, title, hue, children }) {
  const cols = {
    cyan:   { bg: 'rgba(14,165,233,0.09)',  border: 'rgba(14,165,233,0.28)',  color: '#38bdf8' },
    purple: { bg: 'rgba(168,85,247,0.09)', border: 'rgba(168,85,247,0.28)', color: '#c084fc' },
    red:    { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.26)',   color: '#f87171' },
    green:  { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.26)', color: '#34d399' },
  }
  const c = cols[hue] || cols.cyan
  return (
    <button
      className="tu-action"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 28, borderRadius: 6, flexShrink: 0,
        background: c.bg, border: `0.5px solid ${c.border}`,
        color: c.color, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function ProgressBar({ pct }) {
  if (pct >= 100) return null
  return (
    <div style={{ height: 3, borderRadius: 2, overflow: 'hidden', background: 'var(--t-border)', marginTop: 5 }}>
      <div style={{
        height: '100%', borderRadius: 2, width: `${pct}%`,
        background: 'linear-gradient(90deg,#a855f7,#0ea5e9)',
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// PublishStatusBadge  (replaces old StatusBadge for the publish column)
// ════════════════════════════════════════════════════════════════
function PublishStatusBadge({ file }) {
  const status = derivePublishStatus(file)
  const cfg    = PUBLISH_STATUS_CONFIG[status]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 500,
      color: cfg.color,
      background: cfg.bg,
      border: `0.5px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      {status === 'published' && <Icons.Check s={12} />}
      {status === 'scheduled' && <Icons.Clock s={12} />}
      {status === 'hidden'    && <Icons.XIcon s={12} />}
      {cfg.label}
    </span>
  )
}

// Parse status badge (unchanged role from original)
function ParseStatusBadge({ status }) {
  const colorMap = {
    pending: 'var(--t-muted)', parsing: 'var(--t-cyan)',
    done: 'var(--t-green)',    error: 'var(--t-red)',
  }
  const cfg   = PARSE_STATUS[status] || PARSE_STATUS.pending
  const color = colorMap[status] || colorMap.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 500, color,
      background: `color-mix(in srgb, ${color} 13%, transparent)`,
      border: `0.5px solid color-mix(in srgb, ${color} 35%, transparent)`,
      borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      {cfg.spin
        ? <Icons.Refresh s={12} cls="tu-spin" />
        : status === 'done'  ? <Icons.Check s={12} />
        : status === 'error' ? <Icons.XIcon s={12} />
        : <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      }
      {cfg.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════
// SubjectTabs
// ════════════════════════════════════════════════════════════════
function SubjectTabs({ active, onChange, counts }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0', marginBottom: 20 }}>
      {SUBJECTS.map(s => {
        const isActive = s.id === active
        const count    = s.id === 'all'
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : (counts[s.id] || 0)
        return (
          <button
            key={s.id}
            className="tu-tab"
            onClick={() => onChange(s.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 10,
              fontSize: 13, fontWeight: isActive ? 500 : 400,
              cursor: 'pointer',
              background:   isActive ? 'var(--t-tab-active)' : 'transparent',
              border:       isActive ? '0.5px solid rgba(168,85,247,0.45)' : '0.5px solid var(--t-border)',
              color:        isActive ? '#c084fc' : 'var(--t-text-sub)',
              borderBottom: isActive ? '2px solid #a855f7' : '2px solid transparent',
              boxShadow:    isActive ? '0 0 10px rgba(168,85,247,0.18)' : 'none',
              backdropFilter: 'var(--t-blur)',
            }}
          >
            {s.label}
            {count > 0 && (
              <span style={{
                background: isActive ? 'rgba(168,85,247,0.22)' : 'var(--t-border)',
                color: isActive ? '#c084fc' : 'var(--t-text-sub)',
                borderRadius: 20, padding: '1px 7px',
                fontSize: 11, fontWeight: 500,
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
// DropZone — enhanced with visibility toggle + DatePicker
// ════════════════════════════════════════════════════════════════
function DropZone({ selectedSubject, onSubjectChange, defaultVisible, onDefaultVisibleChange, defaultReleaseAt, onDefaultReleaseAtChange, onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const process = fs => {
    const valid = [...fs].filter(isValidFile)
    if (valid.length) onFiles(valid, selectedSubject, defaultVisible, defaultReleaseAt)
  }

  return (
    <div>
      {/* Subject selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
          上传至科目
        </label>
        <Select
          className="tu-subject-select"
          popupClassName="tu-subject-popup"
          suffixIcon={<span className="tu-select-chevron"><Icons.ChevronDown s={14} /></span>}
          value={selectedSubject}
          onChange={onSubjectChange}
          options={SUBJECTS
            .filter(s => s.id !== 'all')
            .map(s => ({ value: s.id, label: s.label }))}
          style={{
            width: 320,
          }}
        />
      </div>

      {/* Visibility + scheduled release defaults */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
            默认可见性
          </label>
          <div className="tu-switch-row">
            <VisibilityToggle
              checked={defaultVisible}
              onChange={onDefaultVisibleChange}
            />
            <span className="tu-switch-label">
              {defaultVisible ? '上传后学生立即可见' : '上传后默认隐藏'}
            </span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
            定时发布（可选）
          </label>
          <DatePicker
            className="tu-release-picker"
            classNames={{ popup: { root: 'tu-release-picker-dropdown' } }}
            showTime
            format="YYYY-MM-DD HH:mm"
            placeholder="选择发布时间"
            value={defaultReleaseAt ? dayjs(defaultReleaseAt) : null}
            onChange={val => onDefaultReleaseAtChange(toFutureTimestamp(val))}
            disabledDate={disabledReleaseDate}
            disabledTime={disabledReleaseTime}
            style={{
              background: 'var(--t-input-bg)',
              borderColor: 'var(--t-border-acc)',
              borderRadius: 10,
              minHeight: 38,
              minWidth: 194,
            }}
          />
          {defaultReleaseAt && (
            <p style={{ fontSize: 12, color: 'var(--t-amber)', margin: '4px 0 0' }}>
              将在 {fmtTs(defaultReleaseAt)} 自动对学生可见
            </p>
          )}
        </div>
      </div>

      {/* Drop area */}
      <div
        className={dragging ? 'tu-breathe' : ''}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); process(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12, minHeight: 168,
          borderRadius: 14,
          border: `1.5px dashed ${dragging ? 'rgba(168,85,247,0.75)' : 'var(--t-border-acc)'}`,
          background: dragging ? 'rgba(168,85,247,0.07)' : 'var(--t-drop-bg)',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          padding: '28px 20px', boxSizing: 'border-box',
        }}
      >
        <span style={{ color: dragging ? '#c084fc' : 'var(--t-purple)', opacity: dragging ? 1 : 0.65, transition: 'color 0.2s, opacity 0.2s' }}>
          <Icons.Upload s={36} />
        </span>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)', margin: '0 0 5px' }}>
            拖拽文件至此，或
            <span style={{ color: 'var(--t-purple)', marginLeft: 4, textDecoration: 'underline' }}>点击选择</span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: 0 }}>
            支持 PDF · PPTX · DOCX · TXT
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT.join(',')}
          onChange={e => { process(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// StatsBar
// ════════════════════════════════════════════════════════════════
function StatsBar({ files }) {
  const now = Date.now()
  const chips = [
    { label: '全部',   n: files.length,                                                              c: '#7dd3fc' },
    { label: '已发布', n: files.filter(f => derivePublishStatus(f, now) === 'published').length,     c: '#10b981' },
    { label: '待发布', n: files.filter(f => derivePublishStatus(f, now) === 'scheduled').length,     c: '#f59e0b' },
    { label: '已隐藏', n: files.filter(f => derivePublishStatus(f, now) === 'hidden').length,        c: '#94a3b8' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 18, flexWrap: 'wrap', padding: '8px 14px', marginBottom: 12,
      background: 'var(--t-row)', border: '0.5px solid var(--t-border)', borderRadius: 10,
    }}>
      {chips.map(({ label, n, c }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block', boxShadow: `0 0 5px ${c}99` }} />
          <span style={{ fontSize: 12, color: 'var(--t-text-sub)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t-text)' }}>{n}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TableHeader — now has 7 columns
// ════════════════════════════════════════════════════════════════
function TableHeader() {
  const th = (t, align = 'left') => (
    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-text-sub)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: align }}>
      {t}
    </span>
  )
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 80px 100px 110px 110px 140px',
      gap: 8, padding: '4px 14px 10px',
      borderBottom: '0.5px solid var(--t-border)', marginBottom: 5,
    }}>
      {th('文件名')}
      {th('科目', 'center')}
      {th('大小', 'right')}
      {th('解析', 'center')}
      {th('学生可见', 'center')}
      {th('发布状态', 'center')}
      {th('操作', 'right')}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FileRow — enhanced with visibility switch + scheduled release
// ════════════════════════════════════════════════════════════════
function FileRow({ item, onDelete, onReparse, onToggleVisible, onSetReleaseAt }) {
  const getBlobUrl = useTeacherStore(s => s.getBlobUrl)
  const [busy, setBusy]           = useState({ del: false, parse: false })
  const [showDatePicker, setShowDatePicker] = useState(false)

  const blobUrl   = getBlobUrl(item.id)
  const hasBlob   = !!item._blobAvailable && !!blobUrl
  const isParsing = item.status === 'parsing' || busy.parse

  const doOpen     = () => openBlob(blobUrl, item.name)
  const doDownload = () => downloadBlob(blobUrl, item.name)

  const doReparse = async () => {
    setBusy(b => ({ ...b, parse: true }))
    onReparse(item.id, 'parsing')
    await apiReparse(item.id)
    onReparse(item.id, 'done')
    setBusy(b => ({ ...b, parse: false }))
  }

  const doDelete = async () => {
    setBusy(b => ({ ...b, del: true }))
    await apiDelete(item.id)
    onDelete(item.id)
  }

  const publishStatus = derivePublishStatus(item)

  return (
    <div
      className="tu-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 80px 100px 110px 110px 140px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--t-row)',
        border: '0.5px solid var(--t-border)',
        marginBottom: 6,
        boxSizing: 'border-box',
      }}
    >
      {/* Filename */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ color: 'var(--t-cyan)', flexShrink: 0 }}><Icons.File s={13} /></span>
        <div style={{ minWidth: 0 }}>
          <button
            className="tu-fname"
            onClick={doOpen}
            title={hasBlob ? '点击预览' : '刷新后文件数据已释放'}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: hasBlob ? 'pointer' : 'default',
              fontSize: 13, fontWeight: 500,
              color: hasBlob ? 'var(--t-cyan)' : 'var(--t-text)',
              textDecoration: hasBlob ? 'underline' : 'none',
              textDecorationColor: 'rgba(14,165,233,0.40)',
              textUnderlineOffset: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '100%', textAlign: 'left',
              display: 'block',
            }}
          >
            {item.name}
          </button>
          {item.releaseAt && publishStatus === 'scheduled' && (
            <span style={{ fontSize: 11, color: 'var(--t-amber)', display: 'block', marginTop: 2 }}>
              {fmtTs(item.releaseAt)} 发布
            </span>
          )}
        </div>
      </div>

      {/* Subject pill */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 20,
          background: 'rgba(168,85,247,0.10)', border: '0.5px solid rgba(168,85,247,0.25)',
          color: '#c084fc', whiteSpace: 'nowrap', maxWidth: 72,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {SUBJECT_MAP[item.subject] || item.subject}
        </span>
      </div>

      {/* Size */}
      <span style={{ fontSize: 12, color: 'var(--t-text-sub)', textAlign: 'right' }}>
        {fmtSz(item.size)}
      </span>

      {/* Parse status */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ParseStatusBadge status={item.status} />
      </div>

      {/* Visibility switch */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexDirection: 'column', alignItems: 'center' }}>
        <VisibilityToggle
          checked={item.isVisible}
          onChange={val => onToggleVisible(item.id, val)}
        />
        <Tooltip
          title={item.releaseAt
            ? (showDatePicker ? '点击取消计划' : '修改发布时间')
            : '设置定时发布'
          }
        >
          <button
            onClick={() => setShowDatePicker(v => !v)}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: item.releaseAt ? 'var(--t-amber)' : 'var(--t-text-sub)',
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
            }}
          >
            <Icons.Clock s={11} />
            {item.releaseAt ? '已计划' : '定时'}
          </button>
        </Tooltip>
        {showDatePicker && (
          <DatePicker
            className="tu-release-picker"
            classNames={{ popup: { root: 'tu-release-picker-dropdown' } }}
            showTime
            format="MM-DD HH:mm"
            size="small"
            open
            value={item.releaseAt ? dayjs(item.releaseAt) : null}
            onChange={val => {
              onSetReleaseAt(item.id, toFutureTimestamp(val))
              setShowDatePicker(false)
            }}
            onOpenChange={open => { if (!open) setShowDatePicker(false) }}
            disabledDate={disabledReleaseDate}
            disabledTime={disabledReleaseTime}
            style={{ position: 'absolute', zIndex: 999, display: 'none' }}
            getPopupContainer={t => t.parentNode}
          />
        )}
      </div>

      {/* Publish status badge */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PublishStatusBadge file={item} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <ActionBtn onClick={doOpen}     disabled={!hasBlob}  title="预览文件" hue="cyan">
          <Icons.Eye s={12} />
        </ActionBtn>
        <ActionBtn onClick={doDownload} disabled={!hasBlob}  title="下载文件" hue="purple">
          <Icons.Download s={12} />
        </ActionBtn>
        <ActionBtn onClick={doReparse}  disabled={isParsing} title="重新解析" hue="green">
          <Icons.Refresh s={12} cls={isParsing ? 'tu-spin' : ''} />
        </ActionBtn>
        <ActionBtn onClick={doDelete}   disabled={busy.del}  title="删除文件" hue="red">
          <Icons.Trash s={12} />
        </ActionBtn>
      </div>

      {/* Progress bar spanning full width */}
      {item.progress < 100 && (
        <div style={{ gridColumn: '1/-1', marginTop: -3 }}>
          <ProgressBar pct={item.progress} />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// EmptyState
// ════════════════════════════════════════════════════════════════
function EmptyState({ subject }) {
  const label = subject === 'all' ? '暂无上传文件' : `「${SUBJECT_MAP[subject]}」暂无资料`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '42px 0', color: 'var(--t-text-sub)' }}>
      <Icons.Empty s={46} />
      <p style={{ fontSize: 13, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 12, margin: 0, opacity: 0.6 }}>请在上方上传区选择对应科目后上传文件</p>
    </div>
  )
}

function GenerateButton({ onClick, disabled, busy, accent, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        minWidth: 144,
        height: 40,
        padding: '0 16px',
        borderRadius: 12,
        border: `1px solid ${accent}`,
        background: busy ? `${accent}22` : `${accent}14`,
        color: disabled ? 'var(--t-text-sub)' : '#f8fafc',
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: busy ? `0 0 18px ${accent}33` : 'none',
        opacity: disabled ? 0.55 : 1,
        transition: 'all 0.18s ease',
      }}
    >
      {busy ? '处理中...' : children}
    </button>
  )
}

function KnowledgeGraphSummary({ result }) {
  if (!result) return null

  const chips = [
    { label: '知识点', value: `${result.node_count} 个`, color: '#22c55e' },
    { label: '依赖关系', value: `${result.edge_count} 条`, color: '#38bdf8' },
    { label: '路径节点', value: `${result.path_preview.length} 个`, color: '#f59e0b' },
    { label: '保存状态', value: result.persisted ? '已写入' : '仅预览', color: '#c084fc' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 10,
      marginBottom: 16,
    }}>
      {chips.map(chip => (
        <div
          key={chip.label}
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            border: `0.5px solid ${chip.color}33`,
            background: `${chip.color}14`,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t-text-sub)', marginBottom: 6 }}>{chip.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{chip.value}</div>
        </div>
      ))}
    </div>
  )
}

function GraphNodePreviewCard({ node }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 14,
      border: '0.5px solid var(--t-border)',
      background: 'var(--t-row)',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(56,189,248,0.12)',
          border: '0.5px solid rgba(56,189,248,0.28)',
        }}>
          第 {node.chapter || 0} 章
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(245,158,11,0.12)',
          border: '0.5px solid rgba(245,158,11,0.28)',
        }}>
          难度 {node.difficulty}
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(192,132,252,0.12)',
          border: '0.5px solid rgba(192,132,252,0.28)',
        }}>
          {node.id}
        </span>
      </div>

      <div style={{
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.55,
        color: 'var(--t-text)',
        marginBottom: 8,
      }}>
        {node.name}
      </div>

      <div style={{
        fontSize: 12,
        color: 'var(--t-text-sub)',
        marginBottom: 8,
      }}>
        {node.category || '未分类'} · 预计 {node.estimated_minutes || 30} 分钟
      </div>

      <div style={{
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--t-text-sub)',
      }}>
        {node.description || '暂无描述'}
      </div>
    </div>
  )
}

function PathPreviewList({ items }) {
  if (!items?.length) return null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.slice(0, 8).map((item, index) => (
        <div
          key={item.id}
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: '0.5px solid var(--t-border)',
            background: item.recommended
              ? 'rgba(34,197,94,0.10)'
              : 'rgba(255,255,255,0.02)',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>
              {index + 1}. {item.name}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--t-text-sub)' }}>第 {item.chapter || 0} 章</span>
              <span style={{ fontSize: 11, color: item.recommended ? '#22c55e' : 'var(--t-text-sub)' }}>
                {item.recommended ? '推荐重点' : item.status}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-sub)', lineHeight: 1.6 }}>
            {item.description || '暂无描述'}
          </div>
        </div>
      ))}
    </div>
  )
}

function KnowledgeGraphPanel({
  subjects,
  currentSubject,
}) {
  const [subjectId, setSubjectId] = useState(() => resolvePreferredSubjectId(subjects, currentSubject))
  const [sourceText, setSourceText] = useState('')
  const [expectedNodeCountDraft, setExpectedNodeCountDraft] = useState('15')
  const [requestState, setRequestState] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!subjects.some(subject => subject.id === subjectId)) {
      setSubjectId(resolvePreferredSubjectId(subjects, currentSubject))
    }
  }, [subjects, currentSubject, subjectId])

  const expectedNodeCount = clampNodeCount(expectedNodeCountDraft)

  const commitExpectedNodeCount = useCallback(() => {
    setExpectedNodeCountDraft(String(clampNodeCount(expectedNodeCountDraft)))
  }, [expectedNodeCountDraft])

  const canSubmit = !!subjectId && sourceText.trim().length >= 20

  const runGeneration = useCallback(async (persist) => {
    if (!canSubmit) {
      message.warning('请先填写至少 20 个字符的课程说明、教学目标或章节大纲')
      return
    }

    const subject = subjects.find(item => item.id === subjectId)
    const normalizedExpectedNodeCount = clampNodeCount(expectedNodeCountDraft)
    setExpectedNodeCountDraft(String(normalizedExpectedNodeCount))
    setRequestState(persist ? 'persist' : 'preview')

    try {
      const response = await generateKnowledgeGraph({
        subject_id: subjectId,
        subject_name: subject?.label || subjectId,
        source_text: sourceText.trim(),
        expected_node_count: normalizedExpectedNodeCount,
        persist,
      })

      setResult(response.data)
      message.success(
        persist
          ? `知识图谱已保存，共写入 ${response.data.node_count} 个知识点`
          : `已生成 ${response.data.node_count} 个知识点的预览图谱`
      )
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      setRequestState('')
    }
  }, [canSubmit, expectedNodeCountDraft, sourceText, subjectId, subjects])

  return (
    <Card accent="rgba(56,189,248,0.18)" mb={20}>
      <SectionLabel>AI 生成知识图谱与学习路径</SectionLabel>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 18,
        marginBottom: 18,
      }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', display: 'block', marginBottom: 8 }}>
            目标科目
          </label>
          <Select
            value={subjectId}
            onChange={value => setSubjectId(value)}
            options={subjects.map(subject => ({ value: subject.id, label: subject.label }))}
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
            AI 会先生成标准知识图谱，再自动推导一版默认学习路径预览。
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)' }}>
              目标知识点数量
            </label>
            <span style={{ fontSize: 11, color: 'var(--t-text-sub)' }}>
              最小值 5，到下限后不可继续删除
            </span>
          </div>
          <input
            type="number"
            min="5"
            max="80"
            value={expectedNodeCountDraft}
            onChange={event => setExpectedNodeCountDraft(previousValue => (
              keepMinimumOnDelete(event.target.value, previousValue, 5)
            ))}
            onBlur={commitExpectedNodeCount}
            style={{
              width: '100%',
              height: 40,
              borderRadius: 10,
              border: '0.5px solid var(--t-border-acc)',
              background: 'var(--t-input-bg)',
              color: 'var(--t-text)',
              padding: '0 12px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
            建议先从 10 到 18 个知识点开始，预览结构合理后再继续细化。
          </p>
        </div>
      </div>

      <div style={{ marginBottom: result ? 18 : 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', display: 'block', marginBottom: 8 }}>
          课程说明 / 教学目标 / 章节大纲
        </label>
        <textarea
          value={sourceText}
          onChange={event => setSourceText(event.target.value)}
          placeholder={'例如：\n1. 第1章：程序设计基础，介绍程序、算法、流程图、变量与数据类型。\n2. 第2章：顺序结构与输入输出，掌握 printf/scanf。\n3. 第3章：选择结构与循环结构。\n4. 第4章：数组、函数、指针。\n5. 课程目标：能完成基础 C 语言程序设计与调试。'}
          style={{
            width: '100%',
            minHeight: 180,
            resize: 'vertical',
            borderRadius: 14,
            border: '0.5px solid var(--t-border-acc)',
            background: 'var(--t-input-bg)',
            color: 'var(--t-text)',
            padding: '12px 14px',
            boxSizing: 'border-box',
            lineHeight: 1.7,
            fontSize: 13,
          }}
        />
        <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
          文本越具体，AI 生成的章节划分、依赖关系和默认学习路径越稳定。
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: result ? 18 : 0 }}>
        <GenerateButton
          onClick={() => runGeneration(false)}
          disabled={!canSubmit}
          busy={requestState === 'preview'}
          accent="#38bdf8"
        >
          预览图谱
        </GenerateButton>
        <GenerateButton
          onClick={() => runGeneration(true)}
          disabled={!canSubmit}
          busy={requestState === 'persist'}
          accent="#22c55e"
        >
          保存图谱并更新路径
        </GenerateButton>
      </div>

      {result && (
        <div style={{ marginTop: 18 }}>
          <KnowledgeGraphSummary result={result} />

          {!!result.warnings?.length && (
            <div style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              border: '0.5px solid rgba(245,158,11,0.28)',
              background: 'rgba(245,158,11,0.10)',
              color: 'var(--t-text-sub)',
              fontSize: 12,
              lineHeight: 1.7,
            }}>
              {result.warnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>• {warning}</div>
              ))}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}>
            <div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>
                  知识图谱预览
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text-sub)', marginTop: 4 }}>
                  {result.subject_name} · 仅展示前 6 个知识点
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {(result.graph?.nodes || []).slice(0, 6).map(node => (
                  <GraphNodePreviewCard key={node.id} node={node} />
                ))}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>
                  默认学习路径预览
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text-sub)', marginTop: 4 }}>
                  保存后，学习路径页会基于这份图谱继续做个性化排序
                </div>
              </div>
              <PathPreviewList items={result.path_preview || []} />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function QuestionBankSummary({ result, selectedCount, usingAllKnowledgePoints }) {
  if (!result) return null

  const chips = [
    { label: '已生成', value: `${result.generated_count} 题`, color: '#22c55e' },
    { label: '已入库', value: `${result.persisted_count} 题`, color: '#38bdf8' },
    { label: '已替换', value: `${result.replaced_count} 题`, color: '#f59e0b' },
    {
      label: '范围',
      value: usingAllKnowledgePoints
        ? `全科目 ${result.knowledge_points.length} 个知识点`
        : `${selectedCount || result.knowledge_points.length} 个知识点`,
      color: '#c084fc',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 10,
      marginBottom: 16,
    }}>
      {chips.map(chip => (
        <div
          key={chip.label}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: `0.5px solid ${chip.color}55`,
            background: `${chip.color}12`,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t-text-sub)', marginBottom: 4 }}>{chip.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{chip.value}</div>
        </div>
      ))}
    </div>
  )
}

function QuestionPreviewCard({ item, index }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 14,
      border: '0.5px solid var(--t-border)',
      background: 'var(--t-row)',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#c084fc',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          第 {index + 1} 题
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(56,189,248,0.12)',
          border: '0.5px solid rgba(56,189,248,0.28)',
        }}>
          {item.knowledge_point_id}
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          color: 'var(--t-text-sub)',
          background: 'rgba(245,158,11,0.12)',
          border: '0.5px solid rgba(245,158,11,0.28)',
        }}>
          难度 {item.difficulty}
        </span>
      </div>

      <div style={{
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.65,
        color: 'var(--t-text)',
        whiteSpace: 'pre-wrap',
        marginBottom: 12,
      }}>
        {item.question_text}
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {Object.entries(item.options || {}).map(([key, value]) => {
          const isAnswer = key === item.correct_answer
          return (
            <div
              key={key}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: isAnswer
                  ? '0.5px solid rgba(34,197,94,0.40)'
                  : '0.5px solid var(--t-border)',
                background: isAnswer
                  ? 'rgba(34,197,94,0.10)'
                  : 'rgba(255,255,255,0.02)',
                color: 'var(--t-text)',
                fontSize: 13,
              }}
            >
              <strong style={{ color: isAnswer ? '#22c55e' : 'var(--t-text-sub)' }}>{key}.</strong>{' '}
              {value}
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(192,132,252,0.10)',
        border: '0.5px solid rgba(192,132,252,0.22)',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--t-text-sub)',
      }}>
        <strong style={{ color: '#c084fc' }}>解析：</strong>
        {item.explanation || '暂无解析'}
      </div>
    </div>
  )
}

function QuestionBankPanel({
  subjects,
  currentSubject,
}) {
  const [subjectId, setSubjectId] = useState(() => resolvePreferredSubjectId(subjects, currentSubject))
  const [knowledgePoints, setKnowledgePoints] = useState([])
  const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState([])
  const [useAllKnowledgePoints, setUseAllKnowledgePoints] = useState(false)
  const [questionsPerPointDraft, setQuestionsPerPointDraft] = useState('3')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState('')
  const [requestState, setRequestState] = useState('')
  const [result, setResult] = useState(null)
  const [showAllQuestions, setShowAllQuestions] = useState(false)

  useEffect(() => {
    if (!subjects.some(subject => subject.id === subjectId)) {
      setSubjectId(resolvePreferredSubjectId(subjects, currentSubject))
    }
  }, [subjects, currentSubject, subjectId])

  useEffect(() => {
    let cancelled = false

    const loadGraph = async () => {
      setGraphLoading(true)
      setGraphError('')

      try {
        const response = await getGraph(subjectId)
        if (cancelled) return

        const nodes = [...(response.data?.nodes || [])].sort((a, b) => (
          (a.chapter || 0) - (b.chapter || 0)
          || (a.difficulty || 0) - (b.difficulty || 0)
          || String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-CN')
        ))

        setKnowledgePoints(nodes)
        setSelectedKnowledgePointIds(prev => prev.filter(id => nodes.some(node => node.id === id)))
        setResult(null)
        setShowAllQuestions(false)

        if (!nodes.length) {
          setGraphError('当前科目还没有知识图谱数据，暂时不能直接生成题库。')
        }
      } catch (error) {
        if (cancelled) return
        setKnowledgePoints([])
        setSelectedKnowledgePointIds([])
        setResult(null)
        setGraphError(getApiErrorMessage(error))
      } finally {
        if (!cancelled) setGraphLoading(false)
      }
    }

    if (subjectId) loadGraph()

    return () => {
      cancelled = true
    }
  }, [subjectId])

  const knowledgePointOptions = useMemo(() => (
    knowledgePoints.map(node => ({
      value: node.id,
      label: `第 ${node.chapter || 0} 章 · ${node.name || node.id} (${node.id})`,
    }))
  ), [knowledgePoints])

  const questionsPerPoint = clampQuestionCount(questionsPerPointDraft)

  const commitQuestionsPerPoint = useCallback(() => {
    setQuestionsPerPointDraft(String(clampQuestionCount(questionsPerPointDraft)))
  }, [questionsPerPointDraft])

  const selectedCount = useAllKnowledgePoints
    ? knowledgePoints.length
    : selectedKnowledgePointIds.length

  const canSubmit = !!subjectId
    && knowledgePoints.length > 0
    && (useAllKnowledgePoints || selectedKnowledgePointIds.length > 0)
    && !graphLoading
  const previewQuestions = showAllQuestions
    ? result?.questions || []
    : (result?.questions || []).slice(0, 6)

  const runGeneration = useCallback(async (persist) => {
    if (!canSubmit) {
      message.warning(
        graphLoading
          ? '知识点还在加载中，请稍等一下'
          : '请先选择至少一个知识点，或勾选“使用该科目全部知识点”'
      )
      return
    }

    setRequestState(persist ? 'persist' : 'preview')
    try {
      const normalizedQuestionsPerPoint = clampQuestionCount(questionsPerPointDraft)
      setQuestionsPerPointDraft(String(normalizedQuestionsPerPoint))
      const response = await generateQuestionBank({
        subject_id: subjectId,
        knowledge_point_ids: useAllKnowledgePoints ? [] : selectedKnowledgePointIds,
        questions_per_point: normalizedQuestionsPerPoint,
        persist,
        replace_existing: replaceExisting,
      })

      setResult(response.data)
      setShowAllQuestions((response.data.questions || []).length <= 6)
      message.success(
        persist
          ? `题库已更新，成功写入 ${response.data.persisted_count} 道题`
          : `已生成 ${response.data.generated_count} 道题预览`
      )
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      setRequestState('')
    }
  }, [
    canSubmit,
    graphLoading,
    questionsPerPointDraft,
    replaceExisting,
    selectedKnowledgePointIds,
    subjectId,
    useAllKnowledgePoints,
  ])

  return (
    <Card accent="rgba(16,185,129,0.18)" mb={20}>
      <SectionLabel>AI 生成题库</SectionLabel>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 18,
        marginBottom: 18,
      }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', display: 'block', marginBottom: 8 }}>
            目标科目
          </label>
          <Select
            value={subjectId}
            onChange={value => setSubjectId(value)}
            options={subjects.map(subject => ({ value: subject.id, label: subject.label }))}
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
            题目会根据该科目的知识图谱逐个知识点生成。当前只对已配置知识图谱的科目可用。
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)' }}>
              每个知识点题量
            </label>
            <span style={{ fontSize: 11, color: 'var(--t-text-sub)' }}>
              最小值 1，到下限后不可继续删除
            </span>
          </div>
          <input
            type="number"
            min="1"
            max="10"
            value={questionsPerPointDraft}
            onChange={event => setQuestionsPerPointDraft(previousValue => (
              keepMinimumOnDelete(event.target.value, previousValue, 1)
            ))}
            onBlur={commitQuestionsPerPoint}
            style={{
              width: '100%',
              height: 40,
              borderRadius: 10,
              border: '0.5px solid var(--t-border-acc)',
              background: 'var(--t-input-bg)',
              color: 'var(--t-text)',
              padding: '0 12px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
            建议先从 2 到 3 题开始，小批量看效果，再决定是否整门课批量生成。
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--t-text)',
        }}>
          <input
            type="checkbox"
            checked={useAllKnowledgePoints}
            onChange={event => setUseAllKnowledgePoints(event.target.checked)}
          />
          使用该科目全部知识点
        </label>

        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--t-text)',
        }}>
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={event => setReplaceExisting(event.target.checked)}
          />
          替换同知识点旧题
        </label>

        <span style={{
          fontSize: 12,
          color: selectedCount > 0 ? '#34d399' : 'var(--t-text-sub)',
        }}>
          当前将处理 {selectedCount || 0} 个知识点
        </span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-sub)', display: 'block', marginBottom: 8 }}>
          指定知识点
        </label>
        <Select
          mode="multiple"
          allowClear
          disabled={useAllKnowledgePoints || graphLoading || !knowledgePoints.length}
          value={selectedKnowledgePointIds}
          onChange={setSelectedKnowledgePointIds}
          options={knowledgePointOptions}
          placeholder={
            graphLoading
              ? '知识图谱加载中...'
              : useAllKnowledgePoints
                ? '已切换为全知识点模式'
                : '请选择一个或多个知识点'
          }
          maxTagCount="responsive"
          style={{ width: '100%' }}
        />
        {graphError && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '8px 0 0', lineHeight: 1.6 }}>
            {graphError}
          </p>
        )}
        {!graphError && !graphLoading && !!knowledgePoints.length && (
          <p style={{ fontSize: 12, color: 'var(--t-text-sub)', margin: '8px 0 0', lineHeight: 1.6 }}>
            当前科目共 {knowledgePoints.length} 个知识点。未勾选“全部知识点”时，需要手动选择至少一个知识点才能生成。
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: result ? 18 : 0 }}>
        <GenerateButton
          onClick={() => runGeneration(false)}
          disabled={!canSubmit}
          busy={requestState === 'preview'}
          accent="#38bdf8"
        >
          预览生成
        </GenerateButton>
        <GenerateButton
          onClick={() => runGeneration(true)}
          disabled={!canSubmit}
          busy={requestState === 'persist'}
          accent="#22c55e"
        >
          生成并入库
        </GenerateButton>
      </div>

      {result && (
        <div style={{ marginTop: 18 }}>
          <QuestionBankSummary
            result={result}
            selectedCount={selectedCount}
            usingAllKnowledgePoints={useAllKnowledgePoints}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>
                最近一次生成结果
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text-sub)', marginTop: 4 }}>
                {result.subject_name} · 共返回 {result.questions.length} 道题
              </div>
            </div>
            {result.questions.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllQuestions(current => !current)}
                style={{
                  border: '0.5px solid rgba(56,189,248,0.28)',
                  background: 'rgba(56,189,248,0.10)',
                  color: '#7dd3fc',
                  borderRadius: 999,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {showAllQuestions ? '收起为前 6 道' : `显示全部 ${result.questions.length} 道`}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {previewQuestions.map((item, index) => (
              <QuestionPreviewCard key={`${item.knowledge_point_id}-${index}`} item={item} index={index} />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════
// Main page component
// ════════════════════════════════════════════════════════════════
export default function TeacherUpload() {
  const files        = useTeacherStore(s => s.files)
  const addFile      = useTeacherStore(s => s.addFile)
  const updateFile   = useTeacherStore(s => s.updateFile)
  const removeFile   = useTeacherStore(s => s.removeFile)
  const registerBlob = useTeacherStore(s => s.registerBlob)
  const subjects     = useUserStore(s => s.subjects)
  const currentSubject = useUserStore(s => s.currentSubject)

  const aiSubjects = useMemo(
    () => subjects.filter(subject => subject.id !== 'all'),
    [subjects],
  )
  const uploadSubjects = useMemo(
    () => SUBJECTS.filter(subject => subject.id !== 'all'),
    [],
  )
  const preferredSubjectId = useMemo(
    () => resolvePreferredSubjectId(aiSubjects, currentSubject),
    [aiSubjects, currentSubject],
  )
  const preferredUploadSubjectId = useMemo(
    () => resolvePreferredSubjectId(uploadSubjects, currentSubject),
    [currentSubject, uploadSubjects],
  )

  const [activeTab,         setActiveTab]         = useState('all')
  const [uploadSubject,     setUploadSubject]      = useState(preferredUploadSubjectId)
  const [defaultVisible,    setDefaultVisible]     = useState(true)
  const [defaultReleaseAt,  setDefaultReleaseAt]   = useState(null)

  useEffect(() => { injectCSS() })
  useEffect(() => {
    if (!SUBJECTS.some(subject => subject.id === uploadSubject) && preferredUploadSubjectId) {
      setUploadSubject(preferredUploadSubjectId)
    }
  }, [preferredUploadSubjectId, uploadSubject])

  const subjectCounts = useMemo(() => {
    const counts = {}
    files.forEach(f => { counts[f.subject] = (counts[f.subject] || 0) + 1 })
    return counts
  }, [files])

  const visibleFiles = useMemo(() => (
    activeTab === 'all' ? files : files.filter(f => f.subject === activeTab)
  ), [files, activeTab])

  const simulateParse = useCallback(id => {
    setTimeout(() => {
      updateFile(id, { status: 'parsing' })
      setTimeout(() => { updateFile(id, { status: 'done' }) }, 1600 + Math.random() * 1200)
    }, 500)
  }, [updateFile])

  const onFiles = useCallback(async (rawFiles, subject, isVisible, releaseAt) => {
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
        isVisible:      isVisible,
        releaseAt:      releaseAt || null,
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

  const onDelete        = useCallback(id => removeFile(id), [removeFile])
  const onReparse       = useCallback((id, status) => updateFile(id, { status }), [updateFile])
  const onToggleVisible = useCallback((id, val) => updateFile(id, { isVisible: val }), [updateFile])
  const onSetReleaseAt  = useCallback((id, ts) => updateFile(id, { releaseAt: ts }), [updateFile])

  return (
    <div className="teacher-upload-page" style={{
      minHeight: '100%',
      padding: '26px 22px',
      fontFamily: 'inherit',
      fontWeight: 400,
      color: 'var(--t-text)',
      boxSizing: 'border-box',
      transition: 'color 0.2s',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontSize: 20, fontWeight: 600, margin: '0 0 5px',
          background: 'linear-gradient(90deg,#c084fc,#38bdf8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block',
        }}>
          课程资料管理
        </h1>
        <p style={{ fontSize: 13, color: 'var(--t-text-sub)', margin: 0, lineHeight: 1.75, maxWidth: 600 }}>
          上传课程资料后，您也可以直接在下方粘贴章节大纲，让 AI 生成知识图谱、默认学习路径和课后练习。文件仍可单独控制学生可见性，或设置定时发布。
        </p>
      </div>

      {/* Upload card */}
      <Card accent="rgba(168,85,247,0.18)" mb={20}>
        <SectionLabel>上传文件</SectionLabel>
        <DropZone
          selectedSubject={uploadSubject}
          onSubjectChange={setUploadSubject}
          defaultVisible={defaultVisible}
          onDefaultVisibleChange={setDefaultVisible}
          defaultReleaseAt={defaultReleaseAt}
          onDefaultReleaseAtChange={setDefaultReleaseAt}
          onFiles={(files, subject) => onFiles(files, subject, defaultVisible, defaultReleaseAt)}
        />
      </Card>

      <KnowledgeGraphPanel
        subjects={aiSubjects}
        currentSubject={currentSubject}
      />

      <QuestionBankPanel
        subjects={aiSubjects}
        currentSubject={currentSubject}
      />

      {/* Subject filter tabs */}
      <SubjectTabs active={activeTab} onChange={setActiveTab} counts={subjectCounts} />

      {/* File list card */}
      <Card accent="rgba(14,165,233,0.15)" mb={0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SectionLabel>
            {activeTab === 'all'
              ? `文件列表（${files.length}）`
              : `${SUBJECT_MAP[activeTab]}（${visibleFiles.length}）`
            }
          </SectionLabel>
        </div>

        {visibleFiles.length > 0 && <StatsBar files={visibleFiles} />}

        {visibleFiles.length === 0
          ? <EmptyState subject={activeTab} />
          : (
            <>
              <TableHeader />
              {visibleFiles.map(item => (
                <FileRow
                  key={item.id}
                  item={item}
                  onDelete={onDelete}
                  onReparse={onReparse}
                  onToggleVisible={onToggleVisible}
                  onSetReleaseAt={onSetReleaseAt}
                />
              ))}
            </>
          )
        }
      </Card>
    </div>
  )
}
