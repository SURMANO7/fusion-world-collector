/* Escáner de cartas: cámara o foto subida + OCR (Tesseract.js) para leer el código impreso (p. ej. FB01-001).
   Optimizado para móvil: preprocesado de imagen, corrección de caracteres que el OCR confunde
   (O↔0, I↔1, S↔5, B↔8, Z↔2, G↔6, Q/D↔0, L↔1) validada contra el catálogo real. */
(function () {
'use strict';

let stream = null;
let workerPromise = null;

const $ = s => document.querySelector(s);

function hasCameraAPI() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

async function ensureWorker() {
  if (!window.Tesseract || window.__noTesseract) throw new Error('El OCR no está disponible (sin conexión). Escribe el código a mano o crea la carta como personalizada.');
  if (!workerPromise) {
    window.FWApp.setStatus('Preparando el motor OCR (la primera vez descarga ~10 MB, puede tardar 1 min con datos móviles)…', true);
    workerPromise = Tesseract.createWorker('eng').catch(e => {
      workerPromise = null;
      throw new Error('Tu navegador no pudo iniciar el OCR. Escribe el código a mano en el recuadro de abajo.');
    });
  }
  return workerPromise;
}

// ---- índice del catálogo con claves "canónicas" (tolerantes a confusiones del OCR) ----
const AMBIG = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '7', S: '5', B: '8', Z: '2', G: '6', A: '4' };
function canonStr(s) {
  return String(s).toUpperCase().split('').map(ch => (Object.prototype.hasOwnProperty.call(AMBIG, ch) ? AMBIG[ch] : ch)).join('');
}
function buildIndex() {
  const exact = new Set();
  const canonMap = new Map();   // clave canónica -> código real del catálogo
  (window.FW_DATA.cards || []).forEach(c => {
    if (!c.c) return;
    exact.add(c.c);
    const k = canonStr(c.c);
    if (!canonMap.has(k)) canonMap.set(k, c.c);
  });
  return { exact, canonMap };
}

// ---- extracción de códigos desde el texto del OCR ----
function extractCodes(text) {
  const idx = window.FW_APP_INDEX || { exact: new Set(), canonMap: new Map() };
  const out = [];
  const push = c => { if (c && !out.includes(c)) out.push(c); };
  const lookups = pre => {
    const variants = [pre];
    if (/^[0-9]/.test(pre)) variants.push(pre.slice(1));          // perdió una letra inicial: "8B01"→"B01"
    if (!/^F/.test(pre)) variants.push('F' + pre);                 // perdió la F inicial: "B01"→"FB01"
    return variants;
  };
  const tryMatch = (pre, dig) => {
    // 1) tal cual (con relleno de ceros)
    [dig, dig.padStart(3, '0'), dig.padStart(2, '0')].forEach(d => push(pre + '-' + d));
    // 2) corrigiendo caracteres confundidos, contra el catálogo
    lookups(pre).forEach(p => {
      [dig, dig.padStart(3, '0'), dig.padStart(2, '0')].forEach(d => {
        const k = canonStr(p) + '-' + canonStr(d);
        if (idx.canonMap.has(k)) push(idx.canonMap.get(k));
      });
    });
  };

  const T = String(text || '').toUpperCase();
  // formato con separador: FB01-001, ST02·100, P-001, "FB01 — 001"…
  let m;
  const reSep = /\b([A-Z0-9]{1,4})\s*[-–—:|.·]\s*([A-Z0-9]{2,4})\b/g;
  while ((m = reSep.exec(T)) !== null) tryMatch(m[1], m[2]);
  // formato pegado sin separador: FB01001, 8B01001… (probando todas las particiones prefijo/dígitos)
  const reTok = /\b[A-Z0-9]{4,7}\b/g;
  while ((m = reTok.exec(T)) !== null) {
    const tok = m[0];
    if (!/[A-Z]/.test(tok)) continue;   // ignorar números puros (poder, stats)
    for (let split = Math.max(1, tok.length - 4); split <= Math.min(4, tok.length - 2); split++) {
      tryMatch(tok.slice(0, split), tok.slice(split));
    }
  }

  // los códigos que existen en el catálogo van primero
  const hits = out.filter(c => idx.exact.has(c));
  const rest = out.filter(c => !idx.exact.has(c));
  return hits.concat(rest).slice(0, 8);
}

// ---- preparación de imagen para el OCR (escala + escala de grises con contraste) ----
function prepForOcr(srcCanvas) {
  const MAX = 1500;
  const scale = Math.min(1, MAX / Math.max(srcCanvas.width, srcCanvas.height));
  const w = Math.max(32, Math.round(srcCanvas.width * scale));
  const h = Math.max(32, Math.round(srcCanvas.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  try {
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const v = g < 90 ? (g * 0.65) | 0 : g > 170 ? 255 - (((255 - g) * 0.65) | 0) : g;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
  } catch (e) { /* si el lienzo no es legible, seguimos en color */ }
  return cv;
}

function imageToCanvas(src, maxW) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const scale = Math.min(1, (maxW || 2400) / im.naturalWidth);
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.naturalWidth * scale);
      cv.height = Math.round(im.naturalHeight * scale);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      res(cv);
    };
    im.onerror = rej;
    im.src = src;
  });
}

async function ocrCanvas(cv, label) {
  window.FWApp.setStatus(`Leyendo ${label || 'imagen'} con OCR (en móvil puede tardar 10-30 s)…`, true);
  try {
    const worker = await ensureWorker();
    window.FWApp.setStatus('Buscando códigos en la imagen…', true);
    const { data } = await worker.recognize(prepForOcr(cv));
    const codes = extractCodes(data.text || '');
    window.FWApp.setStatus(null);
    return codes;
  } catch (e) {
    window.FWApp.setStatus(e.message || 'Error de OCR', false);
    return [];
  }
}

window.FWScan = {
  initUI() {
    if (!hasCameraAPI()) {
      const fb = $('#camFallback p');
      if (fb) fb.textContent = '📸 Este navegador/entorno no permite cámara. Usa «Subir foto de la carta»: funciona igual.';
    }
    window.FW_APP_INDEX = buildIndex();
  },
  extractCodes,   // expuesto para diagnóstico/pruebas
  async startCamera() {
    if (!hasCameraAPI()) {
      $('#camFallback p').textContent = '📸 Cámara no disponible aquí (usa Subir foto). Si abres la app vía http://localhost sí funcionará.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      const v = $('#camPreview');
      v.srcObject = stream; v.hidden = false;
      $('#camFallback').hidden = true;
      $('#btnCamShot').hidden = false;
      $('#btnCamStart').textContent = '🎥 Cámara activa';
    } catch (e) {
      $('#camFallback p').textContent = '📸 Permiso de cámara denegado o no disponible. Usa «Subir foto de la carta».';
    }
  },
  async capture() {
    const v = $('#camPreview');
    if (!stream || !v.videoWidth) { window.FWApp.setStatus('La cámara no está activa todavía; espera a ver la imagen y vuelve a pulsar.'); return; }
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const codes = await ocrCanvas(cv, 'captura');
    window.FWApp.showScanResults(codes);
  },
  async ocrFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const cv = await imageToCanvas(url);
      const codes = await ocrCanvas(cv, file.name);
      window.FWApp.showScanResults(codes);
    } finally { URL.revokeObjectURL(url); }
  },
  async ocrFiles(files) {
    const all = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      try {
        const cv = await imageToCanvas(url);
        const codes = await ocrCanvas(cv, f.name);
        if (codes.length) all.push(codes[0]);
      } finally { URL.revokeObjectURL(url); }
    }
    window.FWApp.showScanResults(all);
  },
};
})();
