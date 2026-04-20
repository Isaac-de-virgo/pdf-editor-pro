// Mini-barra flotante que aparece encima de un texto seleccionado, al
// estilo del editor de Adobe. Permite cambiar fuente, tamaño, color y
// formato sin tener que ir al panel lateral.
//
// Reutiliza los setters controlados que el hook `usePdfEditor` expone a
// través de `propsPanel` (`setFf`, `setFs`, `setTc`, `togFmt`, `fmt`), así
// que cada cambio aquí actualiza el texto seleccionado en tiempo real.
//
// El posicionamiento viene del hook vía `pos = { left, top }`, en
// coordenadas del `.canvas-area` (scrolla junto con el documento).

import { Bold, Italic, Underline, Strikethrough } from 'lucide-react'
import { WEB_FONTS } from '../constants.js'

export default function FloatingTextBar({
  pos,
  ff, setFf,
  fs, setFs,
  tc, setTc,
  fmt, togFmt,
}) {
  if (!pos) return null

  // Sit the toolbar above the selection. `translate(-50%, -100%)` centers
  // it horizontally on the pos and places it just over the top edge; the
  // extra `-10px` gives a little breathing room.
  const style = {
    left: pos.left,
    top:  pos.top,
    transform: 'translate(-50%, calc(-100% - 10px))',
  }

  // Prevent mouse down from bubbling into the canvas (where fabric might
  // otherwise interpret it and deselect the current object). React onClick
  // alone is not enough — fabric listens on mousedown.
  const stop = (e) => e.stopPropagation()

  return (
    <div
      className="floatbar"
      style={style}
      onMouseDown={stop}
      onPointerDown={stop}
      role="toolbar"
      aria-label="Formato de texto"
    >
      <select
        className="fb-select"
        value={ff}
        onChange={e => setFf(e.target.value)}
        title="Fuente"
      >
        {WEB_FONTS.map(f => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      <input
        className="fb-num"
        type="number"
        min="4"
        max="400"
        value={fs}
        onChange={e => setFs(+e.target.value || 0)}
        title="Tamaño"
      />

      <span className="fb-sep" />

      <input
        className="fb-color"
        type="color"
        value={tc}
        onChange={e => setTc(e.target.value)}
        title="Color del texto"
      />

      <span className="fb-sep" />

      <button
        className={'fb-btn' + (fmt.bold ? ' on' : '')}
        onClick={() => togFmt('bold')}
        title="Negrita (Ctrl+B)"
      >
        <Bold size={14} />
      </button>
      <button
        className={'fb-btn' + (fmt.italic ? ' on' : '')}
        onClick={() => togFmt('italic')}
        title="Cursiva (Ctrl+I)"
      >
        <Italic size={14} />
      </button>
      <button
        className={'fb-btn' + (fmt.underline ? ' on' : '')}
        onClick={() => togFmt('underline')}
        title="Subrayado (Ctrl+U)"
      >
        <Underline size={14} />
      </button>
      <button
        className={'fb-btn' + (fmt.strikethrough ? ' on' : '')}
        onClick={() => togFmt('strikethrough')}
        title="Tachado"
      >
        <Strikethrough size={14} />
      </button>
    </div>
  )
}
