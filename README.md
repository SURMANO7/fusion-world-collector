# 🐉 Fusion World Coleccionista

App **100 % local** (funciona sin instalar nada) para coleccionar cartas de *Dragon Ball Super Card Game: Fusion World*.

## 🚀 Cómo usarla

1. Haz **doble clic en `index.html`** (se abre en tu navegador: Chrome/Edge/Firefox).
2. Añade cartas desde **➕ Añadir cartas**:
   - **📷 Escáner**: sube una foto de la carta y el OCR lee el código impreso (`FB01-001`, `ST02-100`, `P-001`…). También puedes activar la **cámara** si sirves la app por `http://localhost` (doble clic = modo archivo, la cámara lo bloquea el navegador, no la app). También hay búsqueda manual por código.
   - **🔍 Buscar carta**: busca por nombre o código en el catálogo completo y pulsa «＋ Añadir».
   - **✍️ Carta personalizada**: para cartas **no registradas en Cardmarket/TCGplayer** (promos locales, cartas de fans…). Se marcan como *personalizada* y su historial de precios lo construyes tú.
3. En **🎒 Mi Cartera** verás cada carta con su imagen, cantidad, precio medio actual, variación y minigráfica. Pulsa una carta para abrir su **ficha**:
   - Precio medio **Normal** y **Holo** (mín / medio / máx).
   - **Gráfica de precios**: línea naranja = registros reales; línea gris punteada = estimación simulada de relleno hasta que acumules registros reales.
   - **🗓 Registros de ventas/precios**: fecha y precio de cada registro.
   - **Registrar precio manual** o **importar CSV** (`AAAA-MM-DD;precio`).
   - Enlaces directos a **Cardmarket (€)**, **eBay** y TCGplayer.

## 🔄 Actualizar precios y catálogo (automático)

Tienes una **tarea programada de Windows** llamada **«FusionWorld Precios Diarios»** que ejecuta `update_prices.ps1` **cada día a las 9:30**. Hace dos cosas:

1. **Actualiza los precios** de todo el catálogo (TCGplayer vía TCGCSV) y deja el snapshot fechado en `js/prices_latest.js`.
2. **Vuelve a descargar el catálogo completo**: si Cardmarket/TCGplayer añade **cartas nuevas, cajas, sobres o sets/líneas nuevas** de Fusion World, entran solos en la app (el script avisa de cuántos productos nuevos detectó).

Al abrir la app (o recargar con F5, o pulsar «🔄 Buscar precios actualizados ahora» en Ajustes), cada precio nuevo se añade como **punto real del historial**: las gráficas y el «valor de la cartera» se mantienen al día solos.

- Ejecución manual alternativa: clic derecho sobre **`update_prices.ps1`** → *Ejecutar con PowerShell*.
- Si el equipo está en batería o apagado a las 9:30, esa pasada se salta (se recuperará al día siguiente encendido).
- Para quitar la tarea: `schtasks /Delete /TN "FusionWorld Precios Diarios" /F`

También puedes registrar precios a mano en la ficha de cada carta (p. ej. el precio medio que aparece en Cardmarket). Si el precio de una carta cambia en el mercado, la siguiente pasada diaria lo detecta y añade el nuevo punto con su fecha.

## 🗂 Catálogo incluido

- **52 sets** (FB01 *Awakened Pulse* → *Reach the God*, starter decks, mangas, promos de torneo, reimpresiones alt-art…) con **~3.880 cartas** con precio: nombre, código, rareza, tipo, color, coste, poder y precios low/mid/market/high (Normal y Holo).
- Datos: [TCGCSV](https://tcgcsv.com) (espejo público de TCGplayer, categoría *Dragon Ball Super: Fusion World*).
- Enlace de precio en euros: [Cardmarket](https://www.cardmarket.com/en/DragonBallSuper) (búsqueda por código de carta).

## 💾 Tus datos

- Todo se guarda **en tu navegador** (localStorage), nada sale de tu PC.
- **Ajustes → Exportar cartera** crea una copia de seguridad JSON; **Importar** la restaura.

> Nota: la fuente de precios es TCGplayer (USD). Cardmarket (EUR) se abre en un clic desde cada carta para el precio exacto en euros; Cardmarket no permite consultar precios automáticamente sin cuenta de API oficial.
