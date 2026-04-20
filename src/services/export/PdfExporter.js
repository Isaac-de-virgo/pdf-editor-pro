// Export service. Renders each page's fabric snapshot + PDF background
// to PNG, then assembles a jsPDF document.

import { rasterizePage } from '../pdf/PdfService.js'
import { RS } from '../../constants.js'

/**
 * Compose the PNG for a single exported page.
 * Handles the "detected page with no bg image" case by using white.
 *
 * @param {fabric} fabric
 * @param {string} bgURL
 * @param {number} pgW
 * @param {number} pgH
 * @param {object} state  fabric JSON snapshot (may be null)
 * @returns {Promise<string>}  data URL
 */
async function renderPage(fabric, bgURL, pgW, pgH, state) {
  if (!state || !state.objects || !state.objects.length) return bgURL
  const te = document.createElement('canvas')
  te.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
  document.body.appendChild(te)
  const tf = new fabric.StaticCanvas(te, { width: pgW, height: pgH })
  const stHasBg = !!state.backgroundImage

  return new Promise(resolve => {
    const render = () => {
      tf.loadFromJSON(state, () => {
        const flush = () => {
          tf.renderAll()
          const u = tf.toDataURL({ format: 'png', multiplier: 1 })
          tf.dispose(); document.body.removeChild(te); resolve(u)
        }
        if (!tf.backgroundImage) tf.setBackgroundColor('#ffffff', flush)
        else flush()
      })
    }
    if (stHasBg) render()
    else tf.setBackgroundColor('#ffffff', render)
  })
}

/**
 * Export every page of a loaded PDF into a single edited PDF file.
 *
 * @param {Object} deps
 * @param {fabric} deps.fabric
 * @param {object} deps.jspdf     window.jspdf
 * @param {pdfjsLib.PDFDocumentProxy} deps.pdf
 * @param {Record<number, object>} deps.pageStates
 * @param {Record<number, {url:string,w:number,h:number}>} deps.pageRasters
 * @param {string} deps.fileName
 * @param {(msg:string)=>void} deps.onProgress
 */
export async function exportEditedPdf({
  fabric, jspdf, pdf, pageStates, pageRasters, fileName, onProgress,
}) {
  const { jsPDF } = jspdf
  let doc = null
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress && onProgress(`Exportando ${p}/${pdf.numPages}...`)
    let bgURL, pgW, pgH
    if (pageRasters[p]) {
      bgURL = pageRasters[p].url
      pgW   = pageRasters[p].w
      pgH   = pageRasters[p].h
    } else {
      const page = await pdf.getPage(p)
      const { url, viewport } = await rasterizePage(page, RS)
      bgURL = url; pgW = viewport.width; pgH = viewport.height
    }
    const finalURL = await renderPage(fabric, bgURL, pgW, pgH, pageStates[p])
    const isLandscape = pgW > pgH
    if (!doc) {
      doc = new jsPDF({
        orientation: isLandscape ? 'l' : 'p',
        unit: 'px',
        format: [pgW, pgH],
      })
    } else {
      doc.addPage([pgW, pgH], isLandscape ? 'l' : 'p')
    }
    doc.addImage(finalURL, 'PNG', 0, 0, pgW, pgH)
  }
  doc.save((fileName || 'documento').replace(/\.pdf$/i, '') + '_editado.pdf')
}
