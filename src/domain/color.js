// Pure colour utilities working directly with a 2D canvas context.
// Used by the detection pipeline to sample surrounding-bg and ink colours.

/**
 * Sample the most common colour in thin strips around a rectangle.
 * Returns an [r,g,b] tuple. Used to figure out what colour the PDF bg
 * is around a text run so we can "erase" the text seamlessly.
 */
export function sampleBgAround(ctx, x, y, w, h) {
  const samples = []
  const pushStrip = (sx, sy, sw, sh) => {
    sx = Math.max(0, Math.floor(sx))
    sy = Math.max(0, Math.floor(sy))
    sw = Math.floor(sw)
    sh = Math.floor(sh)
    if (sw <= 0 || sh <= 0) return
    if (sx + sw > ctx.canvas.width) sw = ctx.canvas.width - sx
    if (sy + sh > ctx.canvas.height) sh = ctx.canvas.height - sy
    if (sw <= 0 || sh <= 0) return
    try {
      const d = ctx.getImageData(sx, sy, sw, sh).data
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 50) samples.push([d[i], d[i + 1], d[i + 2]])
      }
    } catch {}
  }
  pushStrip(x, y - 3, w, 3)
  pushStrip(x, y + h, w, 3)
  pushStrip(x - 3, y, 3, h)
  pushStrip(x + w, y, 3, h)
  if (!samples.length) return [255, 255, 255]

  // Bucket by coarse (r>>3,g>>3,b>>3) and return the mode bucket's
  // average. Avoids averages being biased by stray antialiasing pixels.
  const buckets = new Map()
  for (const [r, g, b] of samples) {
    const key = `${r >> 3}|${g >> 3}|${b >> 3}`
    const e = buckets.get(key)
    if (e) { e.c++; e.r += r; e.g += g; e.b += b }
    else buckets.set(key, { c: 1, r, g, b })
  }
  let best = null
  for (const e of buckets.values()) if (!best || e.c > best.c) best = e
  return [
    Math.round(best.r / best.c),
    Math.round(best.g / best.c),
    Math.round(best.b / best.c),
  ]
}

/**
 * Find the likely text colour within a bbox.
 *
 * Strategy: bucket every pixel that differs noticeably from the sampled
 * background, then return the average of the most populous bucket.
 * Using the *mode* (rather than the single most-contrasting pixel)
 * makes detection robust to stray dark pixels (shadows, bleed from
 * neighbouring glyphs, antialiasing noise) that would otherwise flip
 * coloured text — blue, red, green — to black.
 *
 * Defaults to black when virtually nothing contrasts with the bg.
 */
export function findTextColor(pixelData, bg) {
  const buckets = new Map()
  let hits = 0
  for (let i = 0; i < pixelData.length; i += 4) {
    if (pixelData[i + 3] < 50) continue
    const r = pixelData[i], g = pixelData[i + 1], b = pixelData[i + 2]
    const dr = r - bg[0], dg = g - bg[1], db = b - bg[2]
    const dist = dr * dr + dg * dg + db * db
    if (dist < 1500) continue // treat near-bg pixels as background
    hits++
    // Coarse bucket (step of 8 per channel) groups antialiasing variants.
    const key = `${r >> 3}|${g >> 3}|${b >> 3}`
    const e = buckets.get(key)
    if (e) { e.c++; e.r += r; e.g += g; e.b += b; e.d = Math.max(e.d, dist) }
    else buckets.set(key, { c: 1, r, g, b, d: dist })
  }
  if (!hits) return [0, 0, 0]

  // Pick the most common bucket; ties broken by distance from bg so that
  // solid glyph-interior pixels beat antialiased edge pixels.
  let best = null
  for (const e of buckets.values()) {
    if (!best || e.c > best.c || (e.c === best.c && e.d > best.d)) best = e
  }
  return [
    Math.round(best.r / best.c),
    Math.round(best.g / best.c),
    Math.round(best.b / best.c),
  ]
}

/** "#rrggbb" from an [r,g,b] tuple. */
export const rgbToCss = ([r, g, b]) => `rgb(${r},${g},${b})`
