export default function Loader({ show, msg = 'Procesando...' }) {
  if (!show) return null
  return (
    <div className="loader">
      <div className="spin" />
      <span className="load-msg">{msg}</span>
    </div>
  )
}
