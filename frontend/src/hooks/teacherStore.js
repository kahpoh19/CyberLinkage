// frontend/src/store/teacherStore.js
//
// Persistence model:
//   metadata (name, size, status, subject, isVisible, releaseAt …) → localStorage
//   blob binary → in-memory Map (session only)
//
// New fields vs original:
//   isVisible  : boolean  — teacher toggle; controls student visibility
//   releaseAt  : number|null — ms timestamp; null means "no schedule"

import { create } from 'zustand'

const LS_KEY = 'cyberlinkage_teacher_files_v2'

const blobRegistry = new Map()

function loadMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw)
    return rows.map(r => ({
      isVisible: true,   // default for legacy rows that predate this field
      releaseAt: null,   // default for legacy rows
      ...r,
      _blobAvailable: false,
    }))
  } catch {
    return []
  }
}

function saveMeta(files) {
  try {
    const safe = files.map(({ _blobAvailable, ...rest }) => ({
      ...rest,
      _blobAvailable: false,
    }))
    localStorage.setItem(LS_KEY, JSON.stringify(safe))
  } catch {}
}

const useTeacherStore = create((set, get) => ({
  files: loadMeta(),

  _save() {
    saveMeta(get().files)
  },

  registerBlob(id, file) {
    if (blobRegistry.has(id)) {
      URL.revokeObjectURL(blobRegistry.get(id).objectUrl)
    }
    const objectUrl = URL.createObjectURL(file)
    blobRegistry.set(id, { blob: file, objectUrl })
    set(s => ({
      files: s.files.map(f =>
        f.id === id ? { ...f, _blobAvailable: true } : f
      ),
    }))
    get()._save()
  },

  getBlobUrl(id) {
    return blobRegistry.get(id)?.objectUrl ?? null
  },

  addFile(meta) {
    // Ensure new fields always present even if caller omits them
    const normalized = {
      isVisible: true,
      releaseAt: null,
      ...meta,
    }
    set(s => ({ files: [normalized, ...s.files] }))
    get()._save()
  },

  updateFile(id, patch) {
    set(s => ({
      files: s.files.map(f => f.id === id ? { ...f, ...patch } : f),
    }))
    get()._save()
  },

  removeFile(id) {
    if (blobRegistry.has(id)) {
      URL.revokeObjectURL(blobRegistry.get(id).objectUrl)
      blobRegistry.delete(id)
    }
    set(s => ({ files: s.files.filter(f => f.id !== id) }))
    get()._save()
  },

  clearAll() {
    blobRegistry.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl))
    blobRegistry.clear()
    set({ files: [] })
    localStorage.removeItem(LS_KEY)
  },
}))

export default useTeacherStore