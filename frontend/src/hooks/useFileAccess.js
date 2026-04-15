// frontend/src/hooks/useFileAccess.js
//
// 学生端可见性过滤逻辑。
//
// 规则：同时满足以下两条，文件才对学生可见：
//   1. isVisible === true
//   2. releaseAt 为 null/undefined，或者当前时间 >= releaseAt
//
// ─── 使用示例 ────────────────────────────────────────────────
//
// 基础用法（文件列表变化时重新计算）：
//   import { useFileAccess } from '@/hooks/useFileAccess'
//   const visibleFiles = useFileAccess(allFiles)
//
// 实时倒计时用法（每分钟重新评估，已到期文件自动解锁）：
//   const [tick, setTick] = useState(Date.now())
//   useEffect(() => {
//     const id = setInterval(() => setTick(Date.now()), 60_000)
//     return () => clearInterval(id)
//   }, [])
//   const visibleFiles = useFileAccess(allFiles, tick)
//
// 非 React 环境（中间件、服务端、测试）：
//   import { filterFilesForStudent } from '@/hooks/useFileAccess'
//   const visible = filterFilesForStudent(allFiles)

import { useMemo } from 'react'

/**
 * 纯函数版本，无 React 依赖。
 *
 * @param {Array}  files - 文件对象数组，每项需含 isVisible、releaseAt 字段
 * @param {number} [now] - 当前时间戳（ms），默认 Date.now()，可在测试中覆盖
 * @returns {Array} 过滤后学生可见的文件列表
 */
export function filterFilesForStudent(files = [], now = Date.now()) {
  return files.filter(file => {
    if (!file.isVisible) return false
    if (file.releaseAt == null) return true
    return now >= new Date(file.releaseAt).getTime()
  })
}

/**
 * React Hook 版本。
 * 当 files 引用或 tick 变化时重新计算，其余情况命中 memo 缓存。
 *
 * @param {Array}       files - 原始文件数组（来自 teacherStore 或 API）
 * @param {number|null} [tick] - 可选的时钟值，用于触发实时倒计时重算
 * @returns {Array} 当前时刻学生可见的文件列表
 */
export function useFileAccess(files = [], tick = null) {
  return useMemo(() => {
    void tick
    return filterFilesForStudent(files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, tick])
}