# PDF Editor — Servidor MCP

Un servidor [Model Context Protocol](https://modelcontextprotocol.io) que
expone toda la funcionalidad de edición de PDFs del proyecto para que
cualquier cliente MCP (Claude Desktop, Cursor, Windsurf, MCP Inspector,
scripts propios...) pueda operar PDFs por lenguaje natural.

No usa navegador. Funciona en Node puro con `pdfjs-dist` (detección) y
`pdf-lib` (escritura).

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm run mcp           # arranca el servidor sobre stdio
npm run mcp:inspect   # arranca el servidor + inspector web interactivo
```

El servidor habla MCP por **stdio** (stdin/stdout). `stderr` se usa para
logs de diagnóstico.

## Configurar en Claude Desktop

Edita `~/.config/Claude/claude_desktop_config.json` (Linux/macOS) y añade:

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

Reinicia Claude Desktop. El servidor aparecerá con las 20 herramientas
descritas abajo.

## Configurar en Windsurf / Cursor

En la configuración MCP de tu IDE añade un servidor con:

- **command**: `node`
- **args**: `["/ruta/absoluta/al/proyecto/mcp/server.js"]`

## Sistema de coordenadas

Todos los parámetros `x`, `y`, `width`, `height` están en **puntos PDF**
(1pt = 1/72"). Origen en la **esquina superior izquierda** (`x →`,
`y ↓`). Internamente se convierte al sistema nativo de pdf-lib
(bottom-left). Usa `get_page_size` para conocer las dimensiones.

## Flujo típico

```
1. open_pdf(path)
2. detect_page(page) → devuelve IDs como "t1_3" (texto) o "i1_1" (imagen)
3. modify_detected_text / delete_detected / add_text / add_image / ...
4. export_pdf(outputPath)
```

## Herramientas disponibles

| Herramienta             | Propósito                                                         |
|-------------------------|-------------------------------------------------------------------|
| `open_pdf`              | Cargar un PDF desde disco                                          |
| `close_pdf`             | Cerrar el PDF y descartar ediciones pendientes                     |
| `get_status`            | Resumen de la sesión                                               |
| `get_page_size`         | Ancho/alto en puntos de una página                                 |
| `detect_page`           | Extrae bloques de texto (con fuente/negrita/cursiva) e imágenes    |
| `list_detected`         | Lista los elementos detectados cacheados                           |
| `list_edits`            | Lista las ediciones pendientes de una página                       |
| `add_text`              | Añadir un texto nuevo                                              |
| `add_rectangle`         | Añadir un rectángulo                                               |
| `add_ellipse`           | Añadir una elipse                                                  |
| `add_line`              | Añadir una línea recta                                             |
| `add_highlight`         | Rectángulo translúcido (resaltador)                                |
| `cover_region`          | Tapar una región con color opaco (redacción)                       |
| `add_image`             | Incrustar PNG/JPEG (desde archivo o base64)                        |
| `modify_detected_text`  | Editar contenido / estilo / posición de un texto detectado         |
| `delete_detected`       | Borrar un elemento detectado tapándolo                             |
| `replace_text`          | Buscar y reemplazar en texto detectado (por página o global)       |
| `remove_edit`           | Deshacer una edición pendiente por su id                           |
| `clear_page_edits`      | Borrar todas las ediciones pendientes de una página                |
| `set_default_font`      | Registrar un TTF/OTF Unicode como fuente por defecto               |
| `export_pdf`            | Escribir el PDF final a disco                                      |

## Ejemplos (instrucciones en lenguaje natural)

Todas se traducen a llamadas MCP que el cliente elegirá automáticamente:

- *"Abre `/tmp/factura.pdf`, cambia todas las apariciones de `LÍMITE` por
  `TOTAL`, y guárdalo en `/tmp/factura-editada.pdf`."*
- *"En la página 2, detecta el contenido y bórrame el bloque de texto
  con id `t2_5`."*
- *"Añade la imagen `/tmp/firma.png` en la página 1, esquina inferior
  derecha, con ancho 120."*
- *"Resalta en amarillo el primer párrafo de la página 3."*
- *"Tapa con un rectángulo blanco la región (100, 50) → (300, 90) en
  la página 1, y encima escribe `CONFIDENCIAL` en rojo a 24pt."*

## Fuentes y Unicode

Por defecto el servidor usa las **14 fuentes estándar PDF** (Helvetica,
Times, Courier + sus variantes) vía `pdf-lib`. Cubren ASCII y Latin-1
(incluyendo acentos, ñ, €). La familia solicitada se mapea a la fuente
estándar más cercana:

| Familia solicitada                    | Fuente PDF usada |
|---------------------------------------|------------------|
| Helvetica, Arial, (cualquier sans)    | Helvetica        |
| Times New Roman, Times, Georgia, serif | Times-Roman     |
| Courier, Courier New, mono            | Courier          |

Las variantes bold/italic se resuelven automáticamente
(`HelveticaBoldOblique`, `TimesRomanBoldItalic`, …).

### Caracteres fuera de Latin-1 (CJK, emoji, cirílico, árabe, …)

Para caracteres que no caben en WinAnsi (Latin-1) debes proporcionar
una fuente TTF/OTF Unicode. Hay dos opciones:

1. **Fuente por defecto de la sesión** (recomendado para documentos
   enteros en otra escritura):

   ```
   set_default_font(path="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
   ```

   A partir de ese momento todos los `add_text` y
   `modify_detected_text` usan esa fuente automáticamente.

2. **Por edición individual** — cada herramienta de texto acepta un
   parámetro opcional `fontPath`:

   ```
   add_text(page=1, x=50, y=50, text="你好 🌍",
            fontPath="/ruta/a/NotoSansCJK-Regular.otf")
   ```

Si intentas escribir un carácter no codificable sin fuente Unicode
registrada, `export_pdf` fallará con un mensaje explícito indicando
qué carácter falló y cómo resolverlo.

## Depuración

Ejecuta `npm run mcp:inspect` y abre la URL que imprime el inspector
para probar cada herramienta interactivamente con un UI.
