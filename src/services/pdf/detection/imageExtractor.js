// Image extraction strategy.
// Walks the page operator list, tracking the current graphics CTM, and
// emits one record per paintImageXObject occurrence.

import { mulMat } from '../../../domain/geometry.js'

/**
 * @typedef {Object} ImageRun
 * @property {string} dataUrl  PNG data URL for the image bitmap
 * @property {number} left     canvas X
 * @property {number} top      canvas Y
 * @property {number} width    canvas width (may not be drawn 1:1)
 * @property {number} height   canvas height
 * @property {number} nativeW  bitmap width
 * @property {number} nativeH  bitmap height
 */

/**
 * Await a pdf.js objs/commonObjs entry (async ready).
 */
function fetchImageData(page, imgName) {
  return new Promise(res => {
    let done = false
    const cb = d => { if (!done) { done = true; res(d || null) } }
    try {
      page.objs.get(imgName, cb)
      page.commonObjs.get(imgName, cb)
      setTimeout(() => { if (!done) { done = true; res(null) } }, 1500)
    } catch { res(null) }
  })
}

/**
 * Convert a pdf.js raw image descriptor into a PNG data URL.
 */
function toDataUrl(imgData) {
  const c = document.createElement('canvas')
  c.width = imgData.width
  c.height = imgData.height
  const ctx = c.getContext('2d')
  const id = new ImageData(
    new Uint8ClampedArray(imgData.data),
    imgData.width,
    imgData.height,
  )
  ctx.putImageData(id, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * Extract raster images referenced by a page.
 * @param {pdfjsLib} pdfjsLib
 * @param {PDFPageProxy} page
 * @param {pdfjsLib.PageViewport} viewport
 * @param {number} renderScale
 * @returns {Promise<ImageRun[]>}
 */
export async function extractImageRuns(pdfjsLib, page, viewport, renderScale) {
  const runs = []
  try {
    const ops = await page.getOperatorList()
    const ctmStack = [[1, 0, 0, 1, 0, 0]]
    let ctm = [1, 0, 0, 1, 0, 0]
    const seen = new Set()

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i]
      if (fn === pdfjsLib.OPS.save) { ctmStack.push([...ctm]); continue }
      if (fn === pdfjsLib.OPS.restore && ctmStack.length > 1) { ctm = ctmStack.pop(); continue }
      if (fn === pdfjsLib.OPS.transform) { ctm = mulMat(ctm, args); continue }
      if (fn !== pdfjsLib.OPS.paintImageXObject &&
          fn !== pdfjsLib.OPS.paintImageXObjectRepeat) continue

      const imgName = args[0]
      if (seen.has(imgName)) continue
      seen.add(imgName)

      const snapCTM = [...ctm]
      const imgData = await fetchImageData(page, imgName)
      if (!imgData || !imgData.width || !imgData.height ||
          imgData.width < 8 || imgData.height < 8) continue

      try {
        const dataUrl = toDataUrl(imgData)
        const [vx, vy] = viewport.convertToViewportPoint(snapCTM[4], snapCTM[5])
        const vw = Math.abs(snapCTM[0]) * renderScale
        const vh = Math.abs(snapCTM[3]) * renderScale
        runs.push({
          dataUrl,
          left: Math.max(0, vx),
          top: Math.max(0, vy - vh),
          width: vw,
          height: vh,
          nativeW: imgData.width,
          nativeH: imgData.height,
        })
      } catch (err) { console.warn('Img placement error:', err) }
    }
  } catch (err) { console.warn('Image extraction:', err) }
  return runs
}
