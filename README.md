# PDF Editor Pro

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Fabric.js-5.3-FF6B6B" alt="Fabric.js">
  <img src="https://img.shields.io/badge/PDF.js-3.11-3B82F6" alt="PDF.js">
</p>

<p align="center">
  <b>Editor profesional de PDF con detección inteligente de contenido editable</b>
</p>

<p align="center">
  <a href="#características">Características</a> •
  <a href="#demo">Demo</a> •
  <a href="#instalación">Instalación</a> •
  <a href="#uso">Uso</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="#tecnologías">Tecnologías</a>
</p>

---

## Características

- **Detección inteligente de contenido**: Escanea automáticamente el PDF para detectar texto e imágenes editables manteniendo el diseño original
- **Edición de texto directa**: Modifica el contenido de texto con preservación de fuentes, tamaños, colores y estilos tipográficos (negrita, cursiva)
- **Detección de imágenes**: Extrae imágenes del PDF como objetos movibles y editables
- **Herramientas de dibujo**: Rectángulos, elipses, líneas, flechas, lápiz y resaltador
- **Sistema de pares Cover+Objeto**: Mecanismo innovador que preserva los píxeles originales mientras permite la edición
- **Navegación multi-página**: Miniaturas, zoom ajustable y navegación fluida entre páginas
- **Exportación a PDF**: Guarda tus ediciones en un nuevo archivo PDF
- **Deshacer/Rehacer**: Historial completo de acciones con atajos de teclado
- **MCP Server**: Integración con Model Context Protocol para operaciones programáticas

## Demo

> Arrastra y suelta un archivo PDF para comenzar a editar inmediatamente.

## Instalación

### Requisitos previos

- Node.js 18+
- npm 9+

### Pasos

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd pdf-editor-pro

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## Uso

### Cargar un PDF

- **Arrastrar y soltar**: Arrastra cualquier archivo PDF al área de trabajo
- **Botón Abrir**: Selecciona un archivo desde tu sistema

### Herramientas de edición

| Herramienta | Atajo | Descripción |
|-------------|-------|-------------|
| Selección | `V` | Seleccionar y modificar objetos |
| Texto | `T` | Añadir cajas de texto editables |
| Rectángulo | `R` | Dibujar rectángulos |
| Elipse | - | Dibujar elipses |
| Línea/Flecha | - | Dibujar líneas y flechas |
| Lápiz | `P` | Dibujo libre |
| Resaltador | - | Resaltar texto con transparencia |
| Borrador | - | Eliminar objetos al clicar |

### Detección de contenido

Haz clic en el botón **Escanear** para que el editor analice la página actual:

1. Detecta automáticamente texto e imágenes
2. Preserva fuentes, colores y estilos originales
3. Crea objetos editables vinculados a "covers" que mantienen el fondo original
4. Los objetos permanecen invisibles hasta que interactúes con ellos

### Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl/Cmd + Z` | Deshacer |
| `Ctrl/Cmd + Y` | Rehacer |
| `Ctrl/Cmd + Shift + Z` | Rehacer (alternativo) |
| `Delete / Backspace` | Eliminar selección |
| `Escape` | Cambiar a modo selección |
| `← ↑ → ↓` | Mover objeto seleccionado |
| `Shift + Flechas` | Mover 10px |

## MCP Server

PDF Editor Pro incluye un servidor [Model Context Protocol](https://modelcontextprotocol.io)
headless (sin navegador) que expone **toda la funcionalidad del editor**
como herramientas MCP. Cualquier cliente MCP — Claude Desktop, Cursor,
Windsurf, MCP Inspector, scripts propios — puede entonces operar PDFs
por lenguaje natural.

### Arrancar el servidor

```bash
npm run mcp          # stdio transport
npm run mcp:inspect  # + inspector web interactivo
```

### Configurar en Claude Desktop

En `~/.config/Claude/claude_desktop_config.json` (Linux/macOS) o
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Herramientas expuestas (21)

| Categoría    | Herramientas                                                         |
|--------------|----------------------------------------------------------------------|
| Sesión       | `open_pdf`, `close_pdf`, `get_status`, `get_page_size`               |
| Detección    | `detect_page`, `list_detected`, `list_edits`                         |
| Anotación    | `add_text`, `add_rectangle`, `add_ellipse`, `add_line`, `add_image`, `add_highlight`, `cover_region` |
| Edición real | `modify_detected_text`, `delete_detected`, `replace_text`            |
| Fuentes      | `set_default_font` (TTF/OTF Unicode para CJK, emoji, etc.)           |
| Gestión      | `remove_edit`, `clear_page_edits`                                    |
| Exportación  | `export_pdf`                                                         |

### Ejemplos de uso (en lenguaje natural)

- *"Abre `/tmp/factura.pdf`, reemplaza todas las apariciones de `TOTAL`
  por `GRAN TOTAL`, y guárdalo en `/tmp/factura-editada.pdf`."*
- *"En la página 2 detecta el contenido y bórrame el bloque de texto
  con id `t2_5`."*
- *"Añade la imagen `/tmp/firma.png` en la esquina inferior derecha de
  la página 1 con ancho 120."*
- *"Tapa con un rectángulo blanco la región (100, 50) → (300, 90) de
  la página 1 y escribe encima `CONFIDENCIAL` en rojo a 24pt."*

Documentación completa: [`mcp/README.md`](mcp/README.md)

## Tecnologías

- **React 18.3** - Framework de UI
- **Vite 5.4** - Build tool y dev server
- **Fabric.js 5.3** - Canvas interactivo y manipulación de objetos
- **PDF.js 3.11** - Renderizado y extracción de PDF
- **jsPDF 2.5** - Generación de archivos PDF exportados
- **MCP SDK** - Model Context Protocol para integraciones

### Arquitectura de detección de contenido

El sistema utiliza un enfoque de **pares Cover+Objeto**:

1. **Cover**: Rectángulo invisible que preserva el fondo original (colores de fondo muestreados)
2. **Objeto**: Elemento editable (texto o imagen) con propiedades tipográficas preservadas
3. **Vinculación**: Ambos objetos comparten un `pairId` y se revelan simultáneamente al editar

Este patrón garantiza que el documento mantenga su apariencia visual original mientras permite la edición completa del contenido.

## Scripts disponibles

| Script                  | Descripción                                         |
|-------------------------|-----------------------------------------------------|
| `npm run dev`           | App web en `http://127.0.0.1:5173`                  |
| `npm run build`         | Build de producción en `dist/`                      |
| `npm run preview`       | Previsualiza el build de producción                 |
| `npm run mcp`           | Servidor MCP (stdio) — ver [mcp/README.md](mcp/README.md) |
| `npm run mcp:inspect`   | Servidor MCP + inspector web interactivo            |

---

<p align="center">
  Desarrollado con React + Fabric.js + PDF.js + pdf-lib + MCP
</p>
