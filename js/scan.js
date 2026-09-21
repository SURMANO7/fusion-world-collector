/* EscÃ¡ner de cartas: cÃ¡mara o foto subida + OCR (Tesseract.js) para leer el cÃ³digo impreso (p. ej. FB01-001).
   Optimizado para mÃ³vil: preprocesado de imagen, correcciÃ³n de caracteres que el OCR confunde
   (Oâ†”0, Iâ†”1, Sâ†”5, Bâ†”8, Zâ†”2, Gâ†”6, Q/Dâ†”0, Lâ†”1) validada contra el catÃ¡logo real. */
(function () {
'use strict';

let stream = null;
let workerPromise = null;

const $ = s => document.querySelector(s);

function hasCameraAPI() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

async function ensureWorker() {
  if (!window.Tesseract || window.__noTesseract) throw new Error('El OCR no estÃ¡ disponible (sin conexiÃ³n). Escribe el cÃ³digo a mano o crea la carta como personalizada.');
  if (!workerPromise) {
    window.FWApp.setStatus('Preparando el motor OCR (la primera vez descarga ~10 MB, puede tardar 1 min con datos mÃ³viles)â€¦', true);
    workerPromise = Tesseract.createWorker('eng').catch(e => {
      workerPromise = null;
      throw new Error('Tu navegador no pudo iniciar el OCR. Escribe el cÃ³digo a mano en el recuadro de abajo.');
    });
  }
  return workerPromise;
}

// ---- Ã­ndice del catÃ¡logo con claves "canÃ³nicas" (tolerantes a confusiones del OCR) ----
const AMBIG = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '7', S: '5', B: '8', Z: '2', G: '6', A: '4' };
function canonStr(s) {
  return String(s).toUpperCase().split('').map(ch => (Object.prototype.hasOwnProperty.call(AMBIG, ch) ? AMBIG[ch] : ch)).join('');
}
function buildIndex() {
  const exact = new Set();
  const canonMap = new Map();   // clave canÃ³nica -> cÃ³digo real del catÃ¡logo
  (window.FW_DATA.cards || []).forEach(c => {
    if (!c.c) return;
    exact.add(c.c);
    const k = canonStr(c.c);
    if (!canonMap.has(k)) canonMap.set(k, c.c);
  });
  return { exact, canonMap };
}

// ---- extracciÃ³n de cÃ³digos desde el texto del OCR ----
function extractCodes(text) {
  const idx = window.FW_APP_INDEX || { exact: new Set(), canonMap: new Map() };
  const out = [];
  const push = c => { if (c && !out.includes(c)) out.push(c); };
  const lookups = pre => {
    const variants = [pre];
    if (/^[0-9]/.test(pre)) variants.push(pre.slice(1));          // perdiÃ³ una letra inicial: "8B01"â†’"B01"
    if (!/^F/.test(pre)) variants.push('F' + pre);                 // perdiÃ³ la F inicial: "B01"â†’"FB01"
    return variants;
  };
  const tryMatch = (pre, dig) => {
    // 1) tal cual (con relleno de ceros)
    [dig, dig.padStart(3, '0'), dig.padStart(2, '0')].forEach(d => push(pre + '-' + d));
    // 2) corrigiendo caracteres confundidos, contra el catÃ¡logo
    lookups(pre).forEach(p => {
      [dig, dig.padStart(3, '0'), dig.padStart(2, '0')].forEach(d => {
        const k = canonStr(p) + '-' + canonStr(d);
        if (idx.canonMap.has(k)) push(idx.canonMap.get(k));
      });
    });
  };

  const T = String(text || '').toUpperCase();
  let m;
  const taken = [];   // rangos ya consumidos por cÃ³digos vÃ¡lidos (evita que "5000.FB05" se coma "FB05-013")
  const overlap = (a, b) => taken.some(r => a < r[1] && b > r[0]);
  // pasada estricta: separador real de carta (guion) y prefijo con letras+imos
  const reStrict = /\b([A-Z]{1,4}\d{1,2})\s*[-â€“â€”]\s*(\d{2,4})\b/g;
  while ((m = reStrict.exec(T)) !== null) {
    if (!overlap(m.index, m.index + m[0].length)) {
      taken.push([m.index, m.index + m[0].length]);
      tryMatch(m[1], m[2]);
    }
  }
  // pasada laxa: otros separadores que deja el OCR (puntos, dos puntos, barrasâ€¦)
  const reSep = /\b([A-Z0-9]{1,4})\s*[-â€“â€”:|.Â·]\s*([A-Z0-9]{2,4})\b/g;
  while ((m = reSep.exec(T)) !== null) {
    if (!overlap(m.index, m.index + m[0].length)) tryMatch(m[1], m[2]);
  }
  // formato pegado sin separador: FB01001, 8B01001â€¦ (probando todas las particiones prefijo/dÃ­gitos)
  const reTok = /\b[A-Z0-9]{4,7}\b/g;
  while ((m = reTok.exec(T)) !== null) {
    const tok = m[0];
    if (!/[A-Z]/.test(tok)) continue;   // ignorar nÃºmeros puros (poder, stats)
    if (overlap(m.index, m.index + tok.length)) continue;
    for (let split = Math.max(1, tok.length - 4); split <= Math.min(4, tok.length - 2); split++) {
      tryMatch(tok.slice(0, split), tok.slice(split));
    }
  }

  // los cÃ³digos que existen en el catÃ¡logo van primero
  const hits = out.filter(c => idx.exact.has(c));
  const rest = out.filter(c => !idx.exact.has(c));
  return hits.concat(rest).slice(0, 8);
}

// ---- preparaciÃ³n de imagen para el OCR (escala + escala de grises con contraste) ----
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
  window.FWApp.setStatus(`Leyendo ${label || 'imagen'} con OCR (en mÃ³vil puede tardar 10-30 s)â€¦`, true);
  try {
    const worker = await ensureWorker();
    window.FWApp.setStatus('Buscando cÃ³digos en la imagenâ€¦', true);
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
      if (fb) fb.textContent = 'ðŸ“¸ Este navegador/entorno no permite cÃ¡mara. Usa Â«Subir foto de la cartaÂ»: funciona igual.';
    }
    window.FW_APP_INDEX = buildIndex();
  },
  extractCodes,   // expuesto para diagnÃ³stico/pruebas
  async startCamera() {
    if (!hasCameraAPI()) {
      $('#camFallback p').textContent = 'ðŸ“¸ CÃ¡mara no disponible aquÃ­ (usa Subir foto). Si abres la app vÃ­a http://localhost sÃ­ funcionarÃ¡.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      const v = $('#camPreview');
      v.srcObject = stream; v.hidden = false;
      $('#camFallback').hidden = true;
      $('#btnCamShot').hidden = false;
      $('#btnCamStart').textContent = 'ðŸŽ¥ CÃ¡mara activa';
    } catch (e) {
      $('#camFallback p').textContent = 'ðŸ“¸ Permiso de cÃ¡mara denegado o no disponible. Usa Â«Subir foto de la cartaÂ».';
    }
  },
  async capture() {
    const v = $('#camPreview');
    if (!stream || !v.videoWidth) { window.FWApp.setStatus('La cÃ¡mara no estÃ¡ activa todavÃ­a; espera a ver la imagen y vuelve a pulsar.'); return; }
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const codes = await ocrCanvas(cv, 'captura');
    window.FWApp.showScanResults(codes, { hitsOnly: true });
  },
  async ocrFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const cv = await imageToCanvas(url);
      const codes = await ocrCanvas(cv, file.name);
      window.FWApp.showScanResults(codes, { hitsOnly: true });
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
    window.FWApp.showScanResults(all, { hitsOnly: true });
  },
};
})();
