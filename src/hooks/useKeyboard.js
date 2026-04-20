import { useEffect } from 'react'

/**
 * Wires global keyboard shortcuts to an imperative handler bag.
 * Each handler is optional.
 */
export function useKeyboard(handlers) {
  useEffect(() => {
    const onKey = e => {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) return
      const h = handlers

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); h.undo?.(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); h.redo?.(); return }
      if (e.key === 'Delete' || e.key === 'Backspace')  { h.del?.(); return }
      if (e.key === 'Escape')                            { h.setTool?.('select'); return }

      if (e.ctrlKey || e.metaKey) return
      if (e.key === 'v') { h.setTool?.('select');   return }
      if (e.key === 't') { h.setTool?.('text');     return }
      if (e.key === 'p') { h.setTool?.('draw');     return }
      if (e.key === 'r') { h.setTool?.('rect');     return }

      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (arrows[e.key]) {
        const [dx, dy] = arrows[e.key]
        const step = e.shiftKey ? 10 : 1
        h.nudge?.(dx * step, dy * step)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handlers])
}
