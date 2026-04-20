#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// PDF Editor MCP Server
//
// Exposes the full PDF-editor feature set (open / detect / add
// annotations / modify detected text / export) as MCP tools over
// stdio. Any MCP-compatible client (Claude Desktop, MCP Inspector,
// Windsurf, Cursor, …) can drive the editor via natural language.
//
// All coordinates are in PDF points with TOP-LEFT origin
// (x →, y ↓). See ./session.js for details.
// ─────────────────────────────────────────────────────────────
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getSession, FONT_FAMILIES } from './session.js'

const server = new McpServer({
  name: 'pdf-editor-pro',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
  instructions:
    'Tools to open, inspect, annotate and export PDF documents. ' +
    'Coordinates are in PDF points with top-left origin (x→, y↓). ' +
    'Typical workflow: open_pdf → detect_page → (modify_detected_text | add_* | replace_text) → export_pdf.',
})

/* ═══════════════════════  HELPERS  ═══════════════════════ */

const ok = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, jsonReplacer, 2) }],
})

const err = (msg) => ({
  content: [{ type: 'text', text: `Error: ${msg}` }],
  isError: true,
})

// Strip huge / non-serialisable fields from edit objects when they
// travel over the wire (imageBytes can be megabytes).
function jsonReplacer(key, value) {
  if (key === 'imageBytes' && value && value.length != null) {
    return `<${value.length} bytes omitted>`
  }
  if (value instanceof Uint8Array) return `<${value.length} bytes>`
  return value
}

function wrap(handler) {
  return async (args) => {
    try { return await handler(args) }
    catch (e) {
      console.error('[mcp]', e)
      return err(e && e.message ? e.message : String(e))
    }
  }
}

const colorSchema = z.string().describe(
  'CSS color: hex (#rrggbb), rgb(r,g,b), or name (black, white, red, …)'
)

const fontFamilySchema = z.string().describe(
  `Font family. Mapped to a PDF standard font. Known aliases: ${FONT_FAMILIES.join(', ')}.`
)

/* ═══════════════════════  TOOLS  ═══════════════════════ */

server.tool(
  'open_pdf',
  'Load a PDF file from disk into the current session. Subsequent tools operate on this document until close_pdf or a new open_pdf.',
  {
    path: z.string().describe('Absolute or relative filesystem path to a .pdf file'),
  },
  wrap(async ({ path }) => {
    const info = await getSession().open(path)
    return ok({ opened: true, ...info })
  })
)

server.tool(
  'close_pdf',
  'Discard the currently loaded PDF and all pending edits.',
  {},
  wrap(async () => {
    getSession().close()
    return ok({ closed: true })
  })
)

server.tool(
  'get_status',
  'Summary of the current session: whether a PDF is open, its path, page count, page sizes, which pages have been detected, and the number of queued edits per page.',
  {},
  wrap(async () => ok(getSession().status()))
)

server.tool(
  'get_page_size',
  'Return width/height in PDF points for a given page.',
  { page: z.number().int().min(1) },
  wrap(async ({ page }) => ok({ page, ...getSession().getPageSize(page) }))
)

server.tool(
  'detect_page',
  'Extract editable content on a page: text runs (with font, size, weight, style, position) and images (with bounding box). Results are cached so calling it repeatedly is cheap. Returns an array of elements; each has a stable id (e.g. "t3_7" or "i1_2") that can be used with modify_detected_text / delete_detected.',
  { page: z.number().int().min(1) },
  wrap(async ({ page }) => {
    const d = await getSession().detectPage(page)
    return ok({
      page,
      pageSize: d.pageSize,
      textCount: d.text.length,
      imageCount: d.images.length,
      text: d.text.map(stripInternal),
      images: d.images.map(stripInternal),
    })
  })
)

server.tool(
  'list_detected',
  'List the cached detected elements for a page (call detect_page first).',
  {
    page: z.number().int().min(1),
    kind: z.enum(['text', 'image', 'all']).optional().default('all'),
  },
  wrap(async ({ page, kind }) => {
    const s = getSession()
    s._assertPage(page)
    const d = s._detection[page]
    if (!d) throw new Error(`Page ${page} not detected yet. Call detect_page first.`)
    const out = []
    if (kind === 'text' || kind === 'all') out.push(...d.text.map(stripInternal))
    if (kind === 'image' || kind === 'all') out.push(...d.images.map(stripInternal))
    return ok({ page, count: out.length, items: out })
  })
)

server.tool(
  'list_edits',
  'List queued edits for a page (additions, covers, modifications). Each edit has an id usable with remove_edit.',
  { page: z.number().int().min(1) },
  wrap(async ({ page }) => {
    const list = getSession().listEdits(page).map(stripInternal)
    return ok({ page, count: list.length, edits: list })
  })
)

server.tool(
  'add_text',
  'Draw a new text string on a page. Built-in fonts support Latin-1 only; to render characters outside Latin-1 (CJK, emoji, extended Unicode) pass a fontPath to a TrueType file or call set_default_font first.',
  {
    page: z.number().int().min(1),
    x: z.number().describe('X in PDF points, origin top-left.'),
    y: z.number().describe('Y in PDF points, origin top-left (top of the text box).'),
    text: z.string(),
    fontSize: z.number().positive().optional().default(14),
    fontFamily: fontFamilySchema.optional().default('Helvetica'),
    fontPath: z.string().optional().describe(
      'Filesystem path to a .ttf/.otf font file. When set, that font is used instead of the standard PDF fonts (required for non-Latin-1 characters).'
    ),
    color: colorSchema.optional().default('#000000'),
    bold: z.boolean().optional().default(false),
    italic: z.boolean().optional().default(false),
    opacity: z.number().min(0).max(1).optional().default(1),
    rotation: z.number().optional().describe('Rotation in degrees (counter-clockwise).'),
  },
  wrap(async (a) => {
    const e = getSession().addEdit(a.page, { kind: 'text', ...rest(a, 'page') })
    return ok({ added: 'text', edit: stripInternal(e) })
  })
)

server.tool(
  'set_default_font',
  'Register a custom TrueType font (.ttf / .otf) as the default for every subsequent text edit that does not specify its own fontPath. Required to render characters outside Latin-1 (CJK, emoji, arabic, cyrillic, …). Pass an empty string to clear the default.',
  {
    path: z.string().describe('Absolute/relative path to a TTF or OTF file (or "" to clear).'),
  },
  wrap(async ({ path }) => {
    const r = getSession().setDefaultFontPath(path || null)
    return ok(r)
  })
)

server.tool(
  'add_rectangle',
  'Draw a rectangle. Omit fill for stroke-only, omit stroke+strokeWidth for fill-only.',
  {
    page: z.number().int().min(1),
    x: z.number(), y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    fill: colorSchema.optional(),
    stroke: colorSchema.optional(),
    strokeWidth: z.number().min(0).optional().default(0),
    opacity: z.number().min(0).max(1).optional().default(1),
  },
  wrap(async (a) => {
    const e = getSession().addEdit(a.page, { kind: 'rect', ...rest(a, 'page') })
    return ok({ added: 'rectangle', edit: stripInternal(e) })
  })
)

server.tool(
  'add_ellipse',
  'Draw an ellipse inscribed in the x/y/width/height box (top-left origin).',
  {
    page: z.number().int().min(1),
    x: z.number(), y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    fill: colorSchema.optional(),
    stroke: colorSchema.optional(),
    strokeWidth: z.number().min(0).optional().default(0),
    opacity: z.number().min(0).max(1).optional().default(1),
  },
  wrap(async (a) => {
    const e = getSession().addEdit(a.page, { kind: 'ellipse', ...rest(a, 'page') })
    return ok({ added: 'ellipse', edit: stripInternal(e) })
  })
)

server.tool(
  'add_line',
  'Draw a straight line segment from (x1, y1) to (x2, y2).',
  {
    page: z.number().int().min(1),
    x1: z.number(), y1: z.number(),
    x2: z.number(), y2: z.number(),
    stroke: colorSchema.optional().default('#000000'),
    strokeWidth: z.number().positive().optional().default(1),
    opacity: z.number().min(0).max(1).optional().default(1),
  },
  wrap(async (a) => {
    const e = getSession().addEdit(a.page, { kind: 'line', ...rest(a, 'page') })
    return ok({ added: 'line', edit: stripInternal(e) })
  })
)

server.tool(
  'add_highlight',
  'Draw a translucent colored rectangle over a region — useful for highlighting text. Default color is yellow, default opacity 0.35.',
  {
    page: z.number().int().min(1),
    x: z.number(), y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    color: colorSchema.optional().default('#ffe600'),
    opacity: z.number().min(0).max(1).optional().default(0.35),
  },
  wrap(async ({ page, x, y, width, height, color, opacity }) => {
    const e = getSession().addEdit(page, {
      kind: 'highlight', x, y, width, height, fill: color, opacity,
    })
    return ok({ added: 'highlight', edit: stripInternal(e) })
  })
)

server.tool(
  'cover_region',
  'Cover an arbitrary region with an opaque rectangle (redaction). Default color is white.',
  {
    page: z.number().int().min(1),
    x: z.number(), y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    color: colorSchema.optional().default('#ffffff'),
    opacity: z.number().min(0).max(1).optional().default(1),
  },
  wrap(async ({ page, x, y, width, height, color, opacity }) => {
    const e = getSession().addEdit(page, {
      kind: 'cover', x, y, width, height, color, opacity,
    })
    return ok({ added: 'cover', edit: stripInternal(e) })
  })
)

server.tool(
  'add_image',
  'Embed a PNG or JPEG image on a page. Provide exactly one of { source_path } or { source_base64 }. If only one of width/height is given the aspect ratio is preserved; if both are omitted the natural image size is used.',
  {
    page: z.number().int().min(1),
    x: z.number(), y: z.number(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    source_path: z.string().optional().describe('Filesystem path to a .png or .jpg file'),
    source_base64: z.string().optional().describe('Base64 image data (PNG or JPEG). Accepts data URI prefix.'),
    format: z.enum(['png', 'jpg', 'jpeg']).optional(),
    opacity: z.number().min(0).max(1).optional().default(1),
    rotation: z.number().optional(),
  },
  wrap(async ({ page, x, y, width, height, source_path, source_base64, format, opacity, rotation }) => {
    if (!source_path && !source_base64) throw new Error('Provide source_path or source_base64')
    if (source_path && source_base64) throw new Error('Provide only one of source_path or source_base64')
    const s = getSession()
    const e = source_path
      ? await s.addImageFromFile(page, x, y, width, height, source_path)
      : s.addImageFromBase64(page, x, y, width, height, source_base64, format)
    if (opacity != null) e.opacity = opacity
    if (rotation != null) e.rotation = rotation
    return ok({ added: 'image', edit: stripInternal(e) })
  })
)

server.tool(
  'modify_detected_text',
  'Replace, re-style or re-position a detected text element (by id). Any omitted property keeps the detected value. The original glyphs are covered automatically.',
  {
    page: z.number().int().min(1),
    id: z.string().describe('Detected element id, e.g. "t3_7" (from detect_page)'),
    text: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    fontSize: z.number().positive().optional(),
    fontFamily: fontFamilySchema.optional(),
    fontPath: z.string().optional().describe(
      'Path to a .ttf/.otf file to use for this replacement (required for non-Latin-1 characters).'
    ),
    color: colorSchema.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    coverColor: colorSchema.optional().describe(
      'Color used to mask the original text (default white). Use the page background color for an invisible cover.'
    ),
  },
  wrap(async ({ page, id, ...patch }) => {
    const { cover, text } = await getSession().modifyDetectedText(page, id, patch)
    return ok({
      modified: id,
      coverEdit: stripInternal(cover),
      textEdit: stripInternal(text),
    })
  })
)

server.tool(
  'delete_detected',
  'Delete a detected text or image element by covering its region with an opaque rectangle.',
  {
    page: z.number().int().min(1),
    id: z.string(),
    coverColor: colorSchema.optional().default('#ffffff'),
  },
  wrap(async ({ page, id, coverColor }) => {
    const e = await getSession().deleteDetected(page, id, coverColor)
    return ok({ deleted: id, edit: stripInternal(e) })
  })
)

server.tool(
  'replace_text',
  'Search detected text across a single page or the whole document and replace every match. Preserves the detected font family, size, weight and style for each replacement.',
  {
    page: z.number().int().min(1).optional().describe('Page to scan. Omit to scan ALL pages.'),
    search: z.string(),
    replace: z.string(),
    matchCase: z.boolean().optional().default(false),
    wholeWord: z.boolean().optional().default(false),
  },
  wrap(async ({ page, search, replace, matchCase, wholeWord }) => {
    const edits = await getSession().replaceText(
      page ?? null, search, replace, { matchCase, wholeWord }
    )
    const replacements = edits.filter(e => e.kind === 'text')
    return ok({
      search, replace,
      pagesAffected: Array.from(new Set(replacements.map(e => findPageOfEdit(e.id)))),
      replacementCount: replacements.length,
      editsAdded: edits.map(stripInternal),
    })
  })
)

server.tool(
  'remove_edit',
  'Remove a previously queued edit (identified by its edit id from add_*/list_edits). Does not affect detected elements.',
  {
    page: z.number().int().min(1),
    editId: z.string(),
  },
  wrap(async ({ page, editId }) => {
    const e = getSession().removeEdit(page, editId)
    return ok({ removed: editId, edit: stripInternal(e) })
  })
)

server.tool(
  'clear_page_edits',
  'Remove ALL queued edits on a page (does not modify the underlying PDF).',
  { page: z.number().int().min(1) },
  wrap(async ({ page }) => {
    const removed = getSession().clearEdits(page)
    return ok({ page, removed })
  })
)

server.tool(
  'export_pdf',
  'Write the edited PDF to disk. The original file is untouched; the output file contains the original pages with all queued edits drawn on top.',
  {
    path: z.string().describe('Output path. Parent directories are created as needed.'),
  },
  wrap(async ({ path }) => {
    const r = await getSession().export(path)
    return ok({ exported: true, ...r })
  })
)

/* ═══════════════════════  UTILS  ═══════════════════════ */

function stripInternal(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue
    if (k === 'imageBytes') { out[k] = `<${v.length} bytes>`; continue }
    out[k] = v
  }
  return out
}

function rest(obj, ...drop) {
  const out = { ...obj }
  for (const k of drop) delete out[k]
  return out
}

// Expensive-but-fine: scan all per-page edit lists to find which page an
// edit id belongs to. Only used for summary reporting.
function findPageOfEdit(editId) {
  const s = getSession()
  for (const [pStr, edits] of Object.entries(s._edits)) {
    if (edits.some(e => e.id === editId)) return +pStr
  }
  return null
}

/* ═══════════════════════  STARTUP  ═══════════════════════ */

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // eslint-disable-next-line no-console
  console.error('[pdf-editor-mcp] ready on stdio')
}

main().catch(e => {
  console.error('[pdf-editor-mcp] fatal', e)
  process.exit(1)
})
