import { ChevronLeft, ChevronRight, Minus, Plus, Maximize2 } from 'lucide-react'

export default function BottomBar({
  curPage, totalPages, onPrev, onNext, objCount,
  dispZoom, onZoomOut, onZoomIn, onFit,
}) {
  return (
    <div className="btmbar">
      <span style={{ minWidth: 80 }}>
        {totalPages ? `Página ${curPage} / ${totalPages}` : '—'}
      </span>
      <button className="nbtn" onClick={onPrev} disabled={!totalPages || curPage <= 1}><ChevronLeft size={14} /> Anterior</button>
      <button className="nbtn" onClick={onNext} disabled={!totalPages || curPage >= totalPages}>Siguiente <ChevronRight size={14} /></button>
      <span style={{ color: '#333', fontSize: 11 }}>
        {objCount > 0 ? `${objCount} obj${objCount > 1 ? 's' : ''}` : ''}
      </span>
      <span style={{ flex: 1 }} />
      <button className="zbtn" onClick={onZoomOut}><Minus size={12} /></button>
      <span style={{ fontSize: 11, color: '#555', minWidth: 36, textAlign: 'center' }}>
        {Math.round(dispZoom * 100)}%
      </span>
      <button className="zbtn" onClick={onZoomIn}><Plus size={12} /></button>
      <button className="nbtn" onClick={onFit}><Maximize2 size={14} /> Ajustar</button>
    </div>
  )
}
