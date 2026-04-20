// Factory that turns a TextRun / ImageRun into an "invisible pair" of
// fabric objects ready to be added to a canvas:
//
//   cover   — a rect filled with the sampled-bg colour
//   obj     — the editable IText / Image
//
// Both start at opacity 0 and share a `pairId` on their `.data`. They
// are only revealed when the user actually modifies the obj (see
// PairRegistry + CanvasService).

import { rgbToCss, sampleBgAround, findTextColor } from '../../../domain/color.js'
import { clampRect } from '../../../domain/geometry.js'
import { DATA_KIND } from '../../../constants.js'

let __seq = 0
const nextPairId = () => `p_${++__seq}`

/**
 * Reusable offscreen 2D context for measuring text.
 * Lazily created so the module stays test-friendly in non-DOM envs.
 */
let __measureCtx = null
function getMeasureCtx() {
  if (!__measureCtx && typeof document !== 'undefined') {
    __measureCtx = document.createElement('canvas').getContext('2d')
  }
  return __measureCtx
}

/**
 * Measure a string with the browser's native canvas text metrics.
 * Returns 0 when measurement is unavailable (e.g. in Node tests).
 */
function measureWidth(text, family, size, bold, italic) {
  const ctx = getMeasureCtx()
  if (!ctx || !text) return 0
  const w = bold ? 'bold' : 'normal'
  const s = italic ? 'italic' : 'normal'
  // Quote the family so multi-word names ("Times New Roman") still resolve.
  ctx.font = `${s} ${w} ${size}px "${family}", Arial, sans-serif`
  return ctx.measureText(text).width
}

/**
 * Create the invisible (cover, obj) pair for a text run.
 * @returns {{ cover: fabric.Rect, obj: fabric.IText } | null}
 */
export function buildTextPair(fabric, run, origCanvas) {
  const cctx = origCanvas.getContext('2d', { willReadFrequently: true })
  const maxW = origCanvas.width
  const maxH = origCanvas.height

  // Keep the cover bbox glyph-tight: just enough padding to mask the
  // original text's antialiasing fringe, without spilling onto adjacent
  // words/lines (which would otherwise get hidden as soon as the user
  // touches this text).
  const bbox = clampRect(
    run.cx - 1,
    run.cy - run.fs * 0.9 - 1,
    Math.max(run.endX - run.cx, run.fs * 0.5) + 2,
    run.fs * 1.1 + 2,
    maxW, maxH,
  )
  if (!bbox) return null

  // Sample bg and text colours around/inside the bbox.
  let ink = [0, 0, 0]
  let bg  = [255, 255, 255]
  try {
    const data = cctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h).data
    bg  = sampleBgAround(cctx, bbox.x, bbox.y, bbox.w, bbox.h)
    ink = findTextColor(data, bg)
  } catch {}

  const pairId = nextPairId()
  const angle = Math.atan2(run.tx[1], run.tx[0]) * 180 / Math.PI

  // Size correction: fabric must render the fallback web-font at the same
  // visual width as the embedded PDF font. If the fallback glyphs are
  // wider than the originals, the same `fontSize` would look noticeably
  // bigger when the IText is revealed. Rescale fontSize proportionally so
  // the rendered width matches the PDF width.
  let fontSize = Math.max(5, run.fs)
  const expectedW = Math.max(1, run.endX - run.cx)
  const measuredW = measureWidth(
    run.text, run.fontFamily, fontSize, run.bold, run.italic,
  )
  if (measuredW > 0) {
    const ratio = expectedW / measuredW
    // Clamp to avoid extreme squashes for very short runs or missing fonts.
    if (ratio >= 0.55 && ratio <= 1.6) fontSize = fontSize * ratio
  }

  const cover = new fabric.Rect({
    left: bbox.x, top: bbox.y,
    width: bbox.w, height: bbox.h,
    fill: rgbToCss(bg),
    stroke: null, strokeWidth: 0,
    opacity: 0,
    selectable: false, evented: false,
    hasBorders: false, hasControls: false,
    data: { type: DATA_KIND.COVER_PAIR, detected: true, pairId },
  })
  const itextLeft = run.cx
  const itextTop  = run.cy - fontSize * 1.05
  const obj = new fabric.IText(run.text, {
    left: itextLeft,
    top:  itextTop,
    fontSize: Math.round(fontSize * 10) / 10, // keep one decimal for fidelity
    fontFamily: run.fontFamily,
    fill: rgbToCss(ink),
    fontWeight: run.bold ? 'bold' : 'normal',
    fontStyle: run.italic ? 'italic' : 'normal',
    selectable: true,
    editable: true,
    padding: 2,
    angle,
    opacity: 0,
    data: {
      type: DATA_KIND.PDF_TEXT,
      original: true,
      detected: true,
      pairId,
      fontName: run.fontName,
      rawFamily: run.rawFamily,
      // Baseline snapshot: used by CanvasService to decide whether the
      // user actually changed anything. If they didn't, the cover is
      // kept hidden so neighbouring content stays visible.
      orig: {
        left: itextLeft,
        top:  itextTop,
        scaleX: 1,
        scaleY: 1,
        angle,
        text: run.text,
      },
    },
  })
  return { cover, obj }
}

/**
 * Create the invisible (cover, obj) pair for an image run.
 * Image loading is async, hence the Promise return.
 * @returns {Promise<{cover: fabric.Rect, obj: fabric.Image}|null>}
 */
export function buildImagePair(fabric, run, origCanvas) {
  return new Promise(resolve => {
    fabric.Image.fromURL(run.dataUrl, img => {
      img.set({ left: run.left, top: run.top, selectable: true, opacity: 0 })
      if (run.width > 10 && run.height > 10) {
        img.scaleX = run.width / run.nativeW
        img.scaleY = run.height / run.nativeH
      }
      const pairId = nextPairId()
      img.data = {
        type: DATA_KIND.PDF_IMAGE,
        original: true,
        detected: true,
        pairId,
        orig: {
          left:   img.left,
          top:    img.top,
          scaleX: img.scaleX || 1,
          scaleY: img.scaleY || 1,
          angle:  img.angle  || 0,
        },
      }

      const cctx = origCanvas.getContext('2d', { willReadFrequently: true })
      const bbox = clampRect(
        img.left, img.top,
        img.getScaledWidth(), img.getScaledHeight(),
        origCanvas.width, origCanvas.height,
      )
      const bg = bbox
        ? sampleBgAround(cctx, bbox.x, bbox.y, bbox.w, bbox.h)
        : [255, 255, 255]
      const cover = new fabric.Rect({
        left: bbox ? bbox.x : img.left,
        top:  bbox ? bbox.y : img.top,
        width:  bbox ? bbox.w : img.getScaledWidth(),
        height: bbox ? bbox.h : img.getScaledHeight(),
        fill: rgbToCss(bg),
        stroke: null, strokeWidth: 0,
        opacity: 0,
        selectable: false, evented: false,
        hasBorders: false, hasControls: false,
        data: { type: DATA_KIND.COVER_PAIR, detected: true, pairId },
      })
      resolve({ cover, obj: img })
    })
  })
}
