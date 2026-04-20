# PDF Editor Pro

<p align="center">
  <img src="public/nota.png" alt="PDF Editor Pro" width="96">
</p>

<p align="center">
  Editor de PDF en React con deteccion de contenido editable, herramientas visuales y servidor MCP para automatizar cambios sobre documentos.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/PDF.js-4.7-3B82F6" alt="PDF.js">
  <img src="https://img.shields.io/badge/pdf--lib-1.17-111827" alt="pdf-lib">
  <img src="https://img.shields.io/badge/MCP-ready-10B981" alt="MCP">
</p>

## Resumen

Este repositorio combina dos piezas en un mismo proyecto:

- Un editor web para abrir PDFs, detectar texto e imagenes, anotar, dibujar, insertar contenido y exportar el resultado.
- Un servidor MCP headless para operar PDFs desde clientes compatibles como Claude Desktop, Cursor o MCP Inspector.

> [!IMPORTANT]
> El editor web y el servidor MCP comparten la misma logica de trabajo sobre PDFs, pero no se ejecutan igual: la interfaz vive en el navegador y el servidor MCP corre en Node.js por `stdio`.

## Lo que hace

- Detecta bloques de texto e imagenes en una pagina PDF para volverlos editables.
- Conserva posicion, fuente, tamano y estilo del contenido detectado cuando es posible.
- Permite agregar texto, rectangulos, elipses, lineas, flechas, resaltados e imagenes.
- Incluye deshacer, rehacer, zoom, miniaturas y navegacion multipagina.
- Exporta un PDF nuevo con las modificaciones aplicadas.
- Expone 20 herramientas MCP para automatizar deteccion, edicion y exportacion.

## Inicio rapido

### Requisitos

- Node.js 18 o superior
- npm 9 o superior

### Instalacion

```bash
git clone https://github.com/Isaac-de-virgo/pdf-editor-pro.git
cd pdf-editor-pro
npm install
```

### Ejecutar la app web

```bash
npm run dev
```

La aplicacion queda disponible en `http://127.0.0.1:5173`.

### Generar build de produccion

```bash
npm run build
npm run preview
```

## Uso rapido del editor

1. Abre o arrastra un PDF dentro del area de trabajo.
2. Usa `Escanear` para detectar texto e imagenes editables en la pagina actual.
3. Modifica contenido detectado o agrega nuevos elementos con la barra de herramientas.
4. Exporta el PDF final desde la cabecera.

### Atajos principales

| Atajo | Accion |
| --- | --- |
| `Ctrl/Cmd + Z` | Deshacer |
| `Ctrl/Cmd + Y` | Rehacer |
| `Ctrl/Cmd + Shift + Z` | Rehacer alternativo |
| `Delete` / `Backspace` | Eliminar seleccion |
| `Escape` | Volver a seleccion |
| `V` | Herramienta de seleccion |
| `T` | Insertar texto |
| `R` | Dibujar rectangulo |
| `P` | Dibujo libre |

## Servidor MCP

El proyecto incluye un servidor [Model Context Protocol](https://modelcontextprotocol.io) para editar PDFs sin navegador.

### Ejecutar

```bash
npm run mcp
```

Para inspeccion interactiva:

```bash
npm run mcp:inspect
```

### Configuracion de ejemplo en Claude Desktop

```json
{
  "mcpServers": {
    "pdf-editor": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/mcp/server.js"]
    }
  }
}
```

### Capacidades MCP

- Sesion: `open_pdf`, `close_pdf`, `get_status`, `get_page_size`
- Deteccion: `detect_page`, `list_detected`, `list_edits`
- Insercion y marcado: `add_text`, `add_rectangle`, `add_ellipse`, `add_line`, `add_image`, `add_highlight`, `cover_region`
- Edicion: `modify_detected_text`, `delete_detected`, `replace_text`
- Gestion: `remove_edit`, `clear_page_edits`, `set_default_font`
- Exportacion: `export_pdf`

La documentacion detallada del servidor esta en [mcp/README.md](mcp/README.md).

## Scripts disponibles

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Levanta la app web en desarrollo |
| `npm run build` | Genera el build en `dist/` |
| `npm run preview` | Sirve el build generado |
| `npm run mcp` | Inicia el servidor MCP por `stdio` |
| `npm run mcp:inspect` | Inicia el servidor MCP con inspector |

## Estructura del proyecto

```text
src/
  components/        UI del editor
  hooks/             Orquestacion del editor y eventos
  services/
    pdf/             Carga, rasterizado y deteccion
    canvas/          Integracion con canvas y objetos editables
    export/          Exportacion del PDF final
mcp/
  server.js          Servidor MCP
public/
  nota.png           Icono del proyecto
```

## Stack tecnico

- React 18 para la interfaz
- Vite 5 para desarrollo y build
- PDF.js para lectura, rasterizado y deteccion
- pdf-lib para escritura y exportacion
- Fabric.js para interaccion sobre canvas
- MCP SDK para exponer herramientas de automatizacion

## Notas de implementacion

- El editor sigue un patron de composicion donde `App.jsx` conecta hooks y componentes, mientras la logica vive principalmente en `src/hooks/usePdfEditor.js` y `src/services/`.
- La deteccion usa un enfoque de pares "cover + objeto" para preservar la apariencia original mientras habilita la edicion del contenido detectado.
- Para caracteres fuera de Latin-1 en el servidor MCP, puede ser necesario registrar una fuente TTF/OTF con `set_default_font`.

## Derechos y uso

Este repositorio es software propietario. Salvo autorizacion expresa y por escrito del titular, no se concede permiso para copiar, redistribuir, modificar, sublicenciar ni explotar comercialmente este codigo.

Consulta el archivo [LICENSE](LICENSE) para el texto aplicable.
