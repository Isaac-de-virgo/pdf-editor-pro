import { useRef } from 'react'
import {
  MousePointer2, Type, Image as ImageIcon, Highlighter, Pencil,
  Square, Circle, Minus, ArrowRight, Eraser, Trash2, CopyPlus, BoxSelect,
} from 'lucide-react'

/**
 * Toolbar button with optional active state. Used for the left tool rail.
 */
function Tbtn({ title, children, active, onClick, className = '' }) {
  return (
    <button
      className={'tbtn' + (active ? ' active' : '') + (className ? ' ' + className : '')}
      onClick={onClick}
      title={title}
      aria-pressed={active || undefined}
    >
      {children}
    </button>
  )
}

export default function Toolbar({ curTool, setCurTool, onInsertImg, onDelSel, onSelAll, onDupSel }) {
  const imgInputRef = useRef(null)
  const sel = id => curTool === id
  const pick = id => () => setCurTool(id)
  return (
    <div className="toolbar" role="toolbar" aria-label="Herramientas">
      {/* Selection / editing */}
      <Tbtn title="Seleccionar · Editar texto" active={sel('select')} onClick={pick('select')}>
        <MousePointer2 />
      </Tbtn>

      <div className="tsep" />

      {/* Content insertion */}
      <Tbtn title="Añadir texto" active={sel('text')} onClick={pick('text')}>
        <Type />
      </Tbtn>
      <Tbtn title="Añadir imagen" onClick={() => imgInputRef.current.click()}>
        <ImageIcon />
      </Tbtn>
      <input
        type="file" ref={imgInputRef} accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0]; e.target.value = ''
          if (f) onInsertImg(f)
        }}
      />

      <div className="tsep" />

      {/* Annotation */}
      <Tbtn title="Resaltar" active={sel('highlight')} onClick={pick('highlight')}>
        <Highlighter />
      </Tbtn>
      <Tbtn title="Dibujar" active={sel('draw')} onClick={pick('draw')}>
        <Pencil />
      </Tbtn>

      <div className="tsep" />

      {/* Shapes */}
      <Tbtn title="Rectángulo" active={sel('rect')} onClick={pick('rect')}>
        <Square />
      </Tbtn>
      <Tbtn title="Elipse" active={sel('ellipse')} onClick={pick('ellipse')}>
        <Circle />
      </Tbtn>
      <Tbtn title="Línea" active={sel('line')} onClick={pick('line')}>
        <Minus />
      </Tbtn>
      <Tbtn title="Flecha" active={sel('arrow')} onClick={pick('arrow')}>
        <ArrowRight />
      </Tbtn>

      <div className="tsep" />

      {/* Selection ops */}
      <Tbtn title="Borrador de objetos" active={sel('erase')} onClick={pick('erase')}>
        <Eraser />
      </Tbtn>
      <Tbtn title="Seleccionar todo" onClick={onSelAll}>
        <BoxSelect />
      </Tbtn>
      <Tbtn title="Duplicar" onClick={onDupSel}>
        <CopyPlus />
      </Tbtn>
      <Tbtn title="Eliminar selección" onClick={onDelSel} className="danger">
        <Trash2 />
      </Tbtn>
    </div>
  )
}
