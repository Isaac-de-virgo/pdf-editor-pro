import { CheckSquare, Square, X } from 'lucide-react'

export default function ScanBar({
  stats, coverOn, onToggleCover, onSelDet, onDelDet, onClose,
}) {
  if (!stats) return null
  return (
    <div className="scan-bar">
      <span style={{ fontSize: 11, color: '#444', fontWeight: 600 }}>Detectado:</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {stats.txt > 0 && (
          <div className="stag txt">
            <b>{stats.txt}</b> bloque{stats.txt !== 1 ? 's' : ''} de texto
          </div>
        )}
        {stats.img > 0 && (
          <div className="stag img">
            <b>{stats.img}</b> imagen{stats.img !== 1 ? 'es' : ''}
          </div>
        )}
        {!stats.txt && !stats.img && (
          <div className="stag">Sin contenido extraíble</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 6, flexWrap: 'wrap' }}>
        <button className={'sbtn' + (coverOn ? ' tog' : '')} onClick={onToggleCover}>
          {coverOn ? <CheckSquare size={14} /> : <Square size={14} />} Cubrir originales
        </button>
        <button className="sbtn" onClick={onSelDet}>Seleccionar detectados</button>
        <button className="sbtn" onClick={onDelDet} style={{ color: '#ef4444' }}>
          Borrar detectados
        </button>
        <button className="sbtn" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={14} /></button>
      </div>
    </div>
  )
}
