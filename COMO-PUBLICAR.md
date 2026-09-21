# 🌐 Cómo publicar la app con un enlace público

Todo está preparado. Solo necesitas una cuenta gratuita en algún hosting. Dos caminos:

## Camino A — GitHub Pages (recomendado: enlace estable + se actualiza sola cada día)

1. **Ten cuenta en GitHub** (gratis, solo email): https://github.com/signup
2. Pásale el mensaje «**usa GitHub**» al asistente. Él se encarga de:
   - Instalar Git y GitHub CLI (`winget install Git.Git GitHub.cli`)
   - Darte un **código de un solo uso** para autorizar en el navegador (github.com/login/device)
   - Crear el repositorio, subir la app y activar **GitHub Pages**
   - Resultado: enlace tipo `https://TUUSUARIO.github.io/fusion-world-collector/`
3. A partir de entonces, la tarea diaria de las 9:30 **sube sola** los precios y productos nuevos al enlace (el script hace `git push` si hay cambios).

> Con HTTPS, además, el **escáner con cámara** funciona también en el móvil (abre el enlace en el móvil y escanea con la cámara directamente).

## Camino B — cualquier otro hosting (Netlify, etc.)

- Archivo listo para arrastrar: **`fusion-world-portable.html`** (toda la app en un solo archivo).
  - En Netlify: crea cuenta gratis → «Add new site» → «Deploy manually» → arrastra ese archivo → te da un enlace tipo `https://algo.netlify.app`.
  - ⚠️ El archivo portable es una **foto fija**: los precios y cartas nuevas NO se actualizan solos en ese enlace (para eso está el camino A). Regenerarlo tras cada actualización: clic derecho en `data\build_portable.ps1` → Ejecutar con PowerShell, y vuelve a subirlo.

## Notas para quien visite el enlace

- Cada persona crea **su propia cuenta** dentro de la app (botón «➕ Crear cuenta») y su colección se guarda en SU navegador. Nada se comparte entre visitantes.
- El catálogo (4.032 productos) es común para todos; los precios se actualizan con la tarea diaria (camino A).
