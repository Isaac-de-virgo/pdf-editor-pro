// Detection orchestrator (Facade).
// Combines the text + image extractors and the pair factory into a
// single call the UI layer can consume.

import { extractTextRuns }  from './textExtractor.js'
import { extractImageRuns } from './imageExtractor.js'
import { buildTextPair, buildImagePair } from './pairFactory.js'
import { rasterizePage }    from '../PdfService.js'
import { RS }               from '../../../constants.js'

/**
 * Detect editable content on a page.
 *
 * @param {PDFPageProxy} page
 * @param {fabric} fabric
 * @param {pdfjsLib} pdfjsLib
 * @returns {Promise<{
 *   pairs: Array<{cover: fabric.Object, obj: fabric.Object, kind: 'text'|'image'}>,
 *   originalCanvas: HTMLCanvasElement,
 *   originalUrl: string,
 *   viewport: pdfjsLib.PageViewport,
 *   txtCnt: number,
 *   imgCnt: number,
 * }>}
 */
export async function detectPageContent({ page, fabric, pdfjsLib }) {
  const { canvas, viewport, url } = await rasterizePage(page, RS)

  const [textRuns, imageRuns] = await Promise.all([
    extractTextRuns(page, viewport, RS),
    extractImageRuns(pdfjsLib, page, viewport, RS),
  ])

  const pairs = []
  for (const run of textRuns) {
    const pair = buildTextPair(fabric, run, canvas)
    if (pair) pairs.push({ ...pair, kind: 'text' })
  }
  for (const run of imageRuns) {
    const pair = await buildImagePair(fabric, run, canvas)
    if (pair) pairs.push({ ...pair, kind: 'image' })
  }

  return {
    pairs,
    originalCanvas: canvas,
    originalUrl: url,
    viewport,
    txtCnt: textRuns.length,
    imgCnt: imageRuns.length,
  }
}
