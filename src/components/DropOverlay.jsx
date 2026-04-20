import { useRef, useState } from 'react'
import { FileText, UploadCloud, Check } from 'lucide-react'

export default function DropOverlay({ onFile }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  return (
    <div className="drop-overlay">
      <div className="drop-brand">
        <div className="drop-brand-icon">
          <FileText size={22} color="#fff" />
        </div>
        <div>
          <div className="drop-brand-title">PDF Editor</div>
          <div className="drop-brand-sub">Edita cualquier contenido de tu PDF, como Adobe.</div>
        </div>
      </div>
      <div
        className={'dzone' + (over ? ' over' : '')}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault(); setOver(false)
          const f = e.dataTransfer.files[0]
          if (f && f.type === 'application/pdf') onFile(f)
        }}
      >
        <UploadCloud size={42} strokeWidth={1.3} className="dzone-icon" />
        <div className="dzone-title">Arrastra tu PDF aquí</div>
        <div className="dzone-sub">o haz clic para seleccionar un archivo</div>
      </div>
      <div className="drop-features">
        <span><Check size={14} /> Edita texto</span>
        <span><Check size={14} /> Añade imágenes</span>
        <span><Check size={14} /> Firma y exporta</span>
      </div>
      <input
        type="file" ref={inputRef} accept=".pdf" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </div>
  )
}
