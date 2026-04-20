export function isTextObject(obj) {
  return !!obj && (obj.type === 'i-text' || obj.type === 'textbox')
}

export function computeFloatingTextAnchor({
  bounds,
  canvasRect,
  areaRect,
  scrollLeft = 0,
  scrollTop = 0,
  zoom = 1,
}) {
  if (!bounds || !canvasRect || !areaRect) return null

  return {
    left: scrollLeft + (canvasRect.left - areaRect.left) + (bounds.left + bounds.width / 2) * zoom,
    top: scrollTop + (canvasRect.top - areaRect.top) + bounds.top * zoom,
  }
}

export function resolveKeyboardAction({
  key,
  ctrlKey,
  metaKey,
  shiftKey,
  targetTagName,
  isContentEditable,
  allowTextFormatting = false,
}) {
  const lowerKey = typeof key === 'string' ? key.toLowerCase() : ''
  const hasModifier = ctrlKey || metaKey
  const isFormField =
    targetTagName === 'INPUT' ||
    targetTagName === 'TEXTAREA' ||
    isContentEditable

  if (hasModifier && allowTextFormatting) {
    if (lowerKey === 'b') return { type: 'format', value: 'bold' }
    if (lowerKey === 'i') return { type: 'format', value: 'italic' }
    if (lowerKey === 'u') return { type: 'format', value: 'underline' }
  }

  if (isFormField) return null

  if (hasModifier && !shiftKey && lowerKey === 'z') return { type: 'undo' }
  if (hasModifier && (lowerKey === 'y' || (shiftKey && lowerKey === 'z'))) return { type: 'redo' }

  if (key === 'Delete' || key === 'Backspace') return { type: 'delete' }
  if (key === 'Escape') return { type: 'tool', value: 'select' }

  if (hasModifier) return null

  if (lowerKey === 'v') return { type: 'tool', value: 'select' }
  if (lowerKey === 't') return { type: 'tool', value: 'text' }
  if (lowerKey === 'p') return { type: 'tool', value: 'draw' }
  if (lowerKey === 'r') return { type: 'tool', value: 'rect' }

  const arrows = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  if (arrows[key]) {
    const [dx, dy] = arrows[key]
    const step = shiftKey ? 10 : 1
    return { type: 'nudge', dx: dx * step, dy: dy * step }
  }

  return null
}
