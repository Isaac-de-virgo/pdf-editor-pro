// Facade over pdf.js. Hides `window.pdfjsLib` from the rest of the app
// so callers only depend on this service (DIP: depend on abstractions).

import { PDFJS_WORKER_URL, RS } from '../../constants.js'

/**
 * Configure the pdf.js worker. Must be called once before any PDF load.
 * Idempotent.
 */
export function initPdfWorker() {
  if (typeof window === 'undefined' || !window.pdfjsLib) return
  const opts = window.pdfjsLib.GlobalWorkerOptions
  if (opts && !opts.workerSrc) opts.workerSrc = PDFJS_WORKER_URL
  if (opts && opts.workerSrc !== PDFJS_WORKER_URL) opts.workerSrc = PDFJS_WORKER_URL
}

/**
 * Load a PDF document from a File/Blob/ArrayBuffer.
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<pdfjsLib.PDFDocumentProxy>}
 */
export async function loadDocument(file) {
  const ab = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  return window.pdfjsLib.getDocument({ data: ab }).promise
}

/**
 * Rasterise a page onto a newly-allocated canvas.
 * @param {PDFPageProxy} page
 * @param {number} scale
 * @returns {Promise<{ canvas: HTMLCanvasElement, viewport: pdfjsLib.PageViewport, url: string }>}
 */
export async function rasterizePage(page, scale = RS) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return { canvas, viewport, url: canvas.toDataURL('image/png') }
}

/**
 * Render a low-DPI thumbnail of a page. Used by the sidebar.
 */
export async function renderThumbnail(page, scale = 0.22) {
  const vp = page.getViewport({ scale })
  const c = document.createElement('canvas')
  c.width = vp.width; c.height = vp.height
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
  return c.toDataURL('image/png')
}

/**
 * Resolve a pdf.js font reference (e.g. "g_d0_f1") into its full font
 * object which carries the real .name / .bold / .italic / .black flags
 * that `getTextContent()` by itself throws away.
 * @returns {Promise<object|null>}
 */
export function loadFontInfo(page, fontName) {
  return new Promise(res => {
    let done = false
    const cb = d => { if (!done) { done = true; res(d || null) } }
    try { page.commonObjs.get(fontName, cb) }
    catch { res(null); return }
    setTimeout(() => { if (!done) { done = true; res(null) } }, 1500)
  })
}
