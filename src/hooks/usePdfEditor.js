// Main orchestrator hook. Owns all canvas-related state + behaviour.
// Exposes a flat object that the UI components consume.
//
// Design goals:
//  • SRP — this hook mediates React state ↔ CanvasService; no UI
//    concerns live here.
//  • DIP — React layer talks to `services/`, not to pdf.js / fabric.
//  • Testability — behaviour is driven by stateless service modules.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RS } from '../constants.js'
import { computeFloatingTextAnchor, isTextObject } from '../domain/editorUi.js'
import { initPdfWorker, loadDocument, rasterizePage, renderThumbnail }
  from '../services/pdf/PdfService.js'
import { detectPageContent } from '../services/pdf/detection/index.js'
import { createCanvasService } from '../services/canvas/CanvasService.js'
import { exportEditedPdf } from '../services/export/PdfExporter.js'

/** Initial values for the Properties panel. */
const DEFAULT_PROPS = Object.freeze({
  fill: '#1e3a8a', stroke: '#1e3a8a', sw: 2,
  fs: 16, ff: 'Arial', tc: '#000000', op: 100,
  bs: 4, bc: '#e63946',
  fmt: { bold: false, italic: false, underline: false, strikethrough: false },
})

const hexOf = (c) => {
  if (!c || c === 'transparent' || typeof c !== 'string') return '#000000'
  if (c.startsWith('#')) return c.slice(0, 7)
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return m
    ? '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('')
    : '#000000'
}

export function usePdfEditor({ showToast, setLoad } = {}) {
  // ── Refs: non-rendering mutable state ────────────────────────
  const canvasElRef  = useRef(null)
  const canvasWrapRef = useRef(null)
  const canvasAreaRef = useRef(null)
  const svcRef       = useRef(null)    // CanvasService
  const pdfDocRef    = useRef(null)
  const pgStatesRef  = useRef({})      // pageN → JSON snapshot
  const pgRastersRef = useRef({})      // pageN → {url,w,h}
  const undoStkRef   = useRef([])
  const redoStkRef   = useRef([])
  const drawRef      = useRef({ drawing: false, origin: null, tmp: null })
  const curToolRef   = useRef('select')
  const curPageRef   = useRef(0)
  const propsRef     = useRef({ ...DEFAULT_PROPS })

  // ── Reactive state ──────────────────────────────────────────
  const [hasFile, setHasFile]       = useState(false)
  const [fname, setFname]           = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const [curPage, setCurPage]       = useState(0)
  const [thumbs, setThumbs]         = useState([])
  const [curTool, setCurTool]       = useState('select')
  const [dispZoom, setDispZoom]     = useState(1)
  const [objCount, setObjCount]     = useState(0)
  const [scanStats, setScanStats]   = useState(null)
  const [undoOn, setUndoOn]         = useState(false)
  const [redoOn, setRedoOn]         = useState(false)
  const [selInfo, setSelInfo]       = useState(null)
  const [exporting, setExporting]   = useState(false)
  // Position + kind of the currently-selected text. Drives the floating
  // mini-toolbar. `null` when no text is selected.
  const [textFloat, setTextFloat]   = useState(null)

  // Properties panel (controlled inputs)
  const [fill, setFill]     = useState(DEFAULT_PROPS.fill)
  const [stroke, setStroke] = useState(DEFAULT_PROPS.stroke)
  const [sw, setSw]         = useState(DEFAULT_PROPS.sw)
  const [fs, setFs]         = useState(DEFAULT_PROPS.fs)
  const [ff, setFf]         = useState(DEFAULT_PROPS.ff)
  const [tc, setTc]         = useState(DEFAULT_PROPS.tc)
  const [op, setOp]         = useState(DEFAULT_PROPS.op)
  const [bs, setBs]         = useState(DEFAULT_PROPS.bs)
  const [bc, setBc]         = useState(DEFAULT_PROPS.bc)
  const [fmt, setFmt]       = useState(DEFAULT_PROPS.fmt)

  // ── Keep refs in sync ────────────────────────────────────────
  useEffect(() => { curToolRef.current = curTool }, [curTool])
  useEffect(() => { curPageRef.current = curPage }, [curPage])
  useEffect(() => {
    propsRef.current = { fill, stroke, sw, fs, ff, tc, op, bs, bc, fmt }
  }, [fill, stroke, sw, fs, ff, tc, op, bs, bc, fmt])

  // ── Undo / state snapshots ───────────────────────────────────
  const syncUR = useCallback(() => {
    setUndoOn(undoStkRef.current.length > 1)
    setRedoOn(redoStkRef.current.length > 0)
  }, [])

  const pushUndo = useCallback(() => {
    const svc = svcRef.current; if (!svc) return
    undoStkRef.current.push(svc.snapshot())
    redoStkRef.current = []
    if (undoStkRef.current.length > 50) undoStkRef.current.shift()
    syncUR()
  }, [syncUR])

  const updCnt = useCallback(() => {
    const fc = svcRef.current?.getCanvas()
    setObjCount(fc ? fc.getObjects().length : 0)
  }, [])

  // ── Properties-panel sync on selection ───────────────────────
  const syncPropsUI = useCallback((obj) => {
    if (obj.fill && typeof obj.fill === 'string') setFill(hexOf(obj.fill))
    if (obj.stroke) setStroke(hexOf(obj.stroke))
    if (obj.strokeWidth !== undefined) setSw(obj.strokeWidth)
    if (obj.opacity !== undefined) setOp(Math.round(obj.opacity * 100))
    if (obj.type === 'i-text' || obj.type === 'textbox') {
      if (obj.fontSize) setFs(obj.fontSize)
      if (obj.fontFamily) setFf(obj.fontFamily)
      if (obj.fill) setTc(hexOf(obj.fill))
      setFmt({
        bold: obj.fontWeight === 'bold',
        italic: obj.fontStyle === 'italic',
        underline: !!obj.underline,
        strikethrough: !!obj.linethrough,
      })
    }
  }, [])

  // Positions the floating mini-toolbar right above a text selection, in
  // coordinates relative to the canvas-area scroll container. Returns
  // null if refs aren't ready yet or the object isn't text.
  const computeTextFloat = useCallback((obj) => {
    if (!isTextObject(obj)) return null
    const canvasEl = canvasElRef.current
    const area = canvasAreaRef.current
    if (!canvasEl || !area) return null
    return computeFloatingTextAnchor({
      bounds: obj.getBoundingRect(true),
      canvasRect: canvasEl.getBoundingClientRect(),
      areaRect: area.getBoundingClientRect(),
      scrollLeft: area.scrollLeft,
      scrollTop: area.scrollTop,
      zoom: dispZoom,
    })
  }, [dispZoom])

  // Stable ref so the once-bound canvas event handlers always call the
  // latest computation (e.g. after the user changes zoom).
  const computeTextFloatRef = useRef(computeTextFloat)
  useEffect(() => { computeTextFloatRef.current = computeTextFloat }, [computeTextFloat])

  const syncSel = useCallback((ev) => {
    const svc = svcRef.current; const fc = svc?.getCanvas()
    const obj = fc?.getActiveObject()
    if (!obj) { setSelInfo(null); setTextFloat(null); return }
    syncPropsUI(obj)
    const typeLabels = {
      'rect': 'Rectángulo', 'i-text': 'Texto', 'textbox': 'Texto',
      'ellipse': 'Elipse', 'line': 'Línea', 'image': 'Imagen',
      'path': 'Trazo', 'group': 'Grupo', 'activeSelection': 'Selección',
    }
    const isDetected = obj.data && obj.data.original
    const marker = isDetected ? '[DETECTADO] ' : ''
    setSelInfo({
      type: marker + (typeLabels[obj.type] || obj.type),
      pos: `X: ${Math.round(obj.left)}  Y: ${Math.round(obj.top)}\n${Math.round(obj.getScaledWidth())} × ${Math.round(obj.getScaledHeight())} px`,
    })
    setTextFloat(isTextObject(obj) ? computeTextFloat(obj) : null)
  }, [syncPropsUI, computeTextFloat])

  // ── Mouse drawing (shapes + text tool) ──────────────────────
  const onMouseDown = useCallback((e) => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const ptr = fc.getPointer(e.e)
    const p = propsRef.current
    const tool = curToolRef.current
    if (tool === 'text') {
      const tb = new window.fabric.IText('Escribe aquí', {
        left: ptr.x, top: ptr.y, fontFamily: p.ff, fontSize: +p.fs, fill: p.tc,
        selectable: true, editable: true, padding: 3,
        fontWeight:  p.fmt.bold    ? 'bold'    : 'normal',
        fontStyle:   p.fmt.italic  ? 'italic'  : 'normal',
        underline:   !!p.fmt.underline,
        linethrough: !!p.fmt.strikethrough,
      })
      fc.add(tb); fc.setActiveObject(tb); tb.enterEditing(); tb.selectAll()
      pushUndo()
      return
    }
    if (tool === 'erase') {
      const t = fc.findTarget(e.e)
      if (t && t !== fc.backgroundImage) { fc.remove(t); fc.renderAll(); pushUndo() }
      return
    }
    if (['rect', 'ellipse', 'line', 'arrow'].includes(tool)) {
      drawRef.current.drawing = true
      drawRef.current.origin  = { x: ptr.x, y: ptr.y }
      const base = {
        left: ptr.x, top: ptr.y, fill: 'transparent', stroke: p.stroke,
        strokeWidth: Math.max(p.sw, 1), opacity: p.op / 100,
        selectable: false, hasBorders: false, hasControls: false,
      }
      let obj
      if (tool === 'rect') obj = new window.fabric.Rect({ ...base, width: 1, height: 1, fill: p.fill + '28' })
      else if (tool === 'ellipse') obj = new window.fabric.Ellipse({ ...base, rx: 0.5, ry: 0.5, fill: p.fill + '28' })
      else obj = new window.fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: p.stroke, strokeWidth: Math.max(p.sw, 1), opacity: p.op / 100,
        selectable: false, hasBorders: false, hasControls: false,
      })
      drawRef.current.tmp = obj
      fc.add(obj)
    }
  }, [pushUndo])

  const onMouseMove = useCallback((e) => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const { drawing, tmp, origin } = drawRef.current
    if (!drawing || !tmp) return
    const ptr = fc.getPointer(e.e)
    const tool = curToolRef.current
    if (tool === 'rect') {
      const w = ptr.x - origin.x, h = ptr.y - origin.y
      tmp.set({ width: Math.abs(w), height: Math.abs(h), left: w < 0 ? ptr.x : origin.x, top: h < 0 ? ptr.y : origin.y })
    } else if (tool === 'ellipse') {
      tmp.set({
        rx: Math.abs(ptr.x - origin.x) / 2, ry: Math.abs(ptr.y - origin.y) / 2,
        left: Math.min(origin.x, ptr.x), top: Math.min(origin.y, ptr.y),
      })
    } else {
      tmp.set({ x2: ptr.x, y2: ptr.y })
    }
    fc.renderAll()
  }, [])

  const onMouseUp = useCallback(() => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const { drawing, tmp } = drawRef.current
    if (!drawing || !tmp) { drawRef.current.drawing = false; return }
    drawRef.current.drawing = false
    const tool = curToolRef.current
    if (tool === 'arrow') {
      const l = tmp
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1
      const ang = Math.atan2(dy, dx) * 180 / Math.PI, hs = 14
      const ax = l.x2 - hs * Math.cos((ang - 30) * Math.PI / 180)
      const ay = l.y2 - hs * Math.sin((ang - 30) * Math.PI / 180)
      const bx = l.x2 - hs * Math.cos((ang + 30) * Math.PI / 180)
      const by = l.y2 - hs * Math.sin((ang + 30) * Math.PI / 180)
      const head = new window.fabric.Polygon(
        [{ x: l.x2, y: l.y2 }, { x: ax, y: ay }, { x: bx, y: by }],
        { fill: l.stroke, selectable: false, hasBorders: false, hasControls: false }
      )
      const grp = new window.fabric.Group([tmp, head], { selectable: true })
      fc.remove(tmp); fc.add(grp); fc.setActiveObject(grp)
    } else {
      tmp.set('selectable', true); fc.setActiveObject(tmp)
    }
    drawRef.current.tmp = null
    fc.renderAll()
    pushUndo()
    setCurTool('select')
  }, [pushUndo])

  // ── Zoom ────────────────────────────────────────────────────
  const applyZoom = useCallback(() => {
    const w = canvasWrapRef.current
    const fc = svcRef.current?.getCanvas()
    if (!w) return
    if (!fc) { w.style.transform = ''; return }
    const sw2 = fc.width * dispZoom
    const sh2 = fc.height * dispZoom
    w.style.width  = sw2 + 'px'
    w.style.height = sh2 + 'px'
    w.style.transform = `scale(${dispZoom})`
    w.style.transformOrigin = 'top left'
  }, [dispZoom])
  useEffect(applyZoom, [applyZoom])

  // Recompute the floating mini-toolbar position whenever the zoom
  // changes so it stays glued to the selected text.
  useEffect(() => {
    const fc = svcRef.current?.getCanvas()
    const obj = fc?.getActiveObject()
    if (!obj) return
    const f = computeTextFloatRef.current
    if (f) setTextFloat(f(obj))
  }, [dispZoom])

  const adjZoom = useCallback((d) => setDispZoom(z => Math.min(3, Math.max(0.2, z + d))), [])
  const fitPage = useCallback(() => {
    const a = canvasAreaRef.current
    const fc = svcRef.current?.getCanvas()
    if (!a || !fc) return
    setDispZoom(Math.min(
      (a.clientWidth - 48) / fc.width,
      (a.clientHeight - 48) / fc.height,
      0.95,
    ))
  }, [])

  // ── Tool application ────────────────────────────────────────
  const applyTool = useCallback(() => {
    const fc = svcRef.current?.getCanvas(); if (!fc) return
    const tool = curToolRef.current
    fc.isDrawingMode = false; fc.selection = false; fc.defaultCursor = 'crosshair'
    fc.getObjects().forEach(o => o.set('selectable', false))
    if (tool === 'select') {
      fc.selection = true; fc.defaultCursor = 'default'
      fc.getObjects().forEach(o => o.set('selectable', true))
    } else if (tool === 'draw') {
      fc.isDrawingMode = true
      if (fc.freeDrawingBrush) {
        fc.freeDrawingBrush.width = propsRef.current.bs
        fc.freeDrawingBrush.color = propsRef.current.bc
      }
    } else if (tool === 'highlight') {
      fc.isDrawingMode = true
      if (fc.freeDrawingBrush) {
        fc.freeDrawingBrush.color = 'rgba(255,230,0,.38)'
        fc.freeDrawingBrush.width = 18
      }
    } else if (tool === 'erase') {
      fc.defaultCursor = 'not-allowed'
      fc.getObjects().forEach(o => o.set('selectable', true))
    }
    fc.renderAll()
  }, [])
  useEffect(applyTool, [curTool, applyTool])

  useEffect(() => {
    const fc = svcRef.current?.getCanvas()
    if (!fc || !fc.freeDrawingBrush) return
    if (curToolRef.current === 'draw') {
      fc.freeDrawingBrush.width = bs
      fc.freeDrawingBrush.color = bc
    }
  }, [bs, bc])

  // ── Canvas service init (once on mount) ─────────────────────
  const ensureService = useCallback(() => {
    if (svcRef.current) return svcRef.current
    const svc = createCanvasService({ element: canvasElRef.current, fabric: window.fabric })
    svc.setHandlers({
      mouseDown: onMouseDown,
      mouseMove: onMouseMove,
      mouseUp:   onMouseUp,
      modify: (e) => {
        pushUndo(); updCnt()
        // Keep the floating mini-toolbar pinned to the text after moves
        // / resizes, instead of snapping back to the pre-edit position.
        const fc = svcRef.current?.getCanvas()
        const obj = fc?.getActiveObject()
        const f = computeTextFloatRef.current
        if (obj && f) setTextFloat(f(obj))
      },
      pathCreated: ()   => { pushUndo(); updCnt() },
      selection: syncSel,
      clear:     () => { setSelInfo(null); setTextFloat(null) },
      count:     updCnt,
    })
    svcRef.current = svc
    if (import.meta.env.DEV) window.__svc = svc
    return svc
  }, [onMouseDown, onMouseMove, onMouseUp, pushUndo, updCnt, syncSel])

  // ── Detection ───────────────────────────────────────────────
  //
  // `silent` mode is the auto-detect path used on page load: shows a
  // lighter status message and, after the pairs are built, resets the
  // undo stack so detection becomes the baseline instead of something
  // the user can "undo" away. Adobe's editor behaves the same way: the
  // user never sees a "pre-detection" state.
  const detectContent = useCallback(async (opts = {}) => {
    const { silent = false } = opts
    const pdf = pdfDocRef.current; const svc = svcRef.current
    if (!pdf || !svc) return
    const fc = svc.getCanvas()
    setLoad?.(true, silent ? 'Preparando edición...' : 'Escaneando página...')
    try {
      svc.getAllDetected().forEach(o => fc.remove(o))
      const page = await pdf.getPage(curPageRef.current)
      if (!silent) setLoad?.(true, 'Extrayendo contenido...')
      const { pairs, originalUrl, txtCnt, imgCnt } = await detectPageContent({
        page, fabric: window.fabric, pdfjsLib: window.pdfjsLib,
      })

      await new Promise(res => {
        window.fabric.Image.fromURL(originalUrl, img => {
          fc.setBackgroundImage(img, () => res(), { scaleX: 1, scaleY: 1 })
        })
      })
      for (const { cover, obj } of pairs) {
        fc.add(cover); fc.add(obj)
      }
      fc.renderAll(); updCnt()
      setScanStats({ txt: txtCnt, img: imgCnt })

      if (silent) {
        // Detection = baseline. Any future edit is undoable back to
        // "just the detected, untouched page".
        undoStkRef.current = [svc.snapshot()]
        redoStkRef.current = []
        syncUR()
      } else {
        pushUndo()
        showToast?.(
          `Detectado: ${txtCnt} texto${txtCnt !== 1 ? 's' : ''}` +
          (imgCnt ? `, ${imgCnt} imagen${imgCnt !== 1 ? 'es' : ''}` : ''),
          3500,
        )
      }
    } catch (err) {
      if (!silent) showToast?.('Error en detección: ' + err.message)
      console.error(err)
    }
    setLoad?.(false)
  }, [pushUndo, updCnt, setLoad, showToast, syncUR])

  // ── PDF loading / paging ────────────────────────────────────
  const gotoPage = useCallback(async (n) => {
    const pdf = pdfDocRef.current
    if (!pdf || n < 1 || n > pdf.numPages) return
    const svc = ensureService()
    const fc = svc.getCanvas()
    const prev = curPageRef.current
    if (fc && prev > 0) pgStatesRef.current[prev] = svc.snapshot()
    setCurPage(n)

    if (!pgRastersRef.current[n]) {
      const page = await pdf.getPage(n)
      const { url, viewport } = await rasterizePage(page, RS)
      pgRastersRef.current[n] = { url, w: viewport.width, h: viewport.height }
    }
    const { url, w, h } = pgRastersRef.current[n]
    svc.init(w, h)

    const st = pgStatesRef.current[n]
    // If we've already edited this page, restore the snapshot (pairs
    // already present). Otherwise, load the raster and kick off silent
    // auto-detection so the user can click-to-edit text immediately —
    // no "Escanear" button needed, Adobe-style.
    const needsDetect = !st
    const finish = () => {
      svc.getCanvas().renderAll(); updCnt(); applyZoom(); applyTool()
      if (needsDetect) detectContent({ silent: true })
    }
    if (st) {
      svc.restore(st, finish)
    } else {
      window.fabric.Image.fromURL(url, img => {
        svc.getCanvas().setBackgroundImage(img, () => finish(), { scaleX: 1, scaleY: 1 })
      })
    }
    undoStkRef.current = []; redoStkRef.current = []; syncUR()
    setScanStats(null)
  }, [ensureService, applyZoom, applyTool, updCnt, syncUR, detectContent])

  const loadPDF = useCallback(async (file) => {
    if (!file) return
    initPdfWorker()
    setFname(file.name)
    setLoad?.(true, 'Cargando PDF...')
    try {
      const pdf = await loadDocument(file)
      pdfDocRef.current = pdf
      if (import.meta.env.DEV) window.__pdf = pdf
      setTotalPages(pdf.numPages)
      pgStatesRef.current = {}
      pgRastersRef.current = {}
      undoStkRef.current = []; redoStkRef.current = []; syncUR()
      setScanStats(null); setHasFile(true)
      setLoad?.(true, 'Generando miniaturas...')
      const newThumbs = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        newThumbs.push({ n: i, url: await renderThumbnail(page) })
      }
      setThumbs(newThumbs)
      await gotoPage(1)
      showToast?.(`${file.name} — ${pdf.numPages} página${pdf.numPages > 1 ? 's' : ''}`)
    } catch (err) {
      showToast?.('Error: ' + err.message); console.error(err)
    }
    setLoad?.(false)
  }, [gotoPage, syncUR, showToast, setLoad])

  const delDetected = useCallback(() => {
    const svc = svcRef.current; if (!svc) return
    const fc = svc.getCanvas()
    const objs = svc.getAllDetected()
    if (!objs.length) { showToast?.('Sin objetos detectados'); return }
    if (!window.confirm(`¿Eliminar ${objs.length} objetos detectados?`)) return
    objs.forEach(o => fc.remove(o))
    fc.discardActiveObject(); fc.renderAll(); pushUndo()
    showToast?.(objs.length + ' objetos eliminados')
  }, [pushUndo, showToast])


  // ── Properties application ───────────────────────────────────
  const applyToActive = useCallback((patch) => {
    const svc = svcRef.current; const fc = svc?.getCanvas()
    const obj = fc?.getActiveObject(); if (!obj) return
    const one = o => { svc.reveal(o); o.set(patch) }
    if (obj.type === 'activeSelection' && obj._objects) obj._objects.forEach(one)
    else one(obj)
    fc.renderAll()
  }, [])

  const togFmt = useCallback((f) => {
    const svc = svcRef.current; const fc = svc?.getCanvas()
    const obj = fc?.getActiveObject(); if (!obj) return
    const map = {
      bold:       ['fontWeight', 'bold', 'normal'],
      italic:     ['fontStyle',  'italic', 'normal'],
      underline:  ['underline',  true, false],
      strikethrough: ['linethrough', true, false],
    }
    const [prop, on, off] = map[f]
    const one = o => {
      svc.reveal(o)
      const wasOn = o[prop] === on
      o.set(prop, wasOn ? off : on)
    }
    if (obj.type === 'activeSelection' && obj._objects) obj._objects.forEach(one)
    else one(obj)
    const cur = obj.type === 'activeSelection' ? obj._objects[0] : obj
    setFmt(prev => ({ ...prev, [f]: cur && cur[map[f][0]] === on }))
    fc.renderAll()
    pushUndo()
  }, [pushUndo])

  const canFormatText = useCallback(() => {
    const obj = svcRef.current?.getCanvas()?.getActiveObject()
    if (!obj) return false
    if (isTextObject(obj)) return true
    return obj.type === 'activeSelection' && obj._objects?.some(isTextObject)
  }, [])

  // ── Insert image from disk ──────────────────────────────────
  const insertImg = useCallback((file) => {
    const svc = svcRef.current; const fc = svc?.getCanvas()
    if (!file || !fc) return
    const r = new FileReader()
    r.onload = ev => {
      window.fabric.Image.fromURL(ev.target.result, img => {
        const mw = fc.width * 0.5
        if (img.width > mw) img.scaleToWidth(mw)
        img.set({
          left: fc.width / 2 - img.getScaledWidth() / 2,
          top:  fc.height / 2 - img.getScaledHeight() / 2,
          selectable: true,
        })
        fc.add(img); fc.setActiveObject(img); fc.renderAll()
        pushUndo(); setCurTool('select')
        showToast?.('Imagen insertada')
      })
    }
    r.readAsDataURL(file)
  }, [pushUndo, showToast])

  // ── Selection ops ───────────────────────────────────────────
  const delSel = useCallback(() => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const sel = fc.getActiveObjects(); if (!sel.length) return
    sel.forEach(o => {
      if (svc.isHidden(o)) svc.revealPartnerOf(o)
      fc.remove(o)
    })
    fc.discardActiveObject(); fc.renderAll(); pushUndo()
  }, [pushUndo])
  const selAll = useCallback(() => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const objs = fc.getObjects(); if (!objs.length) return
    fc.setActiveObject(new window.fabric.ActiveSelection(objs, { canvas: fc })); fc.renderAll()
    showToast?.(objs.length + ' objetos seleccionados')
  }, [showToast])
  const dupSel = useCallback(() => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const obj = fc.getActiveObject(); if (!obj) return
    obj.clone(c => {
      c.set({ left: obj.left + 18, top: obj.top + 18, evented: true })
      fc.add(c); fc.setActiveObject(c); fc.renderAll(); pushUndo()
    })
  }, [pushUndo])
  const clearPage = useCallback(() => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    if (!window.confirm('¿Eliminar todas las anotaciones de esta página?')) return
    fc.getObjects().forEach(o => fc.remove(o))
    fc.discardActiveObject(); fc.renderAll(); pushUndo()
    showToast?.('Página limpiada')
  }, [pushUndo, showToast])

  // ── Undo / Redo ─────────────────────────────────────────────
  const undoA = useCallback(() => {
    if (undoStkRef.current.length < 2) return
    redoStkRef.current.push(undoStkRef.current.pop())
    svcRef.current.restore(undoStkRef.current[undoStkRef.current.length - 1], () => { updCnt(); syncUR() })
  }, [updCnt, syncUR])
  const redoA = useCallback(() => {
    if (!redoStkRef.current.length) return
    const st = redoStkRef.current.pop()
    undoStkRef.current.push(st)
    svcRef.current.restore(st, () => { updCnt(); syncUR() })
  }, [updCnt, syncUR])

  const nudge = useCallback((dx, dy) => {
    const svc = svcRef.current; const fc = svc?.getCanvas(); if (!fc) return
    const o = fc.getActiveObject(); if (!o) return
    svc.reveal(o)
    if (o.type === 'activeSelection' && o._objects) o._objects.forEach(svc.reveal)
    o.left += dx; o.top += dy
    fc.renderAll()
  }, [])

  // ── Export ──────────────────────────────────────────────────
  const exportPDF = useCallback(async () => {
    const pdf = pdfDocRef.current; if (!pdf) return
    setExporting(true)
    const svc = svcRef.current; const fc = svc?.getCanvas()
    const pn = curPageRef.current
    if (fc && pn > 0) pgStatesRef.current[pn] = svc.snapshot()
    try {
      await exportEditedPdf({
        fabric: window.fabric, jspdf: window.jspdf,
        pdf, pageStates: pgStatesRef.current, pageRasters: pgRastersRef.current,
        fileName: fname, onProgress: (m) => setLoad?.(true, m),
      })
      showToast?.('PDF exportado correctamente')
    } catch (err) {
      showToast?.('Error: ' + err.message); console.error(err)
    }
    setLoad?.(false); setExporting(false)
  }, [fname, showToast, setLoad])

  // ── Controlled-input callbacks for Properties panel ─────────
  const propsPanel = useMemo(() => ({
    fill,    setFill:    v => { setFill(v);    applyToActive({ fill: v }) },
    stroke,  setStroke:  v => { setStroke(v);  applyToActive({ stroke: v }) },
    sw,      setSw:      v => { setSw(v);      applyToActive({ strokeWidth: v }) },
    fs,      setFs:      v => { setFs(v);      applyToActive({ fontSize: +v }) },
    ff,      setFf:      v => { setFf(v);      applyToActive({ fontFamily: v }) },
    tc,      setTc:      v => { setTc(v);      applyToActive({ fill: v }) },
    op,      setOp:      v => { setOp(v);      applyToActive({ opacity: v / 100 }) },
    bs,      setBs,
    bc,      setBc,
    fmt,     togFmt,
    selInfo,
  }), [fill, stroke, sw, fs, ff, tc, op, bs, bc, fmt, selInfo, applyToActive, togFmt])

  return {
    // refs
    canvasElRef, canvasWrapRef, canvasAreaRef,
    // state
    hasFile, fname, totalPages, curPage, thumbs, curTool,
    dispZoom, objCount, scanStats, undoOn, redoOn, exporting,
    textFloat,
    // setters / actions
    setCurTool,
    loadPDF, gotoPage, prevPg: () => gotoPage(curPage - 1), nextPg: () => gotoPage(curPage + 1),
    detectContent, delDetected,
    insertImg, delSel, selAll, dupSel, clearPage,
    undoA, redoA, adjZoom, fitPage, nudge,
    exportPDF,
    canFormatText,
    // panel bundle
    propsPanel,
  }
}
