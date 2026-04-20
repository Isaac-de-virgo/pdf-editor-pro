// Registry pattern: maps a `pairId` to its two fabric objects
// ({obj, cover}) so the UI can look up a pair in O(1) instead of
// scanning every object on the canvas.
//
// The registry is rebuilt on every page switch / state restore by
// scanning current fabric objects and grouping them by pair-id — the
// `data.pairId` is part of the serialised state, so rebuilding is
// deterministic.

export class PairRegistry {
  constructor() {
    /** @type {Map<string, {obj?: fabric.Object, cover?: fabric.Object}>} */
    this._byId = new Map()
  }

  clear() { this._byId.clear() }

  /** Re-scan a fabric canvas and rebuild the registry. */
  rebuildFrom(fc) {
    this.clear()
    if (!fc) return
    for (const o of fc.getObjects()) this.add(o)
  }

  /** Register a single fabric object (does nothing if not detected). */
  add(obj) {
    const pid = obj && obj.data && obj.data.pairId
    if (!pid) return
    const slot = this._byId.get(pid) || {}
    if (obj.data.type === 'cover-pair') slot.cover = obj
    else slot.obj = obj
    this._byId.set(pid, slot)
  }

  /** Remove a single fabric object from the registry. */
  remove(obj) {
    const pid = obj && obj.data && obj.data.pairId
    if (!pid) return
    const slot = this._byId.get(pid)
    if (!slot) return
    if (slot.cover === obj) slot.cover = undefined
    if (slot.obj   === obj) slot.obj   = undefined
    if (!slot.cover && !slot.obj) this._byId.delete(pid)
    else this._byId.set(pid, slot)
  }

  /** Given an obj or cover, return its partner (the other half). */
  partnerOf(obj) {
    const pid = obj && obj.data && obj.data.pairId
    if (!pid) return null
    const slot = this._byId.get(pid)
    if (!slot) return null
    return slot.obj === obj ? (slot.cover || null) : (slot.obj || null)
  }
}
