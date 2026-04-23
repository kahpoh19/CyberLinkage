export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/$/, '')

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

function resolveAssetUrl(path) {
    if (!path) return ''
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
        return path
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return API_ORIGIN ? `${API_ORIGIN}${normalizedPath}` : normalizedPath
}

export function getAvatarUrl(avatar) {
    return resolveAssetUrl(avatar)
}

export function getFileUrl(path) {
    return resolveAssetUrl(path)
}
