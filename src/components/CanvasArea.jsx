import { forwardRef } from 'react'

/**
 * The scroll-container + wrapper + HTMLCanvasElement that fabric attaches
 * to. All three refs are forwarded so the hook can size / scroll / init
 * the canvas imperatively.
 */
const CanvasArea = forwardRef(function CanvasArea({ wrapRef, canvasRef, children }, areaRef) {
  return (
    <div className="canvas-area" ref={areaRef}>
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas id="editing-canvas" ref={canvasRef} />
      </div>
      {children}
    </div>
  )
})

export default CanvasArea
