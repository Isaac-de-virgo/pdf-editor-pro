// Pure domain helpers for PDF font identification / normalisation.
// No framework, no DOM, no pdf.js — easy to unit-test in isolation.

/**
 * Strip PDF font subset prefixes like "WYIXVG+" and weight/style suffixes
 * ("Arial,Bold" → "Arial", "Times-BoldItalic" → "Times",
 *  "Arimo Italic" → "Arimo").
 */
export function stripFontVariant(raw) {
  if (!raw) return ''
  let s = String(raw).replace(/^[A-Z]{6}\+/, '').trim()
  const cutIdx = s.search(
    /[,\-/]|\s+(Bold|Italic|Oblique|Black|Heavy|Light|Regular|Medium|Semi|Demi|Thin)/i
  )
  if (cutIdx > 0) s = s.slice(0, cutIdx)
  return s.trim()
}

/**
 * Map a raw PDF font family string to a stable web font that's likely to
 * be available. Unknown families fall back to the cleaned raw name, with
 * Arial as ultimate fallback.
 */
export function mapFontFamily(raw) {
  if (!raw) return 'Arial'
  const base = stripFontVariant(raw).toLowerCase()
  if (base.includes('tahoma')) return 'Tahoma'
  if (
    base.includes('helvetica') || base.includes('arial') ||
    base.includes('arimo')    || base === 'sans-serif' ||
    base.includes('sans')
  ) return 'Arial'
  if (base.includes('times') || base.includes('tinos') ||
      base === 'serif'       || base.includes('serif')) return 'Times New Roman'
  if (base.includes('courier') || base.includes('cousine') ||
      base.includes('mono')) return 'Courier New'
  if (base.includes('georgia')) return 'Georgia'
  if (base.includes('verdana')) return 'Verdana'
  if (base.includes('trebuchet')) return 'Trebuchet MS'
  if (base.includes('impact')) return 'Impact'
  if (base.includes('calibri') || base.includes('carlito')) return 'Calibri'
  if (base.includes('comic')) return 'Comic Sans MS'
  if (base.includes('segoe')) return 'Segoe UI'
  if (base.includes('symbol')) return 'Arial'
  const cleaned = stripFontVariant(raw).replace(/['"]/g, '').trim()
  return cleaned || 'Arial'
}

/** Regex-based bold detection (fallback when pdf.js bold flag is absent). */
export function detectBold(fontName, fontFamily) {
  const s = `${fontName || ''} ${fontFamily || ''}`.toLowerCase()
  return /bold|heavy|black|semibold|demibold|extrabold|ultrabold/.test(s)
}

/** Regex-based italic detection + respect explicit italic flag. */
export function detectItalic(fontName, fontFamily, styleItalic) {
  if (styleItalic === true) return true
  const s = `${fontName || ''} ${fontFamily || ''}`.toLowerCase()
  return /italic|oblique/.test(s)
}
