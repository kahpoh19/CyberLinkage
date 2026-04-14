/**
 * useFileAccess — student-side visibility filter hook
 *
 * Rules:
 *   A file is visible to students when ALL of the following hold:
 *   1. isVisible === true
 *   2. releaseAt is null/undefined  OR  Date.now() >= releaseAt
 *
 * Usage:
 *   const visibleFiles = useFileAccess(allFiles)
 *
 *   // Or use the plain function without React:
 *   const visible = filterFilesForStudent(allFiles)
 */

import { useMemo } from 'react'

/**
 * Pure filter — no React dependency.
 * @param {Array} files  — raw file array from store / API
 * @param {number} [now] — override current time (ms), defaults to Date.now()
 * @returns {Array}      — files the student is allowed to see
 */
export function filterFilesForStudent(files = [], now = Date.now()) {
  return files.filter(file => {
    if (!file.isVisible) return false
    if (file.releaseAt == null) return true
    return now >= new Date(file.releaseAt).getTime()
  })
}

/**
 * React hook wrapping filterFilesForStudent.
 * Re-evaluates whenever `files` changes.  If you need real-time countdown
 * accuracy, pass a `tick` value (e.g. from a setInterval) as the second arg.
 *
 * @param {Array}  files — raw file array
 * @param {number} [tick] — optional live clock value to trigger re-memoization
 * @returns {Array} — filtered files visible to the student right now
 */
export function useFileAccess(files = [], tick = null) {
  return useMemo(() => {
    void tick  // reactive dependency
    return filterFilesForStudent(files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, tick])
}