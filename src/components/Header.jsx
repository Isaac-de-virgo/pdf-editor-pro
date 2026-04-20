import { useRef } from 'react'
import { FolderOpen, Undo2, Redo2, Trash2, Download } from 'lucide-react'

export default function Header({
  fname,
  onOpen,
  onUndo,  undoOn,
  onRedo,  redoOn,
  onClear,
  onExport, exportDisabled, exporting,
}) {
  const inputRef = useRef(null)
  return (
    <header>
      <div className="logo">
        <div className="logo-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M4 3h11l5 5v13H4z" fillOpacity=".12" />
            <path d="M4 3h11l5 5v13H4zm11 0v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </div>
        <span>PDF Editor</span>
      </div>
      <div className="hsep" />
      <button className="hbtn" onClick={() => inputRef.current.click()} title="Abrir PDF">
        <FolderOpen size={16} /> Abrir
      </button>
      <input
        type="file" ref={inputRef} accept=".pdf" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0]; e.target.value = ''
          if (f) onOpen(f)
        }}
      />
      <div className="hsep" />
      <button className="hbtn icon-only" onClick={onUndo} disabled={!undoOn} title="Deshacer (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className="hbtn icon-only" onClick={onRedo} disabled={!redoOn} title="Rehacer (Ctrl+Y)">
        <Redo2 size={16} />
      </button>
      <div className="hsep" />
      <button className="hbtn icon-only danger" onClick={onClear} title="Limpiar página">
        <Trash2 size={16} />
      </button>
      <div className="hspacer" />
      <span className="fname" title={fname}>{fname}</span>
      <button className="hbtn export" onClick={onExport} disabled={exportDisabled}>
        {exporting ? 'Exportando...' : <><Download size={16} /> Descargar</>}
      </button>
    </header>
  )
}
