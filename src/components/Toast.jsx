export default function Toast({ msg, show }) {
  if (!show && !msg) return null
  return <div className="toast" style={{ opacity: show ? 1 : 0 }}>{msg}</div>
}
