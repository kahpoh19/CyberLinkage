export function getFileExtension(filename = '') {
  const parts = String(filename).toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

export function isMarkdownLikeFile(file) {
  const ext = getFileExtension(file?.name || file?.filename)
  return ['md', 'markdown', 'txt'].includes(ext)
}

export function isPdfFile(file) {
  return getFileExtension(file?.name || file?.filename) === 'pdf'
}

export function buildFileSearchText(file) {
  return [
    file?.name,
    file?.filename,
    file?.subject,
    file?.previewText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
