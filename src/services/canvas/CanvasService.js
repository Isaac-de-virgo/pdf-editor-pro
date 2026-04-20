// Facade + Command-lite wrapper around a fabric.Canvas.
// Encapsulates canvas lifecycle, event wiring, pair registry and the
// reveal logic that was previously scattered across App.jsx.

import { PairRegistry } from './PairRegistry.js'

/**
 * Factory producing a CanvasService bound to a single DOM canvas element.
 */
export function createCanvasService({ element, fabric }) {
  let fc = null
  const registry = new PairRegistry()

  const handlers = {
    modify:   () => {},
    hookEvents: () => {},
    selection: () => {},
    clear:    () => {},
    count:    () => {},
  }

  // ── Reveal primitives ─────────────────────────────────────────
  //
  // A "pair" is the (cover, obj) tuple produced by detection. Covers
  // hide the original PDF raster text, so revealing them eagerly is
  // destructive: every stray click would paint a white box over text the
  // user never intended to modify. To prevent that we distinguish two
  // reveal strengths:
  //
  //   • revealObj(obj)  — shows just the editable IText. Used during
  //                       transient interactions (drag, scale, rotate)
  //                       so the user can *see* what they're moving,
  //                       without committing the destructive cover.
  //
  //   • revealPair(obj) — shows both obj and its cover. Used only when
  //                       we are sure the user meant to modify the item:
  //                       after a real move/resize, when entering text
  //                       editing, or on explicit programmatic calls.
  //
  // `hidePair` rolls both sides back to opacity 0. Called when a
  // modification event turns out to be a no-op (e.g. a 1 px jitter drag
  // or entering edit mode and exiting without typing).

  function isHidden(obj) {
    return obj && obj.data && obj.data.original && obj.opacity === 0
  }
  function isDetectedOriginal(obj) {
    return !!(obj && obj.data && obj.data.original)
  }
  function revealObj(obj) {
    if (!isDetectedOriginal(obj)) return false
    if (obj.opacity === 1) return false
    obj.set('opacity', 1)
    return true
  }
  function revealPair(obj) {
    if (!isDetectedOriginal(obj)) return false
    obj.set('opacity', 1)
    const mate = registry.partnerOf(obj)
    if (mate) mate.set('opacity', 1)
    return true
  }
  function hidePair(obj) {
    if (!isDetectedOriginal(obj)) return
    obj.set('opacity', 0)
    const mate = registry.partnerOf(obj)
    if (mate) mate.set('opacity', 0)
  }

  // Public name kept for backwards compatibility with UI callers that
  // want to fully reveal before applying a user-driven change (props
  // panel, keyboard nudge, format toggle).
  const reveal = revealPair

  function forEachTarget(tgt, fn) {
    if (!tgt) return
    if (tgt.type === 'activeSelection' && tgt._objects) tgt._objects.forEach(fn)
    else fn(tgt)
  }
  function revealGroupContents(tgt) { forEachTarget(tgt, revealPair) }

  // Detects whether the object was actually modified relative to the
  // snapshot stored at detection time. Tiny thresholds swallow subpixel
  // jitter introduced by accidental click-drags.
  function hasRealChange(obj) {
    const o = obj && obj.data && obj.data.orig
    if (!o) return true
    const POS_EPS = 0.75
    const SCL_EPS = 0.01
    const ROT_EPS = 0.5
    if (Math.abs((obj.left   || 0) - (o.left   || 0)) > POS_EPS) return true
    if (Math.abs((obj.top    || 0) - (o.top    || 0)) > POS_EPS) return true
    if (Math.abs((obj.scaleX || 1) - (o.scaleX || 1)) > SCL_EPS) return true
    if (Math.abs((obj.scaleY || 1) - (o.scaleY || 1)) > SCL_EPS) return true
    if (Math.abs((obj.angle  || 0) - (o.angle  || 0)) > ROT_EPS) return true
    if (typeof obj.text === 'string' && typeof o.text === 'string' &&
        obj.text !== o.text) return true
    return false
  }

  function commitOrRollback(tgt) {
    forEachTarget(tgt, o => {
      if (!isDetectedOriginal(o)) return
      if (hasRealChange(o)) revealPair(o)
      else hidePair(o)
    })
  }

  // ── Canvas lifecycle ─────────────────────────────────────────
  /** (Re)create the fabric canvas with fresh dimensions. */
  function init(width, height) {
    if (fc) fc.dispose()
    element.width = width
    element.height = height
    fc = new fabric.Canvas(element, { width, height, preserveObjectStacking: true })
    registry.clear()
    bindEvents()
    return fc
  }

  function dispose() {
    if (fc) fc.dispose()
    fc = null
    registry.clear()
  }

  function bindEvents() {
    if (!fc) return
    fc.off()
    fc.on('mouse:down',            e => handlers.mouseDown?.(e))
    fc.on('mouse:move',            e => handlers.mouseMove?.(e))
    fc.on('mouse:up',              e => handlers.mouseUp?.(e))
    // Only commit-level events promote the pair to fully revealed. Transient
    // interactions just show the IText so the user can see what they're
    // dragging, without eagerly painting a white cover over whatever sits
    // beneath.
    fc.on('object:moving',         e => forEachTarget(e && e.target, revealObj))
    fc.on('object:scaling',        e => forEachTarget(e && e.target, revealObj))
    fc.on('object:rotating',       e => forEachTarget(e && e.target, revealObj))
    fc.on('object:modified',       e => { commitOrRollback(e && e.target); handlers.modify?.(e) })
    fc.on('text:changed',          e => e && e.target && revealPair(e.target))
    fc.on('text:editing:entered',  e => e && e.target && revealPair(e.target))
    fc.on('text:editing:exited',   e => {
      const t = e && e.target
      if (!t || !isDetectedOriginal(t)) return
      if (!hasRealChange(t)) hidePair(t)
    })
    fc.on('path:created',          e => handlers.pathCreated?.(e))
    fc.on('selection:created',     e => handlers.selection?.(e))
    fc.on('selection:updated',     e => handlers.selection?.(e))
    fc.on('selection:cleared',     e => handlers.clear?.(e))
    fc.on('object:added',          e => { registry.add(e.target); handlers.count?.() })
    fc.on('object:removed',        e => { registry.remove(e.target); handlers.count?.() })
  }

  /** Replace the set of callbacks invoked by the service. */
  function setHandlers(next) { Object.assign(handlers, next) }

  // ── Pair revealing (manual triggers) ─────────────────────────
  function revealPartnerOf(obj) {
    const mate = registry.partnerOf(obj)
    if (mate) mate.set('opacity', 1)
  }

  // ── Detected-object helpers ──────────────────────────────────
  function getDetectedOriginals() {
    return fc ? fc.getObjects().filter(o => o.data && o.data.original) : []
  }
  function getAllDetected() {
    return fc ? fc.getObjects().filter(o => o.data && o.data.detected) : []
  }

  // ── State serialisation ──────────────────────────────────────
  /** JSON snapshot including `.data` so pair metadata survives. */
  function snapshot() { return fc ? fc.toJSON(['data']) : null }

  /**
   * Load a previously-taken snapshot. Re-binds events, rebuilds registry
   * and falls back to a white bg colour when the snapshot has no bg
   * image (detected page scenario).
   */
  function restore(state, onDone) {
    if (!fc) return
    fc.loadFromJSON(state, () => {
      const finalise = () => {
        bindEvents()
        registry.rebuildFrom(fc)
        fc.renderAll()
        onDone && onDone()
      }
      if (!fc.backgroundImage) fc.setBackgroundColor('#ffffff', finalise)
      else finalise()
    })
  }

  return {
    // lifecycle
    init, dispose, setHandlers,
    // access
    getCanvas: () => fc,
    getRegistry: () => registry,
    // reveal helpers
    reveal, revealGroupContents, revealPartnerOf, isHidden,
    // queries
    getDetectedOriginals, getAllDetected,
    // persistence
    snapshot, restore,
    // re-binding (used after external loadFromJSON)
    bindEvents,
  }
}
