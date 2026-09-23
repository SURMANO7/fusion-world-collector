/* Dragon Ball Fusion World — Coleccionista
   App 100% local: los datos se guardan en tu navegador (localStorage). */
(function () {
'use strict';

// ---------------------------------------------------------------- utilidades
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmtNum = n => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Los precios internos están en dólares (fuente TCGplayer); fmtP los muestra en la moneda elegida.
function fmtP(n) {
  if (!isFinite(n)) return '—';
  return window.__CUR && window.__CUR.cur === 'EUR' ? fmtNum(n * window.__CUR.rate) + ' €' : '$' + fmtNum(n);
}
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const img = i => `https://tcgplayer-cdn.tcgplayer.com/product/${i}_200w.jpg`;
const cardmarketUrl = q => `https://www.cardmarket.com/en/DragonBallSuper/Products/Search?searchString=${encodeURIComponent(q)}`;
const ebayUrl = q => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`;
const tcgUrl = i => `https://www.tcgplayer.com/product/${i}`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- índices catálogo
const DATA = window.FW_DATA || { generated: today(), sets: [], cards: [] };
const SETS = DATA.sets || [];
const CARDS = DATA.cards || [];
const byId = new Map();
const byNumber = new Map();
CARDS.forEach(c => {
  byId.set(c.i, c);
  if (!byNumber.has(c.c)) byNumber.set(c.c, []);
  byNumber.get(c.c).push(c);
});
const RARITIES = [...new Set(CARDS.map(c => c.r).filter(Boolean))].sort();
const TYPES = [...new Set(CARDS.map(c => c.t).filter(Boolean))].sort();

const rarityLabel = r => (r === 'None' || r == null || r === '') ? 'Token' : r;
const productTag = c => c.se ? (c.t || 'Producto sellado') : rarityLabel(c.r);
const productNum = c => c.se ? '📦 sellado' : c.c;
function rarityClass(r) {
  r = norm(r || '');
  if (r.includes('secret')) return 'rc-SecretRare';
  if (r.includes('ultimate') || r.includes('ultra')) return 'rc-UltimateRare';
  if (r.includes('super')) return 'rc-SuperRare';
  if (r.includes('rare') && !r.includes('un')) return 'rc-Rare';
  if (r.includes('uncommon')) return 'rc-Uncommon';
  if (r.includes('promo')) return 'rc-Promo';
  if (r.includes('leader')) return 'rc-Leader';
  return 'rc-Common';
}
const setName = g => (SETS[g] ? SETS[g].name : '—');

// ---------------------------------------------------------------- estado + persistencia
const LS = { col: 'fw_col_v1', hist: 'fw_hist_v1', custom: 'fw_custom_v1' }; // claves "invitado" (compatibilidad)
const ACCOUNTS_KEY = 'fw_accounts_v1', SESSION_KEY = 'fw_session_v1';
function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch (e) { return fb; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('⚠️ No se pudo guardar (almacenamiento lleno)'); } }

// preferencia de moneda (global del navegador): los datos siguen estando en USD
window.__CUR = load('fw_cur_v1', { cur: 'USD', rate: 0.92, rateDate: null, auto: true });
function saveCur() { save('fw_cur_v1', window.__CUR); }
function setCurrency(cur) {
  window.__CUR.cur = cur;
  saveCur(); updateCurButtons(); renderAll();
  if (modalKey && !$('#modal').hidden) { const mk = modalKey; closeModal(); openModal(mk); }
  toast(cur === 'EUR' ? '💶 Precios en euros' : '💵 Precios en dólares');
}
async function fetchRate(manual) {
  if (manual) toast('💱 Buscando cambio actual…');
  const fuentes = [
    { url: 'https://open.er-api.com/v6/latest/USD', lee: j => (j && j.rates) ? j.rates.EUR : null },
    { url: 'https://api.frankfurter.app/latest?from=USD&to=EUR', lee: j => (j && j.rates) ? j.rates.EUR : null }
  ];
  for (const f of fuentes) {
    try {
      const j = await fetch(f.url).then(x => x.json());
      const eur = f.lee(j);
      if (eur && isFinite(eur) && eur > 0.1 && eur < 5) {
        window.__CUR.rate = Math.round(eur * 10000) / 10000;
        window.__CUR.rateDate = today();
        saveCur(); updateCurButtons(); renderAll();
        if (modalKey && !$('#modal').hidden) { const mk = modalKey; closeModal(); openModal(mk); }
        if (manual) toast('💱 Cambio actualizado: 1 $ = ' + window.__CUR.rate + ' €');
        return true;
      }
    } catch (e) { /* probamos la siguiente fuente */ }
  }
  if (manual) toast('No se pudo obtener el cambio (sin conexión). Puedes fijarlo a mano en Ajustes.');
  return false;
}
function updateCurButtons() {
  const u = $('#curUSD'), eu = $('#curEUR'), ct = $('#curToggle');
  if (u) u.classList.toggle('sel', window.__CUR.cur === 'USD');
  if (eu) eu.classList.toggle('sel', window.__CUR.cur === 'EUR');
  if (ct) ct.textContent = window.__CUR.cur === 'EUR' ? '💱 €' : '💱 $';
  const info = $('#curInfo');
  if (info) info.innerHTML = `Cambio actual: <b>1 $ = ${window.__CUR.rate} €</b>${window.__CUR.rateDate ? ' (BCE, ' + esc(window.__CUR.rateDate) + ')' : ''}. Los precios originales son en dólares (TCGplayer); la conversión a € es aproximada.`;
}
function maybeFetchRate() {
  const CUR = window.__CUR;
  if (!CUR.auto) return;
  const stale = !CUR.rateDate || (Date.now() - new Date(CUR.rateDate + 'T12:00:00')) > 86400000;
  if (stale) fetchRate(false);
}

const state = {
  user: null, prefix: null,    // prefix null = invitado → usa clases fw_* originales
  col: [], hist: {}, custom: [],
  limitCol: 60, limitAll: 60, limitSearch: 60,
};
const K = n => state.prefix ? state.prefix + n + '_v1' : LS[n];
function loadState() {
  state.col = load(K('col'), []);
  state.hist = load(K('hist'), {});
  state.custom = load(K('custom'), []);
  let migr = false;
  state.col.forEach(e => { if (!e.id) { e.id = uid(); migr = true; } });
  if (migr) save(K('col'), state.col);
}
function saveState(mask) {
  if (mask & 1) save(K('col'), state.col);
  if (mask & 2) save(K('hist'), state.hist);
  if (mask & 4) save(K('custom'), state.custom);
}

// ---------------------------------------------------------------- cuentas (locales a este navegador)
function getAccounts() { return load(ACCOUNTS_KEY, {}); }
function normUser(u) { return norm(u).replace(/[^a-z0-9_.-]/g, ''); }
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function hashPw(pw, salt) {
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '::' + pw))
        .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''))
        .catch(() => Promise.resolve(cyrb53(salt + '::' + pw)));
    }
  } catch (e) { /* file:// sin subtle → hash rápido */ }
  return Promise.resolve(cyrb53(salt + '::' + pw));
}
function enterApp(key) {
  const accs = getAccounts();
  state.user = (accs[key] && accs[key].name) || key;
  state.prefix = 'fw_u_' + key + '_';
  save(SESSION_KEY, key);
  $('#auth').hidden = true;
  $('#userChip').textContent = '👤 ' + state.user;
  const w = $('#whoami'); if (w) w.textContent = `la cuenta "${state.user}"`;
  loadState();
  if (window.FW_PRICES) applySync(true);
  renderAll();
}
function enterGuest() {
  state.user = null; state.prefix = null;
  save(SESSION_KEY, null);
  $('#auth').hidden = true;
  $('#userChip').textContent = '👤 Invitado';
  const w = $('#whoami'); if (w) w.textContent = 'invitado';
  loadState();
  if (window.FW_PRICES) applySync(true);
  renderAll();
}
function showAuth() {
  $('#auth').hidden = false; $('#authUser').focus();
  try {
    const k = '__fw_test__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
  } catch (e) {
    authMsg('⚠ Este navegador tiene el almacenamiento bloqueado (ventana de incógnito, navegador interno de otra app o seguridad estricta): las cuentas NO se guardarán. Abre el enlace en tu navegador normal (Edge/Chrome).');
  }
}
function authMsg(t) { const el = $('#authMsg'); el.textContent = t; el.hidden = !t; }
function bindAuth() {
  let mode = 'in';
  const setMode = m => {
    mode = m;
    $('#authTabIn').classList.toggle('active', m === 'in');
    $('#authTabUp').classList.toggle('active', m === 'up');
    $('#authSubmit').textContent = m === 'in' ? '🔑 Entrar' : '➕ Crear cuenta';
    $('#authPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    authMsg('');
  };
  $('#authTabIn').addEventListener('click', () => setMode('in'));
  $('#authTabUp').addEventListener('click', () => setMode('up'));
  $('#authGuest').addEventListener('click', ev => { ev.preventDefault(); enterGuest(); });
  $('#btnLogout').addEventListener('click', () => { localStorage.removeItem(SESSION_KEY); location.reload(); });
  $('#authForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const raw = $('#authUser').value.trim();
    const pw = $('#authPass').value;
    const key = normUser(raw);
    if (key.length < 3) { authMsg('El usuario debe tener 3-20 caracteres (letras, números, . _ -).'); return; }
    if (pw.length < 4) { authMsg('La contraseña necesita al menos 4 caracteres.'); return; }
    const accs = getAccounts();
    if (mode === 'up') {
      if (accs[key]) { authMsg('Ese usuario ya existe. Prueba a entrar con él.'); return; }
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      accs[key] = { name: raw, salt, hash: await hashPw(pw, salt), created: today() };
      save(ACCOUNTS_KEY, accs);
      enterApp(key);
      // migración voluntaria de la colección sin cuenta
      const gcol = load(LS.col, []);
      if (!state.col.length && !state.custom.length && !Object.keys(state.hist).length && gcol.length &&
          confirm(`Encontré una colección sin cuenta en este navegador (${gcol.length} cartas distintas).\n¿Copiarla a tu cuenta "${state.user}"?`)) {
        state.col = gcol;
        state.hist = load(LS.hist, {});
        state.custom = load(LS.custom, []);
        saveState(7);
        renderAll();
      }
      toast(`🎉 Cuenta creada. ¡Bienvenido, ${state.user}!`);
    } else {
      const acc = accs[key];
      if (!acc) {
        authMsg('Ese usuario no existe EN ESTE NAVEGADOR. Las cuentas no viajan entre dispositivos ni entre la app local y el enlace: si la creaste en el móvil, en otro navegador, en incógnito o en el index.html local, tienes que crearla aquí de nuevo (Ajustes → Exportar/Importar para pasar tu cartera).');
        return;
      }
      const h = await hashPw(pw, acc.salt);
      if (h !== acc.hash) { authMsg('Contraseña incorrecta.'); return; }
      enterApp(key);
      toast(`👋 Hola de nuevo, ${state.user}`);
    }
    $('#authForm').reset();
  });
}

// ---------------------------------------------------------------- precios
function marketOf(prices, finish) {
  if (!prices) return null;
  if (finish === 'H' && prices.H) return prices.H[2];
  if (finish === 'N' && prices.N) return prices.N[2];
  const f = prices.N || prices.H;
  return f ? f[2] : null;
}

// ---- valoración PSA (estimación con los multiplicadores actuales del mercado TCG) ----
const PSA_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PSA_RATIO = { 1: 0.08, 2: 0.10, 3: 0.11, 4: 0.13, 5: 0.16, 6: 0.19, 7: 0.23, 8: 0.30, 9: 0.42, 10: 1 };
function psaBaseMultiplier(raw) {
  if (raw < 3) return 5.0;        // cartas baratas: el PSA 10 se multiplica mucho
  if (raw < 10) return 3.8;
  if (raw < 30) return 3.0;
  if (raw < 100) return 2.4;
  if (raw < 300) return 2.0;
  return 1.7;                      // cartas caras: prima más contenida
}
function psaEstimate(card, grade, basePrice) {
  if (!card || basePrice == null || !isFinite(basePrice) || basePrice <= 0) return null;
  const ratio = PSA_RATIO[grade];
  if (ratio == null) return null;   // notas fuera de la escala actual (p. ej. 9.5 antiguas)
  const p10 = basePrice * psaBaseMultiplier(basePrice);
  return Math.max(0.5, Math.round(p10 * ratio * 100) / 100);
}
function rawPriceOf(k, card) {
  const l = latest(k);
  if (l) return l.p;
  return marketOf(card && card.pr, null);
}
function cardByKey(k) {
  if (k[0] === 't') return { type: 'card', card: byId.get(+k.slice(1)) };
  if (k[0] === 'c') return { type: 'custom', custom: state.custom.find(c => 'c' + c.id === k) };
  return { type: '?', card: null };
}
function realPoints(k) {
  let pts = state.hist[k] || [];
  if (!pts.length) {
    const r = cardByKey(k);
    if (r.type === 'card' && r.card) {
      const e = state.col.find(x => x.k === k);
      const p = marketOf(r.card.pr, e && e.f);
      if (p != null) pts = [{ d: DATA.generated, p, s: 'seed' }];
    }
  }
  return pts.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
}
function latest(k) {
  const pts = realPoints(k);
  return pts.length ? pts[pts.length - 1] : null;
}
function prev(k) {
  const pts = realPoints(k);
  return pts.length > 1 ? pts[pts.length - 2] : null;
}
function addPoint(k, p, s, d) {
  if (!state.hist[k]) state.hist[k] = [];
  const dpts = d || today();
  const arr = state.hist[k];
  const i = arr.findIndex(x => x.d === dpts && x.s === s);
  if (i >= 0) arr[i].p = p; else arr.push({ d: dpts, p, s });
  arr.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  saveState(2);
}
// Serie simulada de 30 días (solo decorativa, marcada como estimación) que termina en el último precio real.
function simSeries(k, endP) {
  const r = cardByKey(k);
  const seedN = r.type === 'card' && r.card ? r.card.i : 1234567;
  const rnd = mulberry32(seedN);
  const pts = []; let v = endP;
  const end = new Date();
  for (let i = 0; i < 30; i++) {
    pts.unshift({ d: end.toISOString().slice(0, 10), p: v });
    v = Math.max(0.05, v * (1 + (rnd() - 0.5) * 0.11));
    end.setDate(end.getDate() - 1);
  }
  return pts;
}

// ---------------------------------------------------------------- sincronización de precios (prices_latest.js)
function applySync(silent) {
  const PR = window.FW_PRICES;
  if (!PR || !PR.prices) { if (!silent) toast('No hay archivo de precios actualizados (ejecuta update_prices.ps1)'); return 0; }
  let added = 0;
  const keys = new Set([...state.col.map(e => e.k), ...Object.keys(state.hist)]);
  keys.forEach(k => {
    if (k[0] !== 't') return;
    const card = byId.get(+k.slice(1)); if (!card) return;
    const np = PR.prices[card.i]; if (!np) return;
    const e = state.col.find(x => x.k === k);
    const p = marketOf(np, e && e.f);
    if (p == null) return;
    const pts = realPoints(k);
    const last = pts[pts.length - 1];
    if (!last || last.d < PR.date) {
      if (last && last.p === p && last.s === 'sync') return;
      addPoint(k, p, 'sync', PR.date); added++;
    }
  });
  if (!silent) toast(added ? `🔄 ${added} precios actualizados (${PR.date})` : 'Ya tenías los precios más recientes (' + PR.date + ')');
  return added;
}
// Re-inyecta js/prices_latest.js desde disco (por si update_prices.ps1 se ejecutó con la app abierta)
function checkNewPrices() {
  const before = window.FW_PRICES && window.FW_PRICES.date;
  const s = document.createElement('script');
  s.src = 'js/prices_latest.js?ts=' + Date.now();
  s.onload = () => {
    setTimeout(() => {
      const after = window.FW_PRICES && window.FW_PRICES.date;
      if (after && after !== before) {
        const n = applySync(true); renderAll();
        toast(n ? `🔄 ${n} precios actualizados (${after})` : 'Precios al día (' + after + ')');
      } else if (after === before) {
        toast('Sin cambios (' + (after || 'sin datos') + '). Si acabas de ejecutar update_prices.ps1, pulsa F5.');
      } else {
        toast('Ejecuta update_prices.ps1 y vuelve a pulsar este botón.');
      }
    }, 150);
  };
  s.onerror = () => toast('No pude leer js/prices_latest.js — ejecuta update_prices.ps1');
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- plantillas de carta
function thumbHTML(pres, card, custom) {
  const im = card ? `<img loading="lazy" src="${img(card.i)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
  const ph = `<div class="ph" style="display:${card ? 'none' : 'flex'}">${custom ? '<span style="font-size:30px">✍️</span>' : ''}<b>${esc(custom ? custom.n : card.c)}</b><span>${esc(custom ? custom.set : setName(card.g))}</span></div>`;
  const qty = pres && pres.q > 1 ? `<span class="badge-qty">×${pres.q}</span>` : '';
  const psa = pres && pres.psa ? `<span class="badge-psa">🏆 PSA ${pres.psa}</span>` : '';
  const cust = custom ? '<span class="badge-custom">personalizada</span>' : '';
  return `<div class="thumb">${im}${ph}${qty}${psa}${cust}</div>`;
}
function sparkSVG(k) {
  const pts = realPoints(k).slice(-30);
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><line x1="0" y1="15" x2="100" y2="15" stroke="#3a4a63" stroke-width="2"/></svg>`;
  const vs = pts.map(p => p.p), mn = Math.min(...vs), mx = Math.max(...vs), rg = (mx - mn) || 1;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - ((p.p - mn) / rg) * 24 + 1}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${xy}" fill="none" stroke="${vs[vs.length-1] >= vs[0] ? '#38d39f' : '#ff5d6c'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function priceHTML(k) {
  const l = latest(k);
  if (!l) return `<span class="price muted">sin precio</span>`;
  const pv = prev(k);
  let delta = '';
  if (pv) {
    const ch = ((l.p - pv.p) / pv.p) * 100;
    if (Math.abs(ch) >= 0.5) delta = `<span class="${ch > 0 ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</span>`;
  }
  return `<span class="price">${fmtP(l.p)} ${delta}</span>`;
}

// ---------------------------------------------------------------- vista: MI CARTERA
function colFiltered() {
  const q = norm($('#colSearch').value);
  const fs = $('#colSetFilter').value, fr = norm($('#colRarityFilter').value);
  const sort = $('#colSort').value;
  let rows = state.col.map(e => {
    const r = cardByKey(e.k);
    if (r.type === 'card' && r.card) return { e, card: r.card, custom: null };
    if (r.type === 'custom' && r.custom) return { e, card: null, custom: r.custom };
    return null;
  }).filter(Boolean);
  if (q) rows = rows.filter(r => {
    const hay = r.card ? `${r.card.n} ${r.card.c} ${setName(r.card.g)}` : `${r.custom.n} ${r.custom.c || ''} ${r.custom.set || ''}`;
    return norm(hay).includes(q);
  });
  if (fs) rows = rows.filter(r => r.card && String(r.card.g) === fs);
  if (fr) rows = rows.filter(r => norm((r.card || r.custom).r || '') === fr);
  const val = r => (entryPrice(r.e, r.card) || 0) * r.e.q;
  const price = r => entryPrice(r.e, r.card) || -1;
  rows.sort((a, b) => {
    if (sort === 'name') return norm((a.card || a.custom).n).localeCompare(norm((b.card || b.custom).n));
    if (sort === 'priceDesc') return price(b) - price(a);
    if (sort === 'valueDesc') return val(b) - val(a);
    if (sort === 'number') return String((a.card || a.custom).c || '').localeCompare(String((b.card || b.custom).c || ''));
    return String(b.e.added || '').localeCompare(String(a.e.added || ''));
  });
  return rows;
}
function renderStats() {
  const rows = state.col.map(e => ({ e, r: cardByKey(e.k) })).filter(x => x.r.card || x.r.custom);
  let units = 0, value = 0, withP = 0;
  rows.forEach(x => {
    units += x.e.q;
    const p = x.e.psa ? psaEstimate(x.r.card, x.e.psa, rawPriceOf(x.e.k, x.r.card)) : (latest(x.e.k) || {}).p;
    if (p) { value += p * x.e.q; withP++; }
  });
  let lastDate = (window.FW_PRICES && window.FW_PRICES.date) || DATA.generated;
  state.col.forEach(e => { const l = latest(e.k); if (l && l.d > lastDate) lastDate = l.d; });
  const days = Math.max(0, Math.round((Date.now() - new Date(lastDate + 'T12:00:00')) / 86400000));
  const stale = days >= 7;
  $('#statsBar').innerHTML = `
    <div class="stat"><div class="k">Cartas distintas</div><div class="v orange">${rows.length}</div></div>
    <div class="stat"><div class="k">Unidades totales</div><div class="v">${units}</div></div>
    <div class="stat"><div class="k">Valor estimado de la cartera</div><div class="v green">${fmtP(value)}</div></div>
    <div class="stat"><div class="k">Último registro de precios</div>
      <div class="v" style="font-size:15px;padding-top:6px;${stale ? 'color:var(--red)' : ''}">${esc(lastDate)}</div>
      ${stale ? `<div class="k" style="color:var(--red);text-transform:none;letter-spacing:0;margin-top:3px">⚠ hace ${days} días — ejecuta update_prices.ps1</div>` : ''}
    </div>`;
}
function renderCollection() {
  renderStats();
  const grid = $('#collectionGrid');
  const rows = colFiltered();
  $('#collectionEmpty').hidden = state.col.length > 0;
  grid.innerHTML = rows.slice(0, state.limitCol).map(r => {
    const nm = r.card ? r.card.n : r.custom.n;
    const num = r.card ? productNum(r.card) : (r.custom.c || '—');
    const rc = (r.card && r.card.se) ? 'rc-Leader' : rarityClass((r.card || r.custom).r);
    const spark = r.e.psa
      ? `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><line x1="0" y1="15" x2="100" y2="15" stroke="#ffd166" stroke-width="2" stroke-dasharray="4 3"/></svg>`
      : sparkSVG(r.e.k);
    return `<div class="fw-card ${rc}" data-k="${esc(r.e.k)}">
      ${thumbHTML(r.e, r.card, r.custom)}
      <div class="info">
        <div class="nm">${esc(nm)}</div>
        <div class="row"><span class="num">${esc(num)}</span><span class="rar-tag">${esc(r.card ? productTag(r.card) : rarityLabel(r.custom.r))}</span></div>
        <div class="row">${priceEntryHTML(r.e, r.card)}<span class="muted" style="font-size:11.5px">${r.card ? esc(setName(r.card.g)) : 'personalizada'}</span></div>
        ${spark}
        <div class="qty-controls">
          <button data-act="dec" data-eid="${esc(r.e.id)}" title="Quitar una">−</button><span class="q">×${r.e.q}</span><button data-act="inc" data-eid="${esc(r.e.id)}" title="Añadir una">+</button>
          <span style="flex:1"></span><button data-act="del" data-eid="${esc(r.e.id)}" title="Quitar de la cartera">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('') + (rows.length > state.limitCol ? `<button class="btn wide" id="colMore">Ver más (${rows.length - state.limitCol})</button>` : '');
  $('#collectionEmpty').hidden = rows.length > 0;
}

// ---------------------------------------------------------------- vista: CATÁLOGO / BÚSQUEDA
function catalogFilter(cfg) {
  const q = norm($(cfg.search).value);
  const fs = $(cfg.set).value, fr = norm($(cfg.rarity).value), ft = cfg.type ? norm($(cfg.type).value) : '';
  let list = CARDS;
  if (fs !== '') list = list.filter(c => String(c.g) === fs);
  if (fr) list = list.filter(c => norm(c.r || '') === fr);   // exacto: «Rare» no arrastra «Super Rare»
  if (ft) list = list.filter(c => norm(c.t || '') === ft);  // exacto: «Sobre» no arrastra «Caja de sobres»
  if (q) {
    const numHit = byNumber.get(q.toUpperCase().replace(/\s+/g, ''));
    const scored = [];
    for (const c of list) {
      const hay = norm(c.n + ' ' + c.c);
      const i = hay.indexOf(q);
      if (i >= 0) scored.push([i, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n));
    list = scored.map(x => x[1]);
    if (numHit) list = numHit.concat(list.filter(c => !numHit.includes(c)));
  }
  return list;
}
function catalogCardHTML(c) {
  const pres = state.col.find(e => e.k === 't' + c.i && !e.psa) || state.col.find(e => e.k === 't' + c.i);
  const rc = c.se ? 'rc-Leader' : rarityClass(c.r);
  return `<div class="fw-card ${rc}" data-open="t${c.i}">
    ${thumbHTML(pres, c, null)}
    <div class="info">
      <div class="nm">${esc(c.n)}</div>
      <div class="row"><span class="num">${esc(productNum(c))}</span><span class="rar-tag">${esc(productTag(c))}</span></div>
      <div class="row">${priceHTML('t' + c.i)}<button class="btn small primary" data-add="t${c.i}">＋ Añadir</button></div>
    </div>
  </div>`;
}
function renderCatalogPanel() {
  // panel "añadir > buscar"
  const listS = catalogFilter({ search: '#catSearch', set: '#catSetFilter', rarity: '#catRarityFilter' });
  $('#catalogResults').innerHTML = listS.slice(0, state.limitSearch).map(catalogCardHTML).join('');
  $('#catalogEmptyMsg').hidden = listS.length > 0;
  $('#btnLoadMore').hidden = listS.length <= state.limitSearch;
  $('#btnLoadMore').textContent = `Cargar más (${listS.length - Math.min(listS.length, state.limitSearch)} restantes)`;
  // panel catálogo completo
  const listA = catalogFilter({ search: '#allSearch', set: '#allSetFilter', rarity: '#allRarityFilter', type: '#allTypeFilter' });
  $('#catalogCount').textContent = `${listA.length.toLocaleString('es-ES')} cartas`;
  $('#allGrid').innerHTML = listA.slice(0, state.limitAll).map(catalogCardHTML).join('');
  $('#btnAllLoadMore').textContent = `Cargar más (${listA.length - Math.min(listA.length, state.limitAll)} restantes)`;
}
function fillFilters() {
  const opt = v => `<option value="${esc(v)}">${esc(v)}</option>`;
  const setsHtml = SETS.map((s, i) => `<option value="${i}">${esc(s.name)} (${esc(s.date)})</option>`).join('');
  $('#colSetFilter').innerHTML += setsHtml; $('#catSetFilter').innerHTML += setsHtml; $('#allSetFilter').innerHTML += setsHtml;
  const rarHtml = RARITIES.map(opt).join('');
  $('#colRarityFilter').innerHTML += rarHtml; $('#catRarityFilter').innerHTML += rarHtml; $('#allRarityFilter').innerHTML += rarHtml;
  $('#allTypeFilter').innerHTML += TYPES.map(opt).join('');
}

// ---------------------------------------------------------------- vista: PERSONALIZADAS
function renderCustomList() {
  $('#customList').innerHTML = state.custom.length ? state.custom.map(c => {
    const k = 'c' + c.id, l = latest(k);
    return `<div class="custom-row">
      <span class="nm">${esc(c.n)} <span class="muted">· ${esc(c.set || 'sin set')}${c.c ? ' · ' + esc(c.c) : ''}</span></span>
      <span class="price" style="color:var(--gold)">${l ? fmtP(l.p) : ''}</span>
      <button class="btn small" data-open="${esc(k)}">Ficha</button>
      <button class="btn small danger" data-delcustom="${c.id}">🗑</button>
    </div>`;
  }).join('') : '<p class="muted">Todavía no tienes cartas personalizadas.</p>';
}

// ---------------------------------------------------------------- modal de detalle
let modalKey = null;
let chartRef = null;
let psaSel = 10;
function psaSectionHTML(k, card) {
  const base = rawPriceOf(k, card);
  const chips = PSA_GRADES.map(g => {
    const est = psaEstimate(card, g, base);
    return `<button type="button" class="psa-chip ${g === psaSel ? 'sel' : ''}" data-psa="${g}"><b>PSA ${g}</b><span>${est != null ? fmtP(est) : '—'}</span></button>`;
  }).join('');
  const selEst = psaEstimate(card, psaSel, base);
  const mult = base ? `≈ ${(psaBaseMultiplier(base) * (PSA_RATIO[psaSel] || 1)).toFixed(2)}× el precio sin gradear` : '';
  return `<h4 style="margin-top:14px">🏆 Versión gradeada PSA — precio estimado por valoración</h4>
    <div class="psa-grid">${chips}</div>
    <div class="psa-sel">Con nota <b>PSA ${psaSel}</b> esta carta valdría <b style="color:var(--gold)">${selEst != null ? fmtP(selEst) : '—'}</b>${mult ? ` <span class="muted">(${mult})</span>` : ''}</div>
    <div class="detail-actions">
      <button class="btn primary" id="btnSavePsa">🎒 Guardar en mi cartera como PSA ${psaSel}</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:8px">Estimación orientativa con los multiplicadores actuales del mercado TCG (no es una valoración oficial).</p>`;
}
function openModal(k) {
  const isNew = modalKey !== k;
  modalKey = k;
  const r = cardByKey(k);
  if (r.type === '?' || (!r.card && !r.custom)) { toast('Esa carta ya no existe en el catálogo'); return; }
  const card = r.card, custom = r.custom;
  const e = state.col.find(x => x.k === k && !x.psa) || state.col.find(x => x.k === k);
  const ownedPsa = state.col.find(x => x.k === k && x.psa);
  if (isNew) psaSel = ownedPsa ? ownedPsa.psa : 10;
  const l = latest(k), pv = prev(k);
  const nm = card ? card.n : custom.n;
  const rc = (card && card.se) ? 'rc-Leader' : rarityClass((card || custom).r);
  const prices = card ? card.pr : null;
  const finish = e && e.f ? e.f : (prices && prices.N ? 'N' : 'H');
  let priceBoxes = '';
  if (prices) {
    const box = (tag, arr, hl) => arr ? `<div class="pbox ${hl ? 'hl' : ''}"><div class="k">${tag}</div><div class="v">${fmtP(arr[2])}</div>
      <div class="k" style="margin-top:6px">mín ${fmtP(arr[0])} · máx ${fmtP(arr[3])}</div></div>` : '';
    priceBoxes = box('Precio medio · Normal', prices.N, finish === 'N') + box('Precio medio · Holo', prices.H, finish === 'H');
  } else {
    priceBoxes = `<div class="pbox hl"><div class="k">Último precio registrado</div><div class="v">${l ? fmtP(l.p) : '—'}</div><div class="k" style="margin-top:6px">carta personalizada</div></div>`;
  }
  const meta = [];
  if (card) {
    if (card.se) {
      meta.push(setName(card.g), card.t, '📦 Producto sellado');
    } else {
      meta.push(setName(card.g), rarityLabel(card.r), card.t, card.o, card.k ? 'Coste ' + card.k : '', card.p ? 'Poder ' + card.p : '');
    }
  } else {
    meta.push(custom.set || 'sin set', custom.r, custom.o);
  }
  if (ownedPsa) meta.push('🏆 PSA ' + ownedPsa.psa + ' ×' + ownedPsa.q + ' en cartera');
  const ch = pv && l ? ((l.p - pv.p) / pv.p) * 100 : null;
  $('#modalBody').innerHTML = `
    <div class="detail-top ${rc}">
      ${thumbHTML(e, card, custom)}
      <div class="detail-info">
        <h2>${esc(nm)}</h2>
        <div class="muted">${card ? (card.se ? `Producto sellado · TCGplayer #${card.i}` : `Código <b>${esc(card.c)}</b> · TCGplayer #${card.i}`) : 'Carta personalizada — no registrada en Cardmarket'}</div>
        <div class="detail-meta">${meta.filter(Boolean).map(m => `<span class="chip">${esc(m)}</span>`).join('')}
          <span class="chip" style="border-color:var(--orange);color:var(--orange)">Última media: <b>${l ? fmtP(l.p) : '—'}</b>${ch != null ? ` (${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}% vs anterior)` : ''}</span></div>
        <div class="price-boxes">${priceBoxes}</div>
        <div class="chart-wrap"><canvas id="detailChart" height="240"></canvas>
          <div class="legend-note"><span class="dot dot-real"></span>registros reales (precio medio del día)
          <span class="dot dot-sim"></span>estimación simulada — la gráfica real crece con cada actualización de precios</div>
        </div>
        <h4 style="margin-top:14px">🗓 Registros de ventas / precios</h4>
        <div class="timeline">${timelineHTML(k)}</div>
        ${card && !card.se ? psaSectionHTML(k, card) : ''}
        <div class="detail-actions">
          ${card ? `<a class="btn primary" target="_blank" rel="noopener" href="${cardmarketUrl(card.se ? card.n : card.c)}">🏷 Ver precio en Cardmarket (€)</a>
                    <a class="btn" target="_blank" rel="noopener" href="${ebayUrl(card.se ? card.n : `${card.c} ${card.n}`)}">🛒 Ver en eBay</a>
                    <a class="btn" target="_blank" rel="noopener" href="${tcgUrl(card.i)}">Ver en TCGplayer</a>` : ''}
          ${e ? `<div class="qty-controls" style="margin:0">
                   <button data-act="dec">−</button><span class="q">×${e.q}</span><button data-act="inc">+</button>
                   ${prices && (prices.N || prices.H) ? `<select id="finishSel" class="btn small" style="padding:6px 8px">
                     ${prices && prices.N ? `<option value="N" ${finish === 'N' ? 'selected' : ''}>Normal</option>` : ''}
                     ${prices && prices.H ? `<option value="H" ${finish === 'H' ? 'selected' : ''}>Holo</option>` : ''}
                   </select>` : ''}
                   <button class="btn small danger" data-act="del">🗑 Quitar de la cartera</button>
                 </div>`
              : `<button class="btn primary" data-add="${esc(k)}">🎒 Añadir a mi cartera</button>`}
        </div>
      </div>
    </div>`;
  $('#modal').hidden = false;
  drawChart(k, !!card);
}
function timelineHTML(k) {
  const pts = realPoints(k).slice().reverse();
  if (!pts.length) return '<p class="muted">Sin registros todavía. Añade uno manualmente o ejecuta una actualización de precios.</p>';
  const srcName = { seed: 'registro inicial', sync: 'sincronización', manual: 'manual' };
  return pts.map(p => `<div class="tl-row"><span>${esc(p.d)}</span><span><b>${fmtP(p.p)}</b></span><span class="src ${esc(p.s)}">${esc(srcName[p.s] || p.s)}</span></div>`).join('');
}
function drawChart(k, hasSim) {
  const cv = $('#detailChart'); if (!cv) return;
  const l = latest(k);
  const real = realPoints(k);
  const realP = l ? l.p : 0;
  const sim = hasSim ? simSeries(k, realP || 1) : [];
  if (window.Chart && !window.__noChart) {
    if (chartRef) { chartRef.destroy(); chartRef = null; }
    const labels = (hasSim ? sim.map(p => p.d) : real.map(p => p.d)).map(d => d.slice(5));
    chartRef = new Chart(cv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          hasSim ? {
            label: 'Estimación simulada', data: sim.map(p => p.p),
            borderColor: '#5a6b85', borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false, tension: .35,
          } : null,
          {
            label: 'Registros reales',
            data: real.map(p => ({ x: p.d, y: p.p })),
            borderColor: '#ff9e2c', backgroundColor: 'rgba(255,158,44,.18)', borderWidth: 2.5,
            pointRadius: 4, pointBackgroundColor: '#ffd166', pointBorderColor: '#ff9e2c', fill: true, tension: .3,
            spanGaps: true,
          },
        ].filter(Boolean),
      },
      options: {
        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        scales: {
          x: { ticks: { color: '#93a1b5', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { ticks: { color: '#93a1b5', callback: v => '$' + v }, grid: { color: 'rgba(255,255,255,.05)' } },
        },
        plugins: {
          legend: { labels: { color: '#c9d4e4', boxWidth: 14 } },
          tooltip: { callbacks: { title: it => it[0].raw.x, label: it => ` ${it.dataset.label}: ${fmtP(it.raw.y)}` } },
        },
      },
    });
  } else {
    // Fallback sin Chart.js: polilínea simple
    const all = real.map(p => ({ d: p.d, p: p.p }));
    const W = cv.width = cv.parentElement.clientWidth - 28, H = cv.height = 240;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0e14'; ctx.fillRect(0, 0, W, H);
    if (all.length >= 2) {
      const vs = all.map(p => p.p), mn = Math.min(...vs), mx = Math.max(...vs), rg = (mx - mn) || 1;
      ctx.strokeStyle = '#ff9e2c'; ctx.lineWidth = 2; ctx.beginPath();
      all.forEach((p, i) => {
        const x = 20 + (i / (all.length - 1)) * (W - 40), y = 20 + (1 - (p.p - mn) / rg) * (H - 40);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = '#93a1b5'; ctx.font = '13px sans-serif';
      ctx.fillText('Se necesitan 2+ registros para dibujar la gráfica', 20, H / 2);
    }
  }
}
function closeModal() {
  $('#modal').hidden = true;
  if (chartRef) { chartRef.destroy(); chartRef = null; }
  modalKey = null;
  renderAll();
}

// ---------------------------------------------------------------- acciones de colección
function addCard(k, opts) {
  opts = opts || {};
  const psa = opts.psa || null;
  let e = state.col.find(x => x.k === k && (x.psa || null) === psa);
  if (e) e.q += (opts.qty || 1);
  else {
    const r = cardByKey(k);
    let f = null;
    if (r.card && r.card.pr) f = r.card.pr.N ? 'N' : 'H';
    e = { id: uid(), k, q: opts.qty || 1, f, psa, added: today() };
    state.col.push(e);
  }
  saveState(1);
  const nm = cardByKey(k);
  toast(`🎒 Añadida${psa ? ' (PSA ' + psa + ')' : ''}: ${esc((nm.card || nm.custom || {}).n || 'carta')}`);
}
function removeCard(id) {
  const i = state.col.findIndex(x => String(x.id) === String(id));
  if (i >= 0) { state.col.splice(i, 1); saveState(1); toast('Carta quitada de la cartera'); }
}
// precio mostrado de una entrada: estimación PSA o último registro real
function entryPrice(e, card) {
  if (e && e.psa && card) return psaEstimate(card, e.psa, rawPriceOf(e.k, card));
  const l = latest(e ? e.k : '');
  return l ? l.p : null;
}
function priceEntryHTML(e, card) {
  if (e && e.psa && card) {
    const est = entryPrice(e, card);
    return `<span class="price">PSA ${e.psa}: ${est != null ? fmtP(est) : '—'}</span>`;
  }
  return priceHTML(e.k);
}

// ---------------------------------------------------------------- render global + eventos
function renderAll() {
  renderCollection();
  renderCatalogPanel();
  renderCustomList();
}

function bindEvents() {
  // tabs
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === b));
    $$('.view').forEach(v => v.hidden = true);
    $('#view-' + b.dataset.view).hidden = false;
    if (b.dataset.view === 'collection') renderCollection();
    if (b.dataset.view === 'catalog') renderCatalogPanel();
  }));
  $$('[data-goto]').forEach(b => b.addEventListener('click', () => $(`.tab[data-view="${b.dataset.goto}"]`).click()));
  // subtabs
  $$('.subtab').forEach(b => b.addEventListener('click', () => {
    $$('.subtab').forEach(x => x.classList.toggle('active', x === b));
    $$('.subview').forEach(v => v.hidden = true);
    $('#subtab-' + b.dataset.subtab).hidden = false;
  }));
  // filtros cartera
  ['#colSearch', '#colSetFilter', '#colRarityFilter', '#colSort'].forEach(s =>
    $(s).addEventListener('input', () => { state.limitCol = 60; renderCollection(); }));
  // filtros catálogo
  ['#catSearch', '#catSetFilter', '#catRarityFilter'].forEach(s =>
    $(s).addEventListener('input', () => { state.limitSearch = 60; renderCatalogPanel(); }));
  ['#allSearch', '#allSetFilter', '#allRarityFilter', '#allTypeFilter'].forEach(s =>
    $(s).addEventListener('input', () => { state.limitAll = 60; renderCatalogPanel(); }));
  $('#btnLoadMore').addEventListener('click', () => { state.limitSearch += 60; renderCatalogPanel(); });
  $('#btnAllLoadMore').addEventListener('click', () => { state.limitAll += 60; renderCatalogPanel(); });

  // clicks globales delegados
  document.body.addEventListener('click', ev => {
    const add = ev.target.closest('[data-add]');
    if (add) { ev.stopPropagation(); addCard(add.dataset.add); renderAll(); if (modalKey) openModal(modalKey); return; }
    const open = ev.target.closest('[data-open]');
    if (open) { openModal(open.dataset.open); return; }
    const delc = ev.target.closest('[data-delcustom]');
    if (delc) {
      const id = delc.dataset.delcustom;
      const c = state.custom.find(x => String(x.id) === String(id));
      if (c && confirm(`¿Borrar la carta personalizada "${c.n}"? Se quitará también de tu cartera.`)) {
        state.custom = state.custom.filter(x => String(x.id) !== String(id));
        state.col = state.col.filter(x => x.k !== 'c' + id);
        delete state.hist['c' + id];
        saveState(7);
        renderAll();
      }
      return;
    }
    // controles de cantidad dentro de tarjetas y del modal
    const act = ev.target.closest('[data-act]');
    if (act) {
      ev.stopPropagation();
      const eid = act.dataset.eid;
      const k = act.closest('[data-k]') ? act.closest('[data-k]').dataset.k : modalKey;
      const entry = eid ? state.col.find(x => String(x.id) === String(eid))
                        : state.col.find(x => x.k === k && !x.psa) || state.col.find(x => x.k === k);
      if (act.dataset.act === 'inc') { if (entry) { entry.q++; saveState(1); } else if (k) addCard(k); }
      if (act.dataset.act === 'dec') {
        if (entry && entry.q > 1) { entry.q--; saveState(1); } else if (entry) removeCard(entry.id);
      }
      if (act.dataset.act === 'del') {
        if (entry && confirm('¿Quitar esta carta de tu cartera?')) removeCard(entry.id);
      }
      renderAll();
      if (modalKey && !$('#modal').hidden) { const mk = modalKey; closeModal(); openModal(mk); }
      return;
    }
    // tarjeta de cartera → modal
    const cc = ev.target.closest('.fw-card[data-k]');
    if (cc && !ev.target.closest('[data-act]')) openModal(cc.dataset.k);
  });

  // modal
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', ev => { if (ev.target === $('#modal')) closeModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  // calculadora PSA: elegir nota y guardar versión gradeada
  $('#modalBody').addEventListener('click', ev => {
    const chip = ev.target.closest('[data-psa]');
    if (chip) {
      psaSel = parseFloat(chip.dataset.psa) || 10;
      if (modalKey) openModal(modalKey);   // re-render sin cerrar: conserva la nota elegida
      return;
    }
    if (ev.target.id === 'btnSavePsa' && modalKey) {
      addCard(modalKey, { psa: psaSel });
      const mk = modalKey; closeModal(); openModal(mk);
    }
  });
  $('#modalBody').addEventListener('change', ev => {
    if (ev.target.id === 'finishSel') {
      const e = state.col.find(x => x.k === modalKey);
      if (e) { e.f = ev.target.value; saveState(1); toast('Acabado: ' + (e.f === 'H' ? 'Holo' : 'Normal')); }
    }
  });

  // carta personalizada
  $('#customForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const c = {
      id: Date.now(),
      n: fd.get('n').trim(),
      set: fd.get('set').trim(),
      c: fd.get('c').trim(),
      r: fd.get('r'),
      o: fd.get('o').trim(),
      notes: fd.get('notes').trim(),
      created: today(),
    };
    state.custom.push(c);
    saveState(4);
    const k = 'c' + c.id;
    const p0 = parseFloat(fd.get('p0'));
    if (p0 > 0) addPoint(k, p0, 'manual', today());
    addCard(k, { qty: Math.max(1, parseInt(fd.get('q')) || 1) });
    ev.target.reset();
    renderAll();
  });

  // ajustes
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'fusion-world-collector', user: state.user || 'invitado', exportedAt: new Date().toISOString(), col: state.col, hist: state.hist, custom: state.custom }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cartera-fusion-world-${today()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('#fileImport').addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (!j.col) throw 0;
        state.col = j.col; state.hist = j.hist || {}; state.custom = j.custom || [];
        saveState(7);
        renderAll(); toast('✅ Copia importada');
      } catch (e) { toast('Archivo no válido'); }
    };
    rd.readAsText(f);
    ev.target.value = '';
  });
  $('#btnSyncNow').addEventListener('click', checkNewPrices);
  $('#btnWipe').addEventListener('click', () => {
    const who = state.user ? `la cuenta "${state.user}"` : 'el modo invitado';
    if (confirm(`¿Seguro? Se borrarán cartera, historial de precios y cartas personalizadas de ${who} en este navegador. La copia en otras cuentas no se toca.`)) {
      ['col', 'hist', 'custom'].forEach(n => localStorage.removeItem(K(n)));
      location.reload();
    }
  });

  // moneda
  $('#curToggle').addEventListener('click', () => setCurrency(window.__CUR.cur === 'EUR' ? 'USD' : 'EUR'));
  $('#curUSD').addEventListener('click', () => setCurrency('USD'));
  $('#curEUR').addEventListener('click', () => setCurrency('EUR'));
  $('#curFetch').addEventListener('click', () => fetchRate(true));

  // escáner
  $('#btnCamStart').addEventListener('click', () => window.FWScan.startCamera());
  $('#btnCamShot').addEventListener('click', () => window.FWScan.capture());
  $('#fileScan').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) window.FWScan.ocrFile(f); ev.target.value = ''; });
  $('#fileScanMulti').addEventListener('change', ev => { const fs = Array.from(ev.target.files); if (fs.length) window.FWScan.ocrFiles(fs); ev.target.value = ''; });
  $('#btnManualCode').addEventListener('click', () => {
    const v = $('#manualCode').value.trim().toUpperCase();
    if (v) window.FWApp.showScanResults([v]);
  });
  $('#manualCode').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('#btnManualCode').click(); });
}

// ---------------------------------------------------------------- arranque
function init() {
  $('#dbInfo').textContent = `${CARDS.length.toLocaleString('es-ES')} productos (cartas + cajas y sobres) · ${SETS.length} líneas · precios del ${DATA.generated}`;
  $('#dataGenDate').textContent = DATA.generated;
  $('#setCountInfo').textContent = SETS.length;
  $('#cardCountInfo').textContent = CARDS.length.toLocaleString('es-ES');
  fillFilters();
  bindEvents();
  bindAuth();
  window.FWScan.initUI();
  updateCurButtons();
  maybeFetchRate();
  const sess = load(SESSION_KEY, null);
  if (sess && getAccounts()[sess]) enterApp(sess);
  else showAuth();
}
window.FWApp = {
  showScanResults: (codes, opts) => {
    const box = $('#scanResults');
    const hitsOnly = !!(opts && opts.hitsOnly);
    if (hitsOnly) codes = codes.filter(c => window.FW_APP_INDEX.exact.has(c));
    if (!codes.length) {
      box.innerHTML = `<p class="muted">❓ No se detectó ningún código en esa foto. Consejos para que funcione:
        <ul style="margin:6px 0 0 18px;text-align:left">
          <li>Haz la foto <b>cerca</b>, centrando la <b>parte inferior de la carta</b> (ahí está el código, p. ej. FB01-001)</li>
          <li>Con <b>buena luz</b> y sin reflejos, y con la carta recta (no girada ni tumbada)</li>
          <li>Espera a que la imagen esté bien enfocada antes de capturar</li>
          <li>¿Muchas cartas? Usa «Subir foto de varias cartas» con la parte inferior visible</li>
        </ul>
        Mientras tanto puedes <b>escribir el código a mano</b> aquí abajo — funciona igual.</p>`;
      return;
    }
    const counts = {};
    codes.forEach(c => counts[c] = (counts[c] || 0) + 1);
    const uniq = Object.keys(counts);
    box.innerHTML = `<p class="muted">Códigos detectados: <b>${uniq.map(c => esc(c) + (counts[c] > 1 ? ` ×${counts[c]}` : '')).join(', ')}</b></p>` +
      uniq.map(code => {
        const cands = byNumber.get(code);
        if (!cands || !cands.length) {
          return `<div class="scan-cand"><div class="ph" style="font-size:26px">❓</div>
            <div class="meta"><div class="nm">${esc(code)} — no está en el catálogo</div>
            <div class="muted">¿Promo local o carta no registrada? Créala como <b>carta personalizada</b>.</div></div>
            <button class="btn small" onclick="document.querySelector('[data-subtab=custom]').click();document.getElementById('customForm').c.value='${esc(code)}'">Crear personalizada</button></div>`;
        }
        return cands.slice(0, 4).map((c, i) => {
          const l = latest('t' + c.i);
          return `<div class="scan-cand">${i === 0 ? `<img src="${img(c.i)}" onerror="this.style.display='none'">` : '<div style="width:64px"></div>'}
            <div class="meta"><div class="nm">${esc(c.n)}</div>
            <div class="muted">${esc(c.c)} · ${esc(setName(c.g))} · ${esc(rarityLabel(c.r))} ${i === 0 && counts[code] > 1 ? `· detectada ×${counts[code]}` : ''}</div></div>
            <span class="price" style="color:var(--gold)">${l ? fmtP(l.p) : ''}</span>
            <button class="btn small primary" data-add="t${c.i}">＋ Añadir${i === 0 && counts[code] > 1 ? ` ×${counts[code]}` : ''}</button></div>`;
        }).join('');
      }).join('');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  setStatus: (msg, spin) => {
    const el = $('#ocrStatus');
    el.hidden = !msg;
    el.innerHTML = spin ? `<span class="spin"></span>${esc(msg)}` : msg;
  },
};
document.addEventListener('DOMContentLoaded', init);
})();
