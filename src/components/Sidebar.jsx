export default function Sidebar({ thumbs, curPage, onSelect }) {
  if (!thumbs.length) {
    return (
      <div className="sidebar">
        <div style={{ color: '#252538', fontSize: 11, textAlign: 'center', paddingTop: 24 }}>
          Sin páginas
        </div>
      </div>
    )
  }
  return (
    <div className="sidebar">
      {thumbs.map(t => (
        <div
          key={t.n}
          className={'thumb-item' + (t.n === curPage ? ' active' : '')}
          onClick={() => onSelect(t.n)}
        >
          <img src={t.url} alt={`p${t.n}`} />
          <div className="thumb-lbl">{t.n}</div>
        </div>
      ))}
    </div>
  )
}
