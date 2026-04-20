// Application-wide constants. Centralised so every module has a single
// source of truth (SRP / "Single Source of Truth").

/** Render scale for PDF rasterisation (1.5 = 150% of base PDF DPI). */
export const RS = 1.5

/** Fonts offered in the Properties panel's font-family dropdown. */
export const WEB_FONTS = [
  'Arial', 'Tahoma', 'Times New Roman', 'Courier New', 'Georgia',
  'Helvetica', 'Verdana', 'Trebuchet MS', 'Impact',
  'Comic Sans MS', 'Calibri', 'Segoe UI'
]

/** Fabric.js `.type` → human label mapping for the Selection info panel. */
export const TYPE_LABEL = Object.freeze({
  'rect': 'Rectángulo',
  'i-text': 'Texto',
  'textbox': 'Texto',
  'ellipse': 'Elipse',
  'line': 'Línea',
  'image': 'Imagen',
  'path': 'Trazo',
  'group': 'Grupo',
})

/** CDN URL for pdf.js worker. */
export const PDFJS_WORKER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

/** Markers used to tag fabric objects produced by detection. */
export const DATA_KIND = Object.freeze({
  PDF_TEXT: 'pdf-text',
  PDF_IMAGE: 'pdf-image',
  COVER_PAIR: 'cover-pair',
})
