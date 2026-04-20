import { useCallback, useRef, useState } from 'react'

/**
 * Tiny toast state machine. Returns `[toast, show]` where `toast` is
 * `{msg, show}` and `show(message, duration?)` schedules visibility.
 */
export function useToast() {
  const [toast, setToast] = useState({ msg: '', show: false })
  const timer = useRef(null)
  const show = useCallback((msg, duration = 2600) => {
    setToast({ msg, show: true })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), duration)
  }, [])
  return [toast, show]
}
