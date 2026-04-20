// Top-level composition. Holds no business logic:
//   • hooks give us state + behaviour (usePdfEditor, useToast, …)
//   • components give us the UI
//   • App just wires them together (Humble-View pattern).
import { useState } from 'react'

import Toast            from './components/Toast.jsx'
import Loader           from './components/Loader.jsx'
import DropOverlay      from './components/DropOverlay.jsx'
import Header           from './components/Header.jsx'
import Sidebar          from './components/Sidebar.jsx'
import Toolbar          from './components/Toolbar.jsx'
import CanvasArea       from './components/CanvasArea.jsx'
import FloatingTextBar  from './components/FloatingTextBar.jsx'
import Properties       from './components/Properties.jsx'
import BottomBar        from './components/BottomBar.jsx'

import { useToast }        from './hooks/useToast.js'
import { useDragAndDrop }  from './hooks/useDragAndDrop.js'
import { useKeyboard }     from './hooks/useKeyboard.js'
import { usePdfEditor }    from './hooks/usePdfEditor.js'

export default function App() {
  const [toast, showToast] = useToast()
  const [loading, setLoading] = useState({ on: false, msg: 'Procesando...' })
  const setLoad = (on, msg = 'Procesando...') => setLoading({ on, msg })

  const editor = usePdfEditor({ showToast, setLoad })

  useDragAndDrop(editor.loadPDF)
  useKeyboard({
    undo: editor.undoA,
    redo: editor.redoA,
    del:  editor.delSel,
    setTool: editor.setCurTool,
    nudge: editor.nudge,
  })

  return (
    <>
      <Toast msg={toast.msg} show={toast.show} />
      <Loader show={loading.on} msg={loading.msg} />

      {!editor.hasFile && <DropOverlay onFile={editor.loadPDF} />}

      <Header
        fname={editor.fname}
        onOpen={editor.loadPDF}
        onUndo={editor.undoA} undoOn={editor.undoOn}
        onRedo={editor.redoA} redoOn={editor.redoOn}
        onClear={editor.clearPage}
        onExport={editor.exportPDF}
        exportDisabled={!editor.hasFile || editor.exporting}
        exporting={editor.exporting}
      />

      <div className="app">
        <Sidebar thumbs={editor.thumbs} curPage={editor.curPage} onSelect={editor.gotoPage} />
        <Toolbar
          curTool={editor.curTool}
          setCurTool={editor.setCurTool}
          onInsertImg={editor.insertImg}
          onDelSel={editor.delSel}
          onSelAll={editor.selAll}
          onDupSel={editor.dupSel}
        />
        <CanvasArea
          ref={editor.canvasAreaRef}
          wrapRef={editor.canvasWrapRef}
          canvasRef={editor.canvasElRef}
        >
          <FloatingTextBar
            pos={editor.textFloat}
            ff={editor.propsPanel.ff}  setFf={editor.propsPanel.setFf}
            fs={editor.propsPanel.fs}  setFs={editor.propsPanel.setFs}
            tc={editor.propsPanel.tc}  setTc={editor.propsPanel.setTc}
            fmt={editor.propsPanel.fmt}
            togFmt={editor.propsPanel.togFmt}
          />
        </CanvasArea>
        <Properties {...editor.propsPanel} />
      </div>

      <BottomBar
        curPage={editor.curPage}
        totalPages={editor.totalPages}
        onPrev={editor.prevPg}
        onNext={editor.nextPg}
        objCount={editor.objCount}
        dispZoom={editor.dispZoom}
        onZoomOut={() => editor.adjZoom(-0.25)}
        onZoomIn={()  => editor.adjZoom(+0.25)}
        onFit={editor.fitPage}
      />
    </>
  )
}
