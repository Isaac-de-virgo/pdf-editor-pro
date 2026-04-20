import { WEB_FONTS } from '../constants.js'

export default function Properties({
  fill, setFill,
  stroke, setStroke,
  sw, setSw,
  fs, setFs,
  ff, setFf,
  tc, setTc,
  op, setOp,
  bs, setBs,
  bc, setBc,
  fmt, togFmt,
  selInfo,
}) {
  return (
    <div className="props">
      {/* Color section */}
      <section>
        <div className="psec-title">Color</div>
        <div className="prow">
          <label>Relleno</label>
          <input type="color" value={fill} onChange={e => setFill(e.target.value)} />
        </div>
        <div className="prow">
          <label>Borde</label>
          <input type="color" value={stroke} onChange={e => setStroke(e.target.value)} />
        </div>
        <div className="prow">
          <label>Grosor</label>
          <input type="range" min="0" max="20" value={sw} step="1" onChange={e => setSw(+e.target.value)} />
          <span className="pval">{sw}</span>
        </div>
      </section>

      {/* Text section */}
      <section>
        <div className="psec-title">Texto</div>
        <div className="prow">
          <label>Tamaño</label>
          <input
            className="pinput" type="number" value={fs}
            min="4" max="400" style={{ width: 54 }}
            onChange={e => setFs(+e.target.value || 0)}
          />
        </div>
        <div style={{ marginBottom: 5 }}>
          <select className="pinput" value={ff} onChange={e => setFf(e.target.value)}>
            {WEB_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="prow">
          <label>Color</label>
          <input type="color" value={tc} onChange={e => setTc(e.target.value)} />
        </div>
        <div className="pbtns">
          <button className={'pfmt' + (fmt.bold ? ' on' : '')} onClick={() => togFmt('bold')} style={{ fontWeight: 700 }}>B</button>
          <button className={'pfmt' + (fmt.italic ? ' on' : '')} onClick={() => togFmt('italic')} style={{ fontStyle: 'italic' }}>I</button>
          <button className={'pfmt' + (fmt.underline ? ' on' : '')} onClick={() => togFmt('underline')} style={{ textDecoration: 'underline' }}>U</button>
          <button className={'pfmt' + (fmt.strikethrough ? ' on' : '')} onClick={() => togFmt('strikethrough')} style={{ textDecoration: 'line-through' }}>S</button>
        </div>
      </section>

      {/* Brush section */}
      <section>
        <div className="psec-title">Pincel</div>
        <div className="prow">
          <label>Tamaño</label>
          <input type="range" min="1" max="60" value={bs} onChange={e => setBs(+e.target.value)} />
          <span className="pval">{bs}</span>
        </div>
        <div className="prow">
          <label>Color</label>
          <input type="color" value={bc} onChange={e => setBc(e.target.value)} />
        </div>
      </section>

      {/* Object section */}
      <section>
        <div className="psec-title">Objeto</div>
        <div className="prow">
          <label>Opacidad</label>
          <input type="range" min="0" max="100" value={op} onChange={e => setOp(+e.target.value)} />
          <span className="pval">{op}%</span>
        </div>
      </section>

      {/* Selection info */}
      {selInfo && (
        <section>
          <div className="psec-title">Selección</div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 3 }}>{selInfo.type}</div>
          <div style={{ fontSize: 10, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {selInfo.pos}
          </div>
        </section>
      )}
    </div>
  )
}
