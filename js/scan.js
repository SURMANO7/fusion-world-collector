/* Escáner de cartas: cámara o foto subida + OCR (Tesseract.js) para leer el código impreso (p. ej. FB01-001). */
(function () {
'use strict';

let stream = null;
let workerPromise = null;

const $ = s => document.querySelector(s);

function hasCameraAPI() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

async function ensureWorker() {
  if (!window.Tesseract || window.__noTesseract) throw new Error('OCR no disponible (sin conexión). Escribe el código a mano o crea la carta como personalizada.');
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng').catch(e => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Detección de códigos tipo FB01-001, ST02-100, EX03-015, P-001, MB01-012…
function extractCodes(text) {
  const out = [];
  const re = /\b([A-Z]{1,4}\d{0,2})\s*[-–—:]\s*(\d{1,4})\b/g;
  let m;
  while ((m = re.exec(text.toUpperCase())) !== null) {
    let prefix = m[1].replace(/[^A-Z0-9]/g, '');
    let digits = m[2];
    if (!/[A-Z]/.test(prefix) && prefix !== 'P') continue;   // requiere prefijo con letras (o P)
    if (digits.length < 2) continue;
    const cand1 = `${prefix}-${digits}`;
    const cand2 = `${prefix}-${digits.padStart(3, '0')}`;
    const cand3 = `${prefix}-${digits.padStart(2, '0')}`;
    out.push(cand1, cand2, cand3);
  }
  // el primero que exista en el catálogo gana; si no, el primero tal cual
  const cat = window.FW_APP_INDEX;
  const uniq = [...new Set(out)];
  const hit = cat ? uniq.find(c => cat.has(c)) : null;
  const result = [];
  if (hit) result.push(hit);
  uniq.forEach(c => { if (c !== hit) result.push(c); });
  return result.slice(0, 8);
}

function imageToCanvas(src, maxW) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const scale = Math.min(1, (maxW || 1600) / im.naturalWidth);
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
  window.FWApp.setStatus(`Leyendo ${label || 'imagen'} con OCR…`, true);
  try {
    const worker = await ensureWorker();
    const { data } = await worker.recognize(cv);
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
    // índice de códigos para priorizar coincidencias exactas del OCR
    const idx = new Set();
    (window.FW_DATA.cards || []).forEach(c => idx.add(c.c));
    window.FW_APP_INDEX = idx;
  },
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
    if (!stream || !v.videoWidth) { window.FWApp.setStatus('La cámara no está activa'); return; }
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
