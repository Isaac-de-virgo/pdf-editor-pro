import { useEffect } from 'react'
import { resolveKeyboardAction } from '../domain/editorUi.js'

/**
 * Wires global keyboard shortcuts to an imperative handler bag.
 * Each handler is optional.
 */
export function useKeyboard(handlers) {
  useEffect(() => {
    const onKey = e => {
      const action = resolveKeyboardAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        targetTagName: e.target?.tagName,
        isContentEditable: !!e.target?.isContentEditable,
        allowTextFormatting: handlers.canFormatText?.() ?? false,
      })
      if (!action) return

      const h = handlers
      if (action.type === 'undo') { e.preventDefault(); h.undo?.(); return }
      if (action.type === 'redo') { e.preventDefault(); h.redo?.(); return }
      if (action.type === 'delete') { e.preventDefault(); h.del?.(); return }
      if (action.type === 'tool') { h.setTool?.(action.value); return }
      if (action.type === 'format') { e.preventDefault(); h.format?.(action.value); return }
      if (action.type === 'nudge') {
        h.nudge?.(action.dx, action.dy)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handlers])
}
