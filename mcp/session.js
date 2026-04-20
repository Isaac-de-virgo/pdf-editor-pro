// ─────────────────────────────────────────────────────────────
// PDF Session — headless, reusable by the MCP server.
//
// Responsibilities
//   • Load a PDF from disk into memory (keeps the original bytes).
//   • Detect text runs + images per page (via pdfjs-dist, no canvas
//     rendering required).
//   • Track per-page edits (annotations, covers, text replacements).
//   • Export the edited PDF via pdf-lib, preserving the original
//     content and drawing user additions on top.
//
// Coordinate system (public API)
//   All x / y / width / height in PDF points (1pt = 1/72").
//   Origin is TOP-LEFT, Y grows DOWNWARD.
//   Internally converted to pdf-lib's native bottom-left.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// pdfjs-dist legacy build works in plain Node without a DOM.
// Point the global worker option at the resolved module path so pdf.js
// loads its worker code on the main thread instead of attempting a real
// Web Worker. Also resolve the directory where pdf.js ships its
// standard-font glyph data — avoids noisy warnings when parsing PDFs
// that reference built-in fonts. In Node, pdf.js reads these via
// `fs.readFile(url)`, so we pass a plain filesystem path with a
// trailing separator (NOT a `file://` URL).
const require = createRequire(import.meta.url)
let STANDARD_FONT_DATA_URL = null
let CMAP_URL = null
try {
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
    'pdfjs-dist/legacy/build/pdf.worker.mjs'
  )
} catch { /* non-fatal */ }
try {
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'))
  STANDARD_FONT_DATA_URL = path.join(pkgDir, 'standard_fonts') + path.sep
  CMAP_URL = path.join(pkgDir, 'cmaps') + path.sep
} catch { /* non-fatal */ }

/* ═════════════════════  COLOR HELPERS  ═════════════════════ */

function parseColor(input, fallback = [0, 0, 0]) {
  if (!input) return fallback
  if (Array.isArray(input) && input.length === 3) {
    return input.map(v => clamp01(+v / (v > 1 ? 255 : 1)))
  }
  if (typeof input !== 'string') return fallback
  const s = input.trim().toLowerCase()
  const named = NAMED_COLORS[s]
  if (named) return named
  const hex = s.replace(/^#/, '')
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ]
  }
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16) / 255,
      parseInt(hex[1] + hex[1], 16) / 255,
      parseInt(hex[2] + hex[2], 16) / 255,
    ]
  }
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255]
  return fallback
}

const NAMED_COLORS = {
  black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0],
  green: [0, 0.5, 0], blue: [0, 0, 1], yellow: [1, 1, 0],
  cyan: [0, 1, 1], magenta: [1, 0, 1], gray: [0.5, 0.5, 0.5],
  grey: [0.5, 0.5, 0.5], orange: [1, 0.647, 0], purple: [0.5, 0, 0.5],
  transparent: null,
}

const clamp01 = v => Math.max(0, Math.min(1, v))

function rgbFromArr([r, g, b]) { return rgb(r, g, b) }

function rgbToHex([r, g, b]) {
  const c = n => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

/* ═════════════════════  FONT MAPPING  ═════════════════════ */

export const FONT_FAMILIES = [
  'Helvetica', 'Times-Roman', 'Courier',
  'Arial', 'Times New Roman', 'Courier New',
  'Georgia', 'Verdana', 'Tahoma',
]

function pickStandardFont(family, bold, italic) {
  const f = String(family || '').toLowerCase()
  const isTimes = /times|serif|georgia/.test(f)
  const isCourier = /courier|mono/.test(f)
  if (isCourier) {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (isTimes) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

function stripFontVariant(raw) {
  if (!raw) return ''
  let s = String(raw).replace(/^[A-Z]{6}\+/, '').trim()
  const cut = s.search(
    /[,\-/]|\s+(Bold|Italic|Oblique|Black|Heavy|Light|Regular|Medium|Semi|Demi|Thin)/i
  )
  if (cut > 0) s = s.slice(0, cut)
  return s.trim()
}

function detectBoldFromName(s) {
  return /bold|heavy|black|semibold|demibold|extrabold|ultrabold/i.test(s || '')
}
function detectItalicFromName(s) {
  return /italic|oblique/i.test(s || '')
}

/* ═════════════════════  PDF DETECTION  ═════════════════════ */

async function loadFontInfo(page, fontName) {
  return new Promise(res => {
    let done = false
    const cb = d => { if (!done) { done = true; res(d || null) } }
    try { page.commonObjs.get(fontName, cb) }
    catch { res(null); return }
    setTimeout(() => { if (!done) { done = true; res(null) } }, 1500)
  })
}

async function detectTextOnPage(page) {
  const vp = page.getViewport({ scale: 1 }) // PDF user space
  const pageH = vp.height
  const tc = await page.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  })
  const styles = tc.styles || {}
  const rawItems = (tc.items || []).filter(it => it.str && it.str.trim())

  const fontRefs = Array.from(new Set(rawItems.map(it => it.fontName).filter(Boolean)))
  const fontInfo = {}
  await Promise.all(fontRefs.map(async fn => {
    try {
      const info = await loadFontInfo(page, fn)
      if (info) {
        fontInfo[fn] = {
          name: info.name || '',
          bold: !!info.bold,
          italic: !!info.italic,
          black: !!info.black,
        }
      }
    } catch {}
  }))

  const items = rawItems.map(it => {
    const tx = it.transform
    const baselineX = tx[4]
    const baselineYBL = tx[5]              // bottom-left origin
    const fs = Math.max(4, Math.abs(tx[3]) || Math.hypot(tx[2], tx[3]))
    const w = (it.width || 0)
    const styleEntry = styles[it.fontName] || {}
    const resolved = fontInfo[it.fontName] || {}
    const rawFamily = resolved.name || styleEntry.fontFamily || ''
    // Convert to top-left origin for external use.
    const yTL = pageH - baselineYBL - fs
    return {
      str: it.str,
      x: baselineX,
      y: yTL,                  // top-left of bounding box (approx)
      width: w,
      height: fs * 1.2,
      baselineYBL,
      fontSize: fs,
      fontName: it.fontName,
      rawFamily,
      fontFamily: stripFontVariant(rawFamily) || 'Helvetica',
      bold: resolved.bold === true || resolved.black === true ||
        detectBoldFromName(resolved.name) || detectBoldFromName(rawFamily),
      italic: resolved.italic === true ||
        detectItalicFromName(resolved.name) || detectItalicFromName(rawFamily) ||
        styleEntry.italic === true,
      color: '#000000',        // colour info is not available without rendering
      transform: tx,
    }
  })

  items.sort((a, b) =>
    Math.abs(a.y - b.y) < a.fontSize * 0.5 ? (a.x - b.x) : (a.y - b.y)
  )

  // Group adjacent items on the same baseline with identical font styling.
  const used = new Set(), groups = []
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const it = items[i]
    let text = it.str, endX = it.x + it.width
    let baselineYBL = it.baselineYBL
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue
      const it2 = items[j]
      if (Math.abs(it2.y - it.y) > it.fontSize * 0.55) break
      if (it2.fontFamily !== it.fontFamily || it2.bold !== it.bold || it2.italic !== it.italic) continue
      const gap = it2.x - endX
      if (gap < it.fontSize * 1.5 && gap > -it.fontSize * 4) {
        text += (gap > it.fontSize * 0.3 ? ' ' : '') + it2.str
        endX = it2.x + it2.width
        used.add(j)
      }
    }
    if (text.trim()) {
      groups.push({
        ...it,
        text: text.trim(),
        width: Math.max(it.width, endX - it.x),
        baselineYBL,
      })
    }
  }

  return groups
}

function mulMat(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

async function detectImagesOnPage(page) {
  const vp = page.getViewport({ scale: 1 })
  const pageH = vp.height
  const out = []
  try {
    const ops = await page.getOperatorList()
    const ctmStack = [[1, 0, 0, 1, 0, 0]]
    let ctm = [1, 0, 0, 1, 0, 0]
    const seen = new Set()

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i]
      if (fn === pdfjs.OPS.save) ctmStack.push([...ctm])
      else if (fn === pdfjs.OPS.restore && ctmStack.length > 1) ctm = ctmStack.pop()
      else if (fn === pdfjs.OPS.transform) ctm = mulMat(ctm, args)
      else if (
        fn === pdfjs.OPS.paintImageXObject ||
        fn === pdfjs.OPS.paintImageXObjectRepeat
      ) {
        const name = args[0]
        if (seen.has(name)) continue
        seen.add(name)
        const snap = [...ctm]
        // Image occupies a unit square transformed by CTM in PDF user space.
        const w = Math.abs(snap[0]) || 1
        const h = Math.abs(snap[3]) || 1
        const bx = snap[4]
        const byBL = snap[5]
        out.push({
          name,
          x: bx,
          y: pageH - byBL - h,      // top-left
          width: w,
          height: h,
        })
      }
    }
  } catch {}
  return out
}

/* ═════════════════════  EDIT MODEL  ═════════════════════ */
//
// Per page we store an ordered list of "edits" the user has queued.
// Each edit is drawn on top of the original page during export.
// Shape of an edit:
//   { id, kind: 'text'|'rect'|'ellipse'|'line'|'image'|'cover'|'highlight',
//     ...geometry, ...style }
//
// A "cover" edit wipes a region (opaque fill) so that text replacement
// hides the original glyphs below. It is automatically inserted when the
// user modifies or deletes a detected text/image.
// ───────────────────────────────────────────────────────────

let __globalSession = null

export function getSession() {
  if (!__globalSession) __globalSession = new PdfSession()
  return __globalSession
}

class PdfSession {
  constructor() {
    this.reset()
  }

  reset() {
    this.path = null
    this.buffer = null          // original bytes
    this.pageCount = 0
    this.pageSizes = []          // { width, height } in PDF points (top-left unit)
    this._detection = {}        // pageIndex → { text: [...], images: [...] } (1-indexed)
    this._edits = {}             // pageIndex → Array<edit>            (1-indexed)
    this._editSeq = 0
    this._pdfjsDoc = null
    this._defaultFontPath = null
  }

  isOpen() { return !!this.buffer }

  async open(filePath) {
    const abs = path.resolve(filePath)
    const buf = await fs.readFile(abs)
    // pdf-lib parses for sanity.
    const pdfDoc = await PDFDocument.load(buf, { updateMetadata: false })
    const pages = pdfDoc.getPages()
    this.reset()
    this.path = abs
    this.buffer = new Uint8Array(buf)
    this.pageCount = pages.length
    this.pageSizes = pages.map(p => ({
      width: round2(p.getWidth()),
      height: round2(p.getHeight()),
    }))
    // pdf.js parsing (for detection only, lazily).
    this._pdfjsDoc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL || undefined,
      cMapUrl: CMAP_URL || undefined,
      cMapPacked: true,
    }).promise
    return {
      path: abs,
      pageCount: this.pageCount,
      pages: this.pageSizes,
    }
  }

  close() { this.reset() }

  status() {
    return {
      open: this.isOpen(),
      path: this.path,
      pageCount: this.pageCount,
      pages: this.pageSizes,
      detectedPages: Object.keys(this._detection).map(Number).sort((a, b) => a - b),
      edits: Object.fromEntries(
        Object.entries(this._edits).map(([p, list]) => [p, list.length])
      ),
    }
  }

  _assertOpen() {
    if (!this.isOpen()) throw new Error('No PDF is open. Call open_pdf first.')
  }

  _assertPage(n) {
    this._assertOpen()
    if (!Number.isInteger(n) || n < 1 || n > this.pageCount) {
      throw new Error(`Invalid page ${n}. Must be 1..${this.pageCount}`)
    }
  }

  getPageSize(page) {
    this._assertPage(page)
    return this.pageSizes[page - 1]
  }

  async detectPage(page) {
    this._assertPage(page)
    if (this._detection[page]) return this._detection[page]
    const p = await this._pdfjsDoc.getPage(page)
    const [text, images] = await Promise.all([
      detectTextOnPage(p),
      detectImagesOnPage(p),
    ])
    const size = this.pageSizes[page - 1]
    const textOut = text.map((t, i) => ({
      id: `t${page}_${i + 1}`,
      type: 'text',
      text: t.text,
      x: round2(t.x),
      y: round2(t.y),
      width: round2(t.width),
      height: round2(t.height),
      fontSize: round2(t.fontSize),
      fontFamily: t.fontFamily,
      bold: t.bold,
      italic: t.italic,
      color: t.color,
      _baselineYBL: t.baselineYBL,
    }))
    const imgOut = images.map((im, i) => ({
      id: `i${page}_${i + 1}`,
      type: 'image',
      x: round2(im.x),
      y: round2(im.y),
      width: round2(im.width),
      height: round2(im.height),
    }))
    this._detection[page] = { text: textOut, images: imgOut, pageSize: size }
    return this._detection[page]
  }

  getDetected(page, id) {
    const d = this._detection[page]
    if (!d) throw new Error(`Page ${page} has not been detected yet. Call detect_page first.`)
    const item = [...d.text, ...d.images].find(o => o.id === id)
    if (!item) throw new Error(`No detected element with id "${id}" on page ${page}`)
    return item
  }

  _nextEditId() { return `e${++this._editSeq}` }

  _pageEdits(page) {
    if (!this._edits[page]) this._edits[page] = []
    return this._edits[page]
  }

  addEdit(page, edit) {
    this._assertPage(page)
    const e = { id: this._nextEditId(), ...edit }
    this._pageEdits(page).push(e)
    return e
  }

  listEdits(page) {
    this._assertPage(page)
    return [...this._pageEdits(page)]
  }

  removeEdit(page, editId) {
    this._assertPage(page)
    const list = this._pageEdits(page)
    const idx = list.findIndex(e => e.id === editId)
    if (idx < 0) throw new Error(`No edit "${editId}" on page ${page}`)
    const [removed] = list.splice(idx, 1)
    return removed
  }

  clearEdits(page) {
    this._assertPage(page)
    const n = this._pageEdits(page).length
    this._edits[page] = []
    return n
  }

  async addImageFromFile(page, x, y, width, height, filePath) {
    this._assertPage(page)
    const abs = path.resolve(filePath)
    const bytes = await fs.readFile(abs)
    return this._addImageBytes(page, x, y, width, height, bytes, extGuess(abs))
  }

  addImageFromBase64(page, x, y, width, height, base64, format) {
    this._assertPage(page)
    const clean = String(base64).replace(/^data:image\/\w+;base64,/, '')
    const bytes = Buffer.from(clean, 'base64')
    return this._addImageBytes(page, x, y, width, height, bytes, format)
  }

  _addImageBytes(page, x, y, width, height, bytes, format) {
    const fmt = guessImageFormat(bytes, format)
    if (fmt !== 'png' && fmt !== 'jpg')
      throw new Error(`Unsupported image format "${fmt}". Only PNG and JPEG are supported.`)
    return this.addEdit(page, {
      kind: 'image',
      x: +x, y: +y,
      width: width != null ? +width : null,
      height: height != null ? +height : null,
      imageBytes: bytes,
      format: fmt,
    })
  }

  replaceText(page, search, replace, { matchCase = false, wholeWord = false } = {}) {
    const run = async p => {
      const det = await this.detectPage(p)
      const edits = []
      const re = buildSearchRegex(search, { matchCase, wholeWord })
      for (const t of det.text) {
        if (!re.test(t.text)) continue
        re.lastIndex = 0
        const newText = t.text.replace(re, replace)
        if (newText === t.text) continue
        // Cover original, draw replacement on top using detected style.
        edits.push(this._coverDetected(p, t))
        edits.push(this.addEdit(p, {
          kind: 'text',
          x: t.x,
          y: t.y,
          text: newText,
          fontSize: t.fontSize,
          fontFamily: t.fontFamily,
          bold: t.bold,
          italic: t.italic,
          color: t.color,
          _detectedId: t.id,
          _baselineYBL: t._baselineYBL,
        }))
      }
      return edits
    }
    if (page == null) {
      // apply to all pages
      return (async () => {
        const all = []
        for (let p = 1; p <= this.pageCount; p++) all.push(...(await run(p)))
        return all
      })()
    }
    this._assertPage(page)
    return run(page)
  }

  async modifyDetectedText(page, id, patch) {
    this._assertPage(page)
    await this.detectPage(page)
    const t = this.getDetected(page, id)
    if (t.type !== 'text') throw new Error(`Element ${id} is not text`)
    const newText = patch.text != null ? String(patch.text) : t.text
    const fontSize = patch.fontSize != null ? +patch.fontSize : t.fontSize
    const fontFamily = patch.fontFamily || t.fontFamily
    const bold = patch.bold != null ? !!patch.bold : t.bold
    const italic = patch.italic != null ? !!patch.italic : t.italic
    const color = patch.color || t.color
    const cover = this._coverDetected(page, t, patch.coverColor)
    const text = this.addEdit(page, {
      kind: 'text',
      x: patch.x != null ? +patch.x : t.x,
      y: patch.y != null ? +patch.y : t.y,
      text: newText,
      fontSize, fontFamily, bold, italic, color,
      fontPath: patch.fontPath || undefined,
      _detectedId: t.id,
      _baselineYBL: t._baselineYBL,
    })
    return { cover, text }
  }

  async deleteDetected(page, id, coverColor) {
    this._assertPage(page)
    await this.detectPage(page)
    const t = this.getDetected(page, id)
    return this._coverDetected(page, t, coverColor)
  }

  _coverDetected(page, item, coverColor) {
    const pad = item.type === 'text' ? Math.max(2, item.fontSize * 0.15) : 0
    return this.addEdit(page, {
      kind: 'cover',
      x: item.x - pad,
      y: item.y - pad,
      width: item.width + pad * 2,
      height: item.height + pad * 2,
      color: coverColor || '#ffffff',
      _detectedId: item.id,
    })
  }

  setDefaultFontPath(filePath) {
    this._assertOpen()
    if (!filePath) { this._defaultFontPath = null; return { defaultFontPath: null } }
    const abs = path.resolve(filePath)
    this._defaultFontPath = abs
    return { defaultFontPath: abs }
  }

  async export(outputPath) {
    this._assertOpen()
    const pdfDoc = await PDFDocument.load(this.buffer)

    // Collect every distinct custom font path referenced by edits + default.
    const customFontPaths = new Set()
    if (this._defaultFontPath) customFontPaths.add(this._defaultFontPath)
    for (const list of Object.values(this._edits)) {
      for (const e of list) if (e.fontPath) customFontPaths.add(e.fontPath)
    }
    let fontkitRegistered = false
    const registerFontkit = async () => {
      if (fontkitRegistered) return
      const { default: fontkit } = await import('@pdf-lib/fontkit')
      pdfDoc.registerFontkit(fontkit)
      fontkitRegistered = true
    }
    if (customFontPaths.size) await registerFontkit()

    // Lazy font cache — custom fonts keyed by absolute path, standard fonts
    // keyed by `${family}|${bold}|${italic}`.
    const fontCache = new Map()
    const getFont = async ({ fontPath, family, bold, italic } = {}) => {
      const usePath = fontPath || this._defaultFontPath
      if (usePath) {
        if (fontCache.has(usePath)) return fontCache.get(usePath)
        const bytes = await fs.readFile(usePath)
        const f = await pdfDoc.embedFont(bytes, { subset: true })
        fontCache.set(usePath, f)
        return f
      }
      const key = `${family}|${bold}|${italic}`
      if (fontCache.has(key)) return fontCache.get(key)
      const f = await pdfDoc.embedFont(pickStandardFont(family, bold, italic))
      fontCache.set(key, f)
      return f
    }

    const pages = pdfDoc.getPages()
    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1
      const edits = this._edits[pageNum] || []
      if (!edits.length) continue
      const page = pages[i]
      const { width: pw, height: ph } = { width: page.getWidth(), height: page.getHeight() }
      for (const e of edits) {
        try {
          await drawEdit(pdfDoc, page, e, pw, ph, getFont)
        } catch (err) {
          throw enrichDrawError(err, e, pageNum)
        }
      }
    }

    const bytes = await pdfDoc.save()
    const abs = path.resolve(outputPath)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, bytes)
    return { path: abs, size: bytes.length }
  }
}

function enrichDrawError(err, edit, pageNum) {
  const msg = err && err.message ? err.message : String(err)
  if (/WinAnsi cannot encode/i.test(msg)) {
    const badChar = (msg.match(/"(.*?)"/) || [])[1] || '?'
    const snippet = edit.kind === 'text'
      ? ` (text: ${JSON.stringify(String(edit.text).slice(0, 40))})` : ''
    return new Error(
      `Cannot encode character "${badChar}" with the built-in PDF fonts on page ${pageNum}${snippet}. ` +
      `The 14 standard PDF fonts only support WinAnsi (Latin-1). ` +
      `Register a Unicode TrueType font via set_default_font(path) — e.g. DejaVuSans.ttf, NotoSans.ttf — ` +
      `or pass fontPath to this specific edit, then re-export.`
    )
  }
  return err
}

/* ═════════════════════  DRAW ONE EDIT  ═════════════════════ */

async function drawEdit(pdfDoc, page, e, pw, ph, getFont) {
  const toBL = (y, h = 0) => ph - y - h
  const opacity = e.opacity != null ? clamp01(e.opacity) : 1

  if (e.kind === 'cover') {
    const color = parseColor(e.color, [1, 1, 1])
    page.drawRectangle({
      x: e.x, y: toBL(e.y, e.height),
      width: e.width, height: e.height,
      color: rgbFromArr(color),
      opacity,
    })
    return
  }

  if (e.kind === 'rect' || e.kind === 'highlight') {
    const fill = e.fill != null ? parseColor(e.fill, null) : null
    const stroke = e.stroke != null ? parseColor(e.stroke, null) : null
    page.drawRectangle({
      x: e.x, y: toBL(e.y, e.height),
      width: e.width, height: e.height,
      color: fill ? rgbFromArr(fill) : undefined,
      borderColor: stroke ? rgbFromArr(stroke) : undefined,
      borderWidth: e.strokeWidth || 0,
      opacity: e.kind === 'highlight' ? (e.opacity != null ? clamp01(e.opacity) : 0.35) : opacity,
      borderOpacity: opacity,
    })
    return
  }

  if (e.kind === 'ellipse') {
    const fill = e.fill != null ? parseColor(e.fill, null) : null
    const stroke = e.stroke != null ? parseColor(e.stroke, null) : null
    const cx = e.x + e.width / 2
    const cyTL = e.y + e.height / 2
    page.drawEllipse({
      x: cx, y: toBL(cyTL),
      xScale: e.width / 2, yScale: e.height / 2,
      color: fill ? rgbFromArr(fill) : undefined,
      borderColor: stroke ? rgbFromArr(stroke) : undefined,
      borderWidth: e.strokeWidth || 0,
      opacity, borderOpacity: opacity,
    })
    return
  }

  if (e.kind === 'line') {
    const stroke = parseColor(e.stroke, [0, 0, 0])
    page.drawLine({
      start: { x: e.x1, y: toBL(e.y1) },
      end: { x: e.x2, y: toBL(e.y2) },
      thickness: e.strokeWidth || 1,
      color: rgbFromArr(stroke),
      opacity,
    })
    return
  }

  if (e.kind === 'text') {
    const font = await getFont({
      fontPath: e.fontPath,
      family: e.fontFamily,
      bold: e.bold,
      italic: e.italic,
    })
    const color = parseColor(e.color, [0, 0, 0])
    const size = e.fontSize || 14
    // Use the detected baseline if we have it (keeps replacements pixel-aligned).
    let baselineBL
    if (e._baselineYBL != null) baselineBL = e._baselineYBL
    else baselineBL = toBL(e.y) - size * 0.8
    page.drawText(String(e.text ?? ''), {
      x: e.x,
      y: baselineBL,
      size,
      font,
      color: rgbFromArr(color),
      opacity,
      rotate: e.rotation ? degrees(e.rotation) : undefined,
    })
    return
  }

  if (e.kind === 'image') {
    const embedded = e.format === 'png'
      ? await pdfDoc.embedPng(e.imageBytes)
      : await pdfDoc.embedJpg(e.imageBytes)
    let w = e.width, h = e.height
    if (!w && !h) { w = embedded.width; h = embedded.height }
    else if (!w) w = embedded.width * (h / embedded.height)
    else if (!h) h = embedded.height * (w / embedded.width)
    page.drawImage(embedded, {
      x: e.x,
      y: toBL(e.y, h),
      width: w, height: h,
      opacity,
      rotate: e.rotation ? degrees(e.rotation) : undefined,
    })
    return
  }

  throw new Error(`Unknown edit kind: ${e.kind}`)
}

/* ═════════════════════  MISC HELPERS  ═════════════════════ */

function buildSearchRegex(search, { matchCase, wholeWord }) {
  const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const src = wholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(src, matchCase ? 'g' : 'gi')
}

function extGuess(p) {
  const ext = path.extname(p).toLowerCase()
  if (ext === '.png') return 'png'
  if (ext === '.jpg' || ext === '.jpeg') return 'jpg'
  return null
}

function guessImageFormat(buf, hint) {
  if (hint === 'png' || hint === 'jpg' || hint === 'jpeg') return hint === 'jpeg' ? 'jpg' : hint
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  return null
}

function round2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100 }

/* Expose helpers for tests / advanced use. */
export { parseColor, rgbToHex, pickStandardFont, round2 }
