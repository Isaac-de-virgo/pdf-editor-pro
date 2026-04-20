import test from 'node:test'
import assert from 'node:assert/strict'

import { computeFloatingTextAnchor, resolveKeyboardAction } from '../../src/domain/editorUi.js'

test('computeFloatingTextAnchor maps canvas geometry into scroll-container space', () => {
  const pos = computeFloatingTextAnchor({
    bounds: { left: 80, top: 40, width: 120, height: 24 },
    canvasRect: { left: 140, top: 90 },
    areaRect: { left: 20, top: 30 },
    scrollLeft: 60,
    scrollTop: 100,
    zoom: 1.5,
  })

  assert.deepEqual(pos, { left: 390, top: 220 })
})

test('computeFloatingTextAnchor returns null when geometry is incomplete', () => {
  assert.equal(
    computeFloatingTextAnchor({
      bounds: null,
      canvasRect: { left: 0, top: 0 },
      areaRect: { left: 0, top: 0 },
      scrollLeft: 0,
      scrollTop: 0,
      zoom: 1,
    }),
    null,
  )
})

test('resolveKeyboardAction handles text formatting shortcuts when text formatting is allowed', () => {
  const action = resolveKeyboardAction({
    key: 'b',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    targetTagName: 'TEXTAREA',
    isContentEditable: false,
    allowTextFormatting: true,
  })

  assert.deepEqual(action, { type: 'format', value: 'bold' })
})

test('resolveKeyboardAction keeps form fields isolated when text formatting is not allowed', () => {
  const action = resolveKeyboardAction({
    key: 'b',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    targetTagName: 'INPUT',
    isContentEditable: false,
    allowTextFormatting: false,
  })

  assert.equal(action, null)
})

test('resolveKeyboardAction expands arrow nudges with shift', () => {
  const action = resolveKeyboardAction({
    key: 'ArrowRight',
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    targetTagName: 'DIV',
    isContentEditable: false,
    allowTextFormatting: false,
  })

  assert.deepEqual(action, { type: 'nudge', dx: 10, dy: 0 })
})
