// 2D affine-matrix helpers used when walking pdf.js operator lists.

/**
 * Multiply two 2D affine matrices represented as
 * [a, b, c, d, e, f] (same convention as pdf.js).
 */
export function mulMat(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/** Clamp a rectangle to a canvas, returning null if it collapses. */
export function clampRect(x, y, w, h, maxW, maxH) {
  x = Math.max(0, Math.round(x))
  y = Math.max(0, Math.round(y))
  w = Math.min(Math.round(w), maxW - x)
  h = Math.min(Math.round(h), maxH - y)
  if (w <= 0 || h <= 0) return null
  return { x, y, w, h }
}
