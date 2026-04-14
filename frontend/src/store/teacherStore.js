// frontend/src/store/teacherStore.js
//
// Persistence model:
//   metadata (name, size, status, subject …) → localStorage (JSON-safe)
//   blob binary                              → in-memory Map (session only)
//
// On page refresh: metadata rows survive, blob is gone (_blobAvailable=false).
// When backend is wired: replace blobRegistry with server-side file URLs.

import { create } from 'zustand'

const LS_KEY = 'cyberlinkage_teacher_files_v2'

// In-memory blob registry: id → { blob: File, objectUrl: string }
const blobRegistry = new Map()

// ── localStorage helpers ─────────────────────────────────────────

function loadMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw)
    // On reload all blobs are gone — reflect that in the flag
    return rows.map(r => ({ ...r, _blobAvailable: false }))
  } catch {
    return []
  }
}

function saveMeta(files) {
  try {
    const safe = files.map(({ _blobAvailable, ...rest }) => ({
      ...rest,
      _blobAvailable: false,   // blobs don't survive serialisation
    }))
    localStorage.setItem(LS_KEY, JSON.stringify(safe))
  } catch {}
}

// ── Store ────────────────────────────────────────────────────────
const useTeacherStore = create((set, get) => ({
  files: loadMeta(),

  // persist current state to localStorage
  _save() { saveMeta(get().files) },

  // Register a File/Blob so open/download work within the session
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

  // ── CRUD ───────────────────────────────────────────────────────

  addFile(meta) {
    set(s => ({ files: [meta, ...s.files] }))
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