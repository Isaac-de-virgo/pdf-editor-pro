// Text extraction strategy.
// Walks pdf.js `TextContent` items, resolves every font via commonObjs,
// and groups runs that share font/weight/style into logical lines.
//
// SOLID:
//  • SRP – this file deals only with text runs.
//  • OCP – exports a plain extractor function consumed by the detection
//          orchestrator; adding new strategies is additive (no edits here).

import { loadFontInfo } from '../PdfService.js'
import {
  mapFontFamily, detectBold, detectItalic,
} from '../../../domain/fonts.js'

/**
 * @typedef {Object} TextRun
 * @property {string} text
 * @property {number} cx       canvas X of baseline origin
 * @property {number} cy       canvas Y of baseline origin
 * @property {number} fs       font size in canvas px
 * @property {number} endX     canvas X where the run visually ends
 * @property {number[]} tx     full pdf.js transform matrix
 * @property {string} fontName raw pdf.js reference
 * @property {string} rawFamily real font name (e.g. "Arial,Bold")
 * @property {string} fontFamily web-font name (normalised)
 * @property {boolean} bold
 * @property {boolean} italic
 */

/**
 * Extract and group text runs from a PDF page.
 * @param {PDFPageProxy} page
 * @param {pdfjsLib.PageViewport} viewport
 * @param {number} renderScale
 * @returns {Promise<TextRun[]>}
 */
export async function extractTextRuns(page, viewport, renderScale) {
  const tc = await page.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  })
  const styles = tc.styles || {}

  // Keep items with ANY content — including whitespace-only items —
  // because pdf.js emits them as separate items between words. Filtering
  // them out would glue adjacent words together.
  const rawItems = tc.items.filter(it => it.str && it.str.length > 0)
  if (!rawItems.length) return []

  // Preload font info for every referenced font. Done in parallel.
  const fontRefs = Array.from(new Set(rawItems.map(it => it.fontName).filter(Boolean)))
  const fontInfo = {}
  await Promise.all(fontRefs.map(async fn => {
    const info = await loadFontInfo(page, fn)
    if (info) fontInfo[fn] = {
      name:   info.name || '',
      bold:   !!info.bold,
      italic: !!info.italic,
      black:  !!info.black,
    }
  }))

  // Project each pdf.js item onto canvas coordinates, with resolved style.
  const items = rawItems.map(it => {
    const tx = it.transform
    const [cx, cy] = viewport.convertToViewportPoint(tx[4], tx[5])
    const fs = Math.max(5, Math.abs(tx[3]) * renderScale)
    const styleEntry = styles[it.fontName] || {}
    const resolved = fontInfo[it.fontName] || {}
    const rawFamily = resolved.name || styleEntry.fontFamily || ''
    return {
      str: it.str,
      isSpace: !it.str.trim(),
      cx, cy, fs,
      w: (it.width || 0) * renderScale,
      tx,
      fontName: it.fontName,
      rawFamily,
      fontFamily: mapFontFamily(rawFamily),
      bold: resolved.bold === true || resolved.black === true ||
            detectBold(resolved.name, rawFamily),
      italic: resolved.italic === true ||
              detectItalic(resolved.name, rawFamily, styleEntry.italic),
    }
  })

  // Stable reading order: top-down; within a line, left-to-right.
  items.sort((a, b) =>
    Math.abs(a.cy - b.cy) < a.fs * 0.5 ? (a.cx - b.cx) : (a.cy - b.cy)
  )

  // Group adjacent items on the same baseline with matching styling.
  // Whitespace-only items are absorbed regardless of style so words
  // separated by pdf.js " " items stay correctly spaced.
  const used = new Set()
  const runs = []
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue
    const head = items[i]
    if (head.isSpace) { used.add(i); continue } // don't start groups with a bare space
    used.add(i)
    let text = head.str
    let endX = head.cx + head.w
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue
      const next = items[j]
      if (Math.abs(next.cy - head.cy) > head.fs * 0.55) break
      // Pure whitespace items join without caring about style
      if (!next.isSpace) {
        if (next.fontFamily !== head.fontFamily ||
            next.bold       !== head.bold ||
            next.italic     !== head.italic) continue
      }
      const gap = next.cx - endX
      if (gap >= head.fs * 1.5 || gap <= -head.fs * 4) continue
      // Inject a space when needed to preserve word boundaries.
      const endsWithSpace   = /\s$/.test(text)
      const startsWithSpace = /^\s/.test(next.str)
      if (!endsWithSpace && !startsWithSpace && gap > head.fs * 0.12) text += ' '
      text += next.str
      endX = next.cx + (next.w || 0)
      used.add(j)
    }
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (trimmed) {
      runs.push({
        text: trimmed,
        cx: head.cx, cy: head.cy, fs: head.fs, endX,
        tx: head.tx,
        fontName: head.fontName,
        rawFamily: head.rawFamily,
        fontFamily: head.fontFamily,
        bold: head.bold,
        italic: head.italic,
      })
    }
  }
  return runs
}
