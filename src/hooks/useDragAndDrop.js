import { useEffect } from 'react'

/**
 * Accept PDF drops anywhere on the page. Calls `onFile(File)` once.
 */
export function useDragAndDrop(onFile) {
  useEffect(() => {
    const over = e => e.preventDefault()
    const drop = e => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f && f.type === 'application/pdf') onFile(f)
    }
    document.addEventListener('dragover', over)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragover', over)
      document.removeEventListener('drop', drop)
    }
  }, [onFile])
}
