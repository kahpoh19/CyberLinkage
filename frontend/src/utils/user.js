export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000'

export const FONT_MAP = {
    default: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Fira Code", "Courier New", monospace',
}

export function getDisplayName(user) {
    if (!user) return '同学'
    return user.display_name?.trim() || user.username || '同学'
}

export function getRoleLabel(role) {
    return role === 'teacher' ? '教师' : '学生'
}

export function getAvatarUrl(avatar) {
    if (!avatar) return ''
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar
    return `${API_ORIGIN}${avatar}`
}

export function getFileUrl(path) {
    if (!path) return ''
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    return `${API_ORIGIN}${path}`
}