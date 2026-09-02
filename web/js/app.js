/* Mapa Mundi Anual — visor de fronteras históricas.
   Datos de fronteras: aourednik/historical-basemaps (GeoJSON por año, en data/geojson).
   Datos curados (gobernantes, población, conflictos, batallas, eventos): data/historia.json. */

const state = {
  years: [],           // años con datos, ordenados
  shownYear: null,     // snapshot actualmente dibujado
  requestedYear: 1492, // año exacto elegido por el usuario (no el del snapshot)
  layer: null,         // capa GeoJSON activa
  cache: new Map(),    // año -> GeoJSON (máx. CACHE_MAX entradas)
  loadToken: 0,        // para descartar cargas obsoletas
  labelLayer: null,
  battleLayer: null,
  eventLayer: null,
  territoryLayer: null,
  lastTerrYear: null,
  warLayer: null,
  lastWarYear: null,
  labelData: null,
  lastBattleYear: null,
  lastEventYear: null,
  areaByName: new Map(),   // NAME -> km² estimados (año mostrado)
  legendData: [],          // entidades del año por superficie
  follow: null,            // entrada de 'paises' que se sigue, o null
  playTimer: null
};
const CACHE_MAX = 6;
const INITIAL_YEAR = 1492;
const MAX_YEAR = 2026;       // último año navegable (conflictos y eventos actuales)
const LAST_MAP_YEAR = 2010;  // último mapa de fronteras disponible: los años
                             // posteriores reutilizan el mapa de 2010
const DEG2_TO_KM2 = 111.195 * 111.195; // 1º×1º en el ecuador ≈ 12364 km²
let map;

/* Preferencias de capas (persisten en el navegador) */
const prefs = { batallas: true, eventos: true, zonas: true, nombres: true, escudos: true, relleno: true, territorios: true, margen: 0 };
try {
  const saved = JSON.parse(localStorage.getItem('mapamundi.prefs') || '{}');
  Object.assign(prefs, saved);
} catch (e) { /* sin almacenamiento */ }
function savePrefs() {
  try { localStorage.setItem('mapamundi.prefs', JSON.stringify(prefs)); } catch (e) {}
}

/* ---------- utilidades ---------- */

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function nearestYear(y) {
  let best = state.years[0], d = Infinity;
  for (const yr of state.years) {
    const dd = Math.abs(yr - y);
    if (dd < d) { d = dd; best = yr; }
  }
  return best;
}

function fileForYear(y) {
  if (y > LAST_MAP_YEAR) y = LAST_MAP_YEAR;   // aún no hay mapas posteriores
  return y < 0 ? `data/geojson/world_bc${-y}.geojson` : `data/geojson/world_${y}.geojson`;
}

/* Color estable por entidad soberana: el mismo reino conserva su color
   en todos los años. Hash del nombre -> tono HSL. */
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const light = 52 + (h % 17);          // 52–68 %
  return `hsl(${hue}, 62%, ${light}%)`;
}

function setLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
}

function fmtKm2(km2) {
  const v = Math.round(km2);
  return '~' + v.toLocaleString(i18n.lang) + ' km²';
}

/* ---------- URL compartible (#año/lat/lng/zoom/seguirId) ---------- */

let hashApplying = false;

function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const p = h.split('/');
  const y = parseInt(p[0], 10);
  if (isNaN(y)) return null;
  return {
    year: Math.max(-123000, Math.min(MAX_YEAR, y)),
    lat: parseFloat(p[1]), lng: parseFloat(p[2]), zoom: parseFloat(p[3]),
    follow: p[4] || null
  };
}

function writeHash() {
  if (hashApplying || !map) return;
  const c = map.getCenter();
  const parts = [state.requestedYear, c.lat.toFixed(2), c.lng.toFixed(2), map.getZoom()];
  if (state.follow) parts.push(state.follow.id);
  history.replaceState(null, '', '#' + parts.join('/'));
}

/* ---------- historia.json: gobernantes, población, conflictos, eventos ---------- */

let historia = null;                 // contenido de data/historia.json
const paisPorNombre = new Map();     // nombre del GeoJSON -> entrada de 'paises'
const paisPorId = new Map();

async function loadHistoria() {
  try {
    // no-cache: revalidar siempre, para que los datos recién editados/exportados
    // aparezcan al recargar sin necesidad de vaciar la caché del navegador
    historia = await (await fetch('data/historia.json', { cache: 'no-cache' })).json();
    for (const p of historia.paises || []) {
      paisPorId.set(p.id, p);
      for (const n of p.nombres || []) paisPorNombre.set(n, p);
    }
  } catch (e) {
    console.warn('No se pudo cargar data/historia.json', e);
    historia = { paises: [], conflictos: [], eventos: [], territorios: [] };
  }
}

function paisFor(props) {
  return paisPorNombre.get(props.NAME) || paisPorNombre.get(props.SUBJECTO) || null;
}

function gobernanteEn(pais, y) {
  if (!pais || !pais.gobernantes) return [];
  return pais.gobernantes.filter(g => g.desde <= y && y <= g.hasta);
}

function poblacionCercana(pais, y) {
  if (!pais || !pais.poblacion || !pais.poblacion.length) return null;
  let best = null;
  for (const p of pais.poblacion) {
    if (!best || Math.abs(p.anio - y) < Math.abs(best.anio - y)) best = p;
  }
  return best;
}

/* ---------- seguimiento de una entidad ---------- */

function isFollowed(props) {
  if (!state.follow) return false;
  const n = state.follow.nombres;
  return n.includes(props.NAME) || n.includes(props.SUBJECTO);
}

function setFollow(pais) {
  state.follow = pais || null;
  const input = document.getElementById('followInput');
  const clear = document.getElementById('followClear');
  if (pais) { input.value = pais.nombre || pais.id; clear.hidden = false; }
  else { input.value = ''; clear.hidden = true; }
  if (state.layer) state.layer.setStyle(featureStyle);
  if (historia) { buildTimeMarks(); updateYearPanel(); }
  writeHash();
}

function fillFollowDatalist() {
  const dl = document.getElementById('entidadesList');
  dl.innerHTML = '';
  for (const p of (historia.paises || [])) {
    const o = document.createElement('option');
    o.value = p.nombre || p.id;
    dl.appendChild(o);
  }
}

/* ---------- estilo de los territorios ---------- */

function featureStyle(f) {
  const key = f.properties.SUBJECTO || f.properties.NAME || '?';
  const followed = isFollowed(f.properties);
  let fillOpacity;
  if (state.follow) fillOpacity = followed ? 0.75 : (prefs.relleno ? 0.10 : 0);
  else fillOpacity = prefs.relleno ? 0.55 : 0;
  return {
    color: followed ? '#b3261e' : '#4a4a4a',
    weight: followed ? 2 : 0.5,
    fillColor: colorFor(key),
    fillOpacity
  };
}

/* pie de fuentes de una ficha: plegado, se despliega solo si el lector lo pide */
function fuentesHtml(reg) {
  const fs = reg && reg.fuentes;
  if (!fs || !fs.length) return '';
  const links = fs.map(f => {
    const label = escHtml(f.id || f.url || '?');
    return f.url ? `<a href="${escHtml(f.url)}" target="_blank" rel="noopener">${label}</a>` : label;
  }).join('<br>');
  return `<details class="fuentes"><summary>${i18n.t('popup.sources')} (${fs.length})</summary><div>${links}</div></details>`;
}

/* ---------- popup de territorio ---------- */

function popupHtml(props) {
  const esc = escHtml;
  const y = state.requestedYear;
  const pais = paisFor(props);
  const name = (pais && pais.nombre) || props.NAME || i18n.t('popup.unknown');
  let rows = '';

  for (const g of gobernanteEn(pais, y)) {
    rows += `<tr><td>${i18n.t('popup.ruler')}</td><td><strong>${esc(g.nombre)}</strong>${g.titulo ? '<br><em>' + esc(g.titulo) + '</em>' : ''}</td></tr>`;
  }
  const pop = poblacionCercana(pais, y);
  if (pop) {
    rows += `<tr><td>${i18n.t('popup.population')}</td><td>~${pop.valor.toLocaleString(i18n.lang)} (${i18n.t('popup.popData')} ${i18n.formatYear(pop.anio)})</td></tr>`;
  }
  const area = state.areaByName.get(props.NAME);
  if (area && area > 500) {
    rows += `<tr><td>${i18n.t('popup.area')}</td><td>${fmtKm2(area)}</td></tr>`;
  }

  if (props.NAME && pais && pais.nombre && pais.nombre !== props.NAME)
    rows += `<tr><td>${i18n.t('popup.originalName')}</td><td>${esc(props.NAME)}</td></tr>`;
  if (props.SUBJECTO && props.SUBJECTO !== props.NAME)
    rows += `<tr><td>${i18n.t('popup.sovereign')}</td><td>${esc(props.SUBJECTO)}</td></tr>`;
  if (props.PARTOF && props.PARTOF !== props.NAME && props.PARTOF !== props.SUBJECTO)
    rows += `<tr><td>${i18n.t('popup.partof')}</td><td>${esc(props.PARTOF)}</td></tr>`;
  if (props.wikipedia) {
    const url = /^https?:/.test(props.wikipedia) ? props.wikipedia
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(props.wikipedia)}`;
    rows += `<tr><td>${i18n.t('popup.wikipedia')}</td><td><a href="${esc(url)}" target="_blank" rel="noopener">↗</a></td></tr>`;
  }

  // título para el extracto de Wikipedia: preferimos el nombre curado en español
  let wikiRef = '';
  if (pais) wikiRef = 'es:' + (pais.wiki || pais.nombre);
  else if (props.wikipedia && !/^https?:/.test(props.wikipedia)) wikiRef = 'en:' + props.wikipedia;

  return `<div class="territory-popup" data-wiki="${esc(wikiRef)}"><h3>${esc(name)}</h3><table>${rows}</table>${fuentesHtml(pais)}</div>`;
}

/* ---------- extracto de Wikipedia en los popups ---------- */

const wikiCache = new Map();

async function fetchWikiSummary(ref) {
  if (wikiCache.has(ref)) return wikiCache.get(ref);
  let stored = null;
  try { stored = localStorage.getItem('mapamundi.wiki.' + ref); } catch (e) {}
  if (stored) {
    const v = stored === 'none' ? null : JSON.parse(stored);
    wikiCache.set(ref, v);
    return v;
  }
  const [lang, ...rest] = ref.split(':');
  const title = rest.join(':');
  let result = null;
  try {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
    if (r.ok) {
      const j = await r.json();
      if (j.extract) {
        result = {
          e: j.extract.length > 480 ? j.extract.slice(0, 480) + '…' : j.extract,
          t: (j.thumbnail && j.thumbnail.source) || null,
          u: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || null
        };
      }
    }
  } catch (e) { /* sin red: sin extracto */ }
  wikiCache.set(ref, result);
  try { localStorage.setItem('mapamundi.wiki.' + ref, result ? JSON.stringify(result) : 'none'); } catch (e) {}
  return result;
}

function setupWikiOnPopup() {
  map.on('popupopen', async e => {
    const el = e.popup.getElement();
    if (!el) return;
    const box = el.querySelector('[data-wiki]');
    if (!box || !box.dataset.wiki || box.querySelector('.wiki-extract')) return;
    const ref = box.dataset.wiki;
    const info = await fetchWikiSummary(ref);
    if (!info || box.querySelector('.wiki-extract')) return;
    const div = document.createElement('div');
    div.className = 'wiki-extract';
    div.innerHTML = `${info.t ? `<img src="${escHtml(info.t)}" alt="">` : ''}<p>${escHtml(info.e)}${info.u ? ` <a href="${escHtml(info.u)}" target="_blank" rel="noopener">${i18n.t('wiki.more')}</a>` : ''}</p><div class="wiki-src">${i18n.t('wiki.source')}</div>`;
    box.appendChild(div);
    e.popup.update();
  });
}

/* ---------- zonas de conflicto (franjas rojas diagonales) ---------- */

let warRenderer = null;

function ensureStripePattern() {
  if (!warRenderer || !warRenderer._container) return;
  const svg = warRenderer._container;
  if (svg.querySelector('#warstripes')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<pattern id="warstripes" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">' +
    '<rect width="12" height="12" fill="rgba(150,30,25,0.16)"></rect>' +
    '<rect width="5" height="12" fill="rgba(200,35,30,0.55)"></rect>' +
    '</pattern>';
  svg.insertBefore(defs, svg.firstChild);
}

/* --- recorte de zonas contra la tierra firme (Natural Earth 50M) --- */

let landPolys = null;      // [{poly: MultiPolygon-part, bbox: [minLng, minLat, maxLng, maxLat]}]
let landLoading = null;
const clipCache = new Map(); // "conflictoId|índice" -> latlngs recortados (o null si sin tierra)

function ensureLand() {
  if (landPolys) return Promise.resolve();
  if (!landLoading) {
    landLoading = fetch('data/land.geojson')
      .then(r => r.json())
      .then(gj => {
        landPolys = [];
        for (const f of gj.features) {
          const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
          for (const poly of polys) {
            let minX = 180, minY = 90, maxX = -180, maxY = -90;
            for (const pt of poly[0]) {
              if (pt[0] < minX) minX = pt[0];
              if (pt[0] > maxX) maxX = pt[0];
              if (pt[1] < minY) minY = pt[1];
              if (pt[1] > maxY) maxY = pt[1];
            }
            landPolys.push({ poly, bbox: [minX, minY, maxX, maxY] });
          }
        }
      })
      .catch(e => { console.warn('Sin máscara de tierra; zonas sin recortar', e); landPolys = []; });
  }
  return landLoading;
}

/* Recorta el polígono de una zona ([lat,lng]...) contra la costa.
   Devuelve latlngs listos para L.polygon (multipolígono) o null si no queda tierra. */
function clipZoneToLand(cacheKey, latlngRing) {
  if (clipCache.has(cacheKey)) return clipCache.get(cacheKey);
  let result = [latlngRing]; // sin recorte, tal cual
  try {
    if (landPolys && landPolys.length && typeof polygonClipping !== 'undefined') {
      const ring = latlngRing.map(p => [p[1], p[0]]);
      ring.push(ring[0]);
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const pt of ring) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      const candidates = landPolys
        .filter(l => l.bbox[0] <= maxX && l.bbox[2] >= minX && l.bbox[1] <= maxY && l.bbox[3] >= minY)
        .map(l => l.poly);
      if (candidates.length) {
        const inter = polygonClipping.intersection([ring], candidates);
        result = inter && inter.length
          ? inter.map(poly => poly.map(r => r.map(pt => [pt[1], pt[0]])))
          : null; // la zona no toca tierra
      } else {
        result = null;
      }
    }
  } catch (e) {
    console.warn('Fallo recortando zona', cacheKey, e);
    result = [latlngRing];
  }
  clipCache.set(cacheKey, result);
  return result;
}

function conflictPopupHtml(c, zona) {
  const esc = escHtml;
  let rows = '';
  rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(c.inicio)} – ${i18n.formatYear(c.fin)}</td></tr>`;
  if (zona && zona.nombre)
    rows += `<tr><td>${i18n.t('war.theater')}</td><td>${esc(zona.nombre)}</td></tr>`;
  if (zona && (zona.desde !== undefined || zona.hasta !== undefined)) {
    const zi = zona.desde !== undefined ? zona.desde : c.inicio;
    const zf = zona.hasta !== undefined ? zona.hasta : c.fin;
    rows += `<tr><td>${i18n.t('war.phase')}</td><td>${zi === zf ? i18n.formatYear(zi) : i18n.formatYear(zi) + ' – ' + i18n.formatYear(zf)}</td></tr>`;
  }
  if (zona)
    rows += `<tr><td>${i18n.t('war.type')}</td><td>${i18n.t(zona.tipo === 'ocupado' ? 'war.occupied' : 'war.front')}</td></tr>`;
  if (c.paises && c.paises.length)
    rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${c.paises.map(esc).join(', ')}</td></tr>`;
  if (c.bajas)
    rows += `<tr><td>${i18n.t('battle.casualties')}</td><td>${esc(c.bajas)}</td></tr>`;
  const wikiRef = 'es:' + (c.wiki || c.nombre);
  return `<div class="territory-popup war-popup" data-wiki="${esc(wikiRef)}"><h3>🔥 ${esc(c.nombre)}</h3><table>${rows}</table>${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ''}${fuentesHtml(c)}</div>`;
}

async function updateWarZones() {
  if (!state.warLayer || !historia) return;
  if (state.lastWarYear === state.requestedYear) return;
  state.lastWarYear = state.requestedYear;
  const y = state.requestedYear;
  await ensureLand();
  if (state.lastWarYear !== y) return; // el usuario ya pidió otro año mientras cargaba
  state.warLayer.clearLayers();
  const activas = [];
  for (const c of historia.conflictos || []) {
    if (y < c.inicio || y > c.fin) continue;
    (c.zonas || []).forEach((z, idx) => {
      const zi = z.desde !== undefined ? z.desde : c.inicio;
      const zf = z.hasta !== undefined ? z.hasta : c.fin;
      if (y < zi || y > zf) return;
      activas.push([c, z, idx]);
    });
  }
  // las zonas ocupadas se dibujan primero, debajo de los frentes
  activas.sort((a, b) => (a[1].tipo === 'ocupado' ? 0 : 1) - (b[1].tipo === 'ocupado' ? 0 : 1));
  for (const [c, z, idx] of activas) {
    const latlngs = z.mar ? [z.poligono] : clipZoneToLand(c.id + '|' + idx, z.poligono);
    if (!latlngs) continue; // zona terrestre que no toca tierra: no se pinta
    const occupied = z.tipo === 'ocupado';
    L.polygon(latlngs, occupied ? {
      renderer: warRenderer, pane: 'warzones', className: 'war-occupied',
      color: z.color || '#a04a42', weight: 1.2, dashArray: '3 4',
      fillColor: z.color || '#c0392b', fillOpacity: z.color ? 0.20 : 0.14
    } : {
      renderer: warRenderer, pane: 'warzones', className: 'war-zone',
      color: '#8b1a1a', weight: 2, dashArray: '7 5',
      fillColor: '#c0392b', fillOpacity: 1
    }).bindPopup(() => conflictPopupHtml(c, z), { maxWidth: 340 })
      .addTo(state.warLayer);
  }
  requestAnimationFrame(ensureStripePattern);
}

/* ---------- batallas y eventos ---------- */

function battlePopupHtml(c, b) {
  const esc = escHtml;
  let rows = `<tr><td>${i18n.t('battle.war')}</td><td><strong>${esc(c.nombre)}</strong></td></tr>`;
  rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(c.inicio)} – ${i18n.formatYear(c.fin)}</td></tr>`;
  const bAnios = b.hasta && b.hasta !== b.anio
    ? `${i18n.formatYear(b.anio)} – ${i18n.formatYear(b.hasta)}` : i18n.formatYear(b.anio);
  rows += `<tr><td>${i18n.t('battle.year')}</td><td>${bAnios}</td></tr>`;
  if (c.paises && c.paises.length)
    rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${c.paises.map(esc).join(', ')}</td></tr>`;
  if (b.bajas)
    rows += `<tr><td>${i18n.t('battle.casualtiesBattle')}</td><td>${esc(b.bajas)}</td></tr>`;
  if (c.bajas)
    rows += `<tr><td>${i18n.t('battle.casualties')}</td><td>${esc(c.bajas)}</td></tr>`;
  const desc = [b.descripcion, c.descripcion].filter(Boolean).map(esc).join('<br>');
  const wikiRef = 'es:' + (b.wiki || b.nombre);
  return `<div class="territory-popup battle-popup" data-wiki="${esc(wikiRef)}"><h3>⚔️ ${esc(b.nombre)}</h3><table>${rows}</table>${desc ? `<p>${desc}</p>` : ''}${fuentesHtml(b.fuentes ? b : c)}</div>`;
}

function eventPopupHtml(ev) {
  const esc = escHtml;
  const years = ev.hasta && ev.hasta !== ev.anio
    ? `${i18n.formatYear(ev.anio)} – ${i18n.formatYear(ev.hasta)}` : i18n.formatYear(ev.anio);
  let rows = `<tr><td>${i18n.t('event.year')}</td><td>${years}</td></tr>`;
  if (ev.paises && ev.paises.length)
    rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${ev.paises.map(esc).join(', ')}</td></tr>`;
  const wikiRef = 'es:' + (ev.wiki || ev.nombre);
  const ico = ev.categoria === 'invento' ? '💡' : '⭐';
  return `<div class="territory-popup event-popup" data-wiki="${esc(wikiRef)}"><h3>${ico} ${esc(ev.nombre)}</h3><table>${rows}</table>${ev.descripcion ? `<p>${escHtml(ev.descripcion)}</p>` : ''}${fuentesHtml(ev)}</div>`;
}

/* ---------- territorios menores (Ceuta, Canarias, Azores, Gibraltar…) ---------- */

function paisDeTerritorio(t) {
  const b = normTxt(t.pais || '');
  if (!b) return null;
  const ps = historia.paises || [];
  // coincidencia exacta con el nombre (o con cada parte de un nombre compuesto
  // como «Reino Unido / Gran Bretaña»), luego con nombres del GeoJSON y linaje
  const partes = p => normTxt(p.nombre || '').split('/').map(x => x.trim());
  return ps.find(p => partes(p).includes(b)) ||
         ps.find(p => (p.nombres || []).some(n => normTxt(n) === b)) ||
         ps.find(p => (p.relacionados || []).some(n => normTxt(n) === b)) ||
         null;
}

function territorioPopupHtml(t, color) {
  const esc = escHtml;
  const fin = (t.hasta !== undefined && t.hasta !== null)
    ? i18n.formatYear(t.hasta) : i18n.t('terr.present');
  let rows = `<tr><td>${i18n.t('popup.partof')}</td><td>${esc(t.pais)}</td></tr>`;
  rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(t.desde)} – ${fin}</td></tr>`;
  const wikiRef = 'es:' + (t.wiki || t.nombre);
  return `<div class="territory-popup terr-popup" data-wiki="${esc(wikiRef)}"><h3><span class="terr-dot" style="background:${color}"></span> ${esc(t.nombre)}</h3><table>${rows}</table>${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}${fuentesHtml(t)}</div>`;
}

function updateTerritorios() {
  if (!state.territoryLayer || !historia) return;
  if (state.lastTerrYear === state.requestedYear) return;
  state.lastTerrYear = state.requestedYear;
  state.territoryLayer.clearLayers();
  const y = state.requestedYear;
  for (const t of historia.territorios || []) {
    const fin = (t.hasta !== undefined && t.hasta !== null) ? t.hasta : MAX_YEAR;
    if (y < t.desde || y > fin) continue;
    const p = paisDeTerritorio(t);
    // color del país TAL COMO LO PINTA EL MAPA de este año: el nombre de la
    // entidad cambia entre siglos (Great Britain → United Kingdom…), así que
    // se prefiere el nombre presente en el mapa cargado
    const nombres = (p && p.nombres) || [];
    const enMapa = nombres.find(n => state.areaByName.has(n));
    const color = colorFor(enMapa || nombres[0] || t.pais || t.nombre);
    const icon = L.divIcon({
      html: `<span class="terr-label"><span class="terr-dot" style="background:${color}"></span><span class="terr-name">${escHtml(t.nombre)}</span></span>`,
      className: 'battle-wrap', iconSize: [0, 0], iconAnchor: [0, 0]
    });
    L.marker([t.lat, t.lng], { icon, keyboard: false })
      .bindPopup(() => territorioPopupHtml(t, color), { maxWidth: 340 })
      .addTo(state.territoryLayer);
  }
}

/* con poco zoom, los territorios menores se reducen a su punto de color */
function updateTerrZoom() {
  document.getElementById('map').classList.toggle('terr-mini', map.getZoom() < 4);
}

function updateBattles() {
  if (!state.battleLayer || !historia) return;
  if (state.lastBattleYear === state.requestedYear) return;
  state.lastBattleYear = state.requestedYear;
  state.battleLayer.clearLayers();
  const y = state.requestedYear;
  const m = prefs.margen || 0;   // margen de años elegido en el panel de capas
  for (const c of historia.conflictos || []) {
    if (y < c.inicio - m || y > c.fin + m) continue;
    for (const b of c.batallas || []) {
      // solo en el año (o años) en que se libró, ± el margen elegido
      const bFin = b.hasta !== undefined && b.hasta !== null ? b.hasta : b.anio;
      if (bFin < y - m || b.anio > y + m) continue;
      const icon = L.divIcon({
        html: `<span class="battle-label"><span class="battle-ico">⚔️</span><span>${escHtml(b.nombre)}</span></span>`,
        className: 'battle-wrap', iconSize: [0, 0], iconAnchor: [0, 0]
      });
      L.marker([b.lat, b.lng], { icon, keyboard: false })
        .bindPopup(() => battlePopupHtml(c, b), { maxWidth: 340 })
        .addTo(state.battleLayer);
    }
  }
}

function updateEvents() {
  if (!state.eventLayer || !historia) return;
  if (state.lastEventYear === state.requestedYear) return;
  state.lastEventYear = state.requestedYear;
  state.eventLayer.clearLayers();
  const y = state.requestedYear;
  const m = prefs.margen || 0;
  for (const ev of historia.eventos || []) {
    const fin = ev.hasta !== undefined ? ev.hasta : ev.anio;
    if (fin < y - m || ev.anio > y + m) continue;
    const ico = ev.categoria === 'invento' ? '💡' : '⭐';
    const icon = L.divIcon({
      html: `<span class="event-label"><span class="event-ico">${ico}</span><span>${escHtml(ev.nombre)}</span></span>`,
      className: 'battle-wrap', iconSize: [0, 0], iconAnchor: [0, 0]
    });
    L.marker([ev.lat, ev.lng], { icon, keyboard: false })
      .bindPopup(() => eventPopupHtml(ev), { maxWidth: 340 })
      .addTo(state.eventLayer);
  }
}

/* ---------- etiquetas: nombre del reino + escudo de armas ---------- */

const LABEL_MIN_PX = 3500;   // área proyectada mínima (px²) para etiquetar
const LABEL_MAX = 110;       // máximo de etiquetas simultáneas

function ringAreaCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const x1 = ring[i][0], y1 = ring[i][1], x2 = ring[i + 1][0], y2 = ring[i + 1][1];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-10) return { area: 0, lng: ring[0][0], lat: ring[0][1] };
  return { area: Math.abs(a), lng: cx / (6 * a), lat: cy / (6 * a) };
}

function featureLabelInfo(f) {
  const g = f.geometry;
  if (!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best = null, total = 0;
  for (const poly of polys) {
    if (!poly.length) continue;
    const r = ringAreaCentroid(poly[0]);
    const w = r.area * Math.max(0.15, Math.cos(r.lat * Math.PI / 180));
    total += w;
    if (!best || w > best.w) { best = r; best.w = w; }
  }
  if (!best) return null;
  return { lat: best.lat, lng: best.lng, area: total };
}

/* Recorre los features una vez: datos de etiquetas, superficies y leyenda. */
function analyzeYear(gj) {
  state.labelData = [];
  state.areaByName = new Map();
  const byKey = new Map(); // SUBJECTO||NAME -> {area, bounds}
  for (const f of gj.features) {
    const props = f.properties || {};
    const name = props.NAME;
    const info = featureLabelInfo(f);
    if (!info) continue;
    if (name) {
      state.labelData.push({ name, wiki: props.wikipedia, lat: info.lat, lng: info.lng, area: info.area });
      state.areaByName.set(name, (state.areaByName.get(name) || 0) + info.area * DEG2_TO_KM2);
    }
    const key = props.SUBJECTO || name;
    if (!key) continue;
    let e = byKey.get(key);
    if (!e) { e = { key, area: 0, minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }; byKey.set(key, e); }
    e.area += info.area;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const pt of poly[0]) {
        if (pt[1] < e.minLat) e.minLat = pt[1];
        if (pt[1] > e.maxLat) e.maxLat = pt[1];
        if (pt[0] < e.minLng) e.minLng = pt[0];
        if (pt[0] > e.maxLng) e.maxLng = pt[0];
      }
    }
  }
  state.labelData.sort((a, b) => b.area - a.area);
  state.legendData = [...byKey.values()].sort((a, b) => b.area - a.area);
}

function coaClass(name) {
  return 'coa-' + name.replace(/[^\w]+/g, '_');
}

function makeLabelMarker(d) {
  const esc = escHtml;
  const cached = coaCache.get(d.name);
  const hasUrl = typeof cached === 'string' && cached !== 'none' && cached !== 'pending';
  const img = `<img class="coa-img ${coaClass(d.name)}" alt=""${hasUrl ? ` src="${esc(cached)}"` : ' hidden'}>`;
  const icon = L.divIcon({
    html: `<span class="map-label">${img}<span>${esc(d.name)}</span></span>`,
    className: 'map-label-wrap', iconSize: null
  });
  if (!coaCache.has(d.name)) requestCoA(d);
  return L.marker([d.lat, d.lng], { icon, interactive: false, keyboard: false });
}

function updateLabels() {
  if (!state.labelLayer || !state.labelData) return;
  state.labelLayer.clearLayers();
  const k = Math.pow(256 * Math.pow(2, map.getZoom()) / 360, 2); // px² por grado²
  const bounds = map.getBounds().pad(0.15);
  let count = 0;
  for (const d of state.labelData) {          // ordenados por área desc.
    if (d.area * k < LABEL_MIN_PX) break;
    if (!bounds.contains([d.lat, d.lng])) continue;
    state.labelLayer.addLayer(makeLabelMarker(d));
    if (++count >= LABEL_MAX) break;
  }
}

/* --- escudos de armas (Wikidata P94 -> Wikimedia Commons) --- */

const coaCache = new Map();
const coaQueue = [];
let coaActive = 0;

function requestCoA(d) {
  let stored = null;
  try { stored = localStorage.getItem('mapamundi.coa.' + d.name); } catch (e) {}
  if (stored) {
    coaCache.set(d.name, stored);
    if (stored !== 'none') applyCoA(d.name, stored);
    return;
  }
  coaCache.set(d.name, 'pending');
  coaQueue.push(d);
  pumpCoA();
}

async function pumpCoA() {
  if (coaActive >= 4 || coaQueue.length === 0) return;
  coaActive++;
  const d = coaQueue.shift();
  let url = null;
  try { url = await fetchCoAUrl(d); } catch (e) { /* sin red o sin datos: sin escudo */ }
  coaCache.set(d.name, url || 'none');
  try { localStorage.setItem('mapamundi.coa.' + d.name, url || 'none'); } catch (e) {}
  if (url) applyCoA(d.name, url);
  coaActive--;
  pumpCoA();
}

async function fetchCoAUrl(d) {
  let qid = null;
  if (d.wiki) {
    const title = String(d.wiki).replace(/^[a-z]{2}:/, '');
    const r = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(title))).json();
    const pages = r.query && r.query.pages;
    if (pages) {
      const p = Object.values(pages)[0];
      qid = p && p.pageprops && p.pageprops.wikibase_item;
    }
  }
  if (!qid) {
    const r = await (await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&limit=1&language=en&format=json&origin=*&search=' + encodeURIComponent(d.name))).json();
    qid = r.search && r.search[0] && r.search[0].id;
  }
  if (!qid) return null;
  const c = await (await fetch('https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' + qid + '&property=P94&format=json&origin=*')).json();
  const cl = c.claims && c.claims.P94;
  const file = cl && cl[0] && cl[0].mainsnak && cl[0].mainsnak.datavalue && cl[0].mainsnak.datavalue.value;
  if (!file) return null;
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=48';
}

function applyCoA(name, url) {
  document.querySelectorAll('.coa-img.' + CSS.escape(coaClass(name))).forEach(img => {
    img.src = url;
    img.hidden = false;
  });
}

/* ---------- leyenda del año ---------- */

function updateLegend() {
  const list = document.getElementById('legendList');
  if (!list) return;
  const rows = [];
  const max = 60;
  for (let i = 0; i < state.legendData.length && i < max; i++) {
    const e = state.legendData[i];
    const km2 = e.area * DEG2_TO_KM2;
    if (km2 < 1000) break;
    const pais = paisPorNombre.get(e.key);
    const display = (pais && pais.nombre) || e.key;
    rows.push(`<div class="legend-row" data-i="${i}"><span class="chip" style="background:${colorFor(e.key)}"></span><span class="lname" title="${escHtml(e.key)}">${escHtml(display)}</span><span class="larea">${fmtKm2(km2)}</span></div>`);
  }
  list.innerHTML = rows.join('');
}

function setupLegend() {
  const panel = document.getElementById('legendPanel');
  const btn = document.getElementById('legendToggle');
  let collapsed = false;
  try { collapsed = localStorage.getItem('mapamundi.legend') === 'closed'; } catch (e) {}
  const apply = () => {
    panel.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? '▸' : '▾';
  };
  apply();
  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem('mapamundi.legend', collapsed ? 'closed' : 'open'); } catch (e) {}
    apply();
  });
  document.getElementById('legendList').addEventListener('click', ev => {
    const row = ev.target.closest('.legend-row');
    if (!row) return;
    const e = state.legendData[+row.dataset.i];
    if (!e) return;
    map.fitBounds([[e.minLat, e.minLng], [e.maxLat, e.maxLng]], { maxZoom: 6, padding: [30, 30] });
  });
}

/* ---------- panel «Este año»: conflictos activos y datos de interés ---------- */

function conflictBounds(c) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180, any = false;
  for (const z of c.zonas || []) {
    for (const pt of z.poligono) {
      any = true;
      if (pt[0] < minLat) minLat = pt[0];
      if (pt[0] > maxLat) maxLat = pt[0];
      if (pt[1] < minLng) minLng = pt[1];
      if (pt[1] > maxLng) maxLng = pt[1];
    }
  }
  for (const b of c.batallas || []) {
    any = true;
    if (b.lat < minLat) minLat = b.lat;
    if (b.lat > maxLat) maxLat = b.lat;
    if (b.lng < minLng) minLng = b.lng;
    if (b.lng > maxLng) maxLng = b.lng;
  }
  return any ? [[minLat, minLng], [maxLat, maxLng]] : null;
}

function updateYearPanel() {
  if (!historia) return;
  const y = state.requestedYear;
  const keys = followKeys();
  document.getElementById('ypYear').textContent = i18n.formatYear(y) + (state.follow ? ' · ' + (state.follow.nombre || state.follow.id) : '');

  const wars = (historia.conflictos || []).filter(c => y >= c.inicio && y <= c.fin && warRelevant(c, keys));
  const warsBox = document.getElementById('ypWars');
  warsBox.innerHTML = wars.length ? wars.map(c =>
    `<div class="yp-row" data-war="${escHtml(c.id)}"><span class="yp-ico">⚔️</span><span class="yp-name">${escHtml(c.nombre)}</span><span class="yp-years">${i18n.formatYear(c.inicio)}–${i18n.formatYear(c.fin)}</span></div>`
  ).join('') : `<div class="yp-empty">${i18n.t('panel.none')}</div>`;

  // datos de interés cuyo año «pertenece» al snapshot mostrado
  const facts = (historia.eventos || []).filter(ev => nearestYear(ev.anio) === state.shownYear && eventRelevant(ev, keys));
  const factsBox = document.getElementById('ypFacts');
  factsBox.innerHTML = facts.length ? facts.map((ev, i) =>
    `<div class="yp-row" data-fact="${i}"><span class="yp-ico">${ev.categoria === 'invento' ? '💡' : '⭐'}</span><span class="yp-name">${escHtml(ev.nombre)}</span><span class="yp-years">${i18n.formatYear(ev.anio)}</span></div>`
  ).join('') : `<div class="yp-empty">${i18n.t('panel.none')}</div>`;
  factsBox._facts = facts;
}

function setupYearPanel() {
  const panel = document.getElementById('yearPanel');
  const btn = document.getElementById('yearPanelToggle');
  let collapsed = false;
  try { collapsed = localStorage.getItem('mapamundi.yearpanel') === 'closed'; } catch (e) {}
  const apply = () => {
    panel.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? '▸' : '▾';
  };
  apply();
  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem('mapamundi.yearpanel', collapsed ? 'closed' : 'open'); } catch (e) {}
    apply();
  });

  document.getElementById('ypWars').addEventListener('click', ev => {
    const row = ev.target.closest('.yp-row');
    if (!row) return;
    const c = (historia.conflictos || []).find(x => x.id === row.dataset.war);
    const b = c && conflictBounds(c);
    if (b) map.fitBounds(b, { maxZoom: 6, padding: [40, 40] });
  });

  document.getElementById('ypFacts').addEventListener('click', ev => {
    const row = ev.target.closest('.yp-row');
    if (!row) return;
    const facts = document.getElementById('ypFacts')._facts || [];
    const f = facts[+row.dataset.fact];
    if (!f) return;
    requestYear(f.anio);                       // salta al año exacto del dato
    map.flyTo([f.lat, f.lng], Math.max(map.getZoom(), 5));
    setTimeout(() => {
      L.popup({ maxWidth: 340 }).setLatLng([f.lat, f.lng]).setContent(eventPopupHtml(f)).openOn(map);
    }, 600);
  });
}

/* ---------- carga y dibujo ---------- */

async function loadYearData(y) {
  if (state.cache.has(y)) return state.cache.get(y);
  const res = await fetch(fileForYear(y));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gj = await res.json();
  state.cache.set(y, gj);
  if (state.cache.size > CACHE_MAX) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== y) state.cache.delete(oldest);
  }
  return gj;
}

async function showYear(requestedYear) {
  const snap = nearestYear(requestedYear);
  updateShownLabel(snap);
  if (snap === state.shownYear) return;

  const token = ++state.loadToken;
  setLoading(true);
  try {
    const gj = await loadYearData(snap);
    if (token !== state.loadToken) return; // llegó tarde: el usuario ya pidió otro año

    if (state.layer) map.removeLayer(state.layer);
    state.layer = L.geoJSON(gj, {
      style: featureStyle,
      onEachFeature: (f, layer) => {
        layer.bindPopup(() => popupHtml(f.properties), { maxWidth: 320 });
      }
    }).addTo(map);
    state.shownYear = snap;
    analyzeYear(gj);
    updateLabels();
    updateLegend();
    updateYearPanel();
    state.lastTerrYear = null;   // repintar los puntos con los colores del mapa recién cargado
    updateTerritorios();
  } catch (e) {
    console.error('Error cargando el año', snap, e);
    alertBox(i18n.t('ui.noData'));
  } finally {
    if (token === state.loadToken) setLoading(false);
  }
}

function alertBox(msg) {
  const el = document.getElementById('loading');
  el.classList.remove('hidden');
  el.innerHTML = `<span>⚠️ ${msg}</span>`;
  setTimeout(() => {
    el.classList.add('hidden');
    el.innerHTML = `<div class="spinner"></div><span data-i18n="ui.loading">${i18n.t('ui.loading')}</span>`;
  }, 3000);
}

function updateShownLabel(snap) {
  document.getElementById('shownYear').textContent = i18n.formatYear(snap);
}

/* ---------- escala no lineal de la barra de tiempo ----------
   La barra reparte su ancho por densidad histórica:
   3000 a.C.–500 -> 20 %, 500–1500 -> 30 %, 1500–2026 -> 50 %. */

const TIME_SEGMENTS = [
  { from: -3000, to: 500, w: 200 },
  { from: 500, to: 1500, w: 300 },
  { from: 1500, to: MAX_YEAR, w: 500 }
];
const SLIDER_MAX = 1000;

function yearToPos(y) {
  y = Math.max(TIME_SEGMENTS[0].from, Math.min(TIME_SEGMENTS[TIME_SEGMENTS.length - 1].to, y));
  let acc = 0;
  for (const s of TIME_SEGMENTS) {
    if (y <= s.to) return Math.round(acc + (y - s.from) / (s.to - s.from) * s.w);
    acc += s.w;
  }
  return SLIDER_MAX;
}

function posToYear(p) {
  let acc = 0;
  for (const s of TIME_SEGMENTS) {
    if (p <= acc + s.w) return Math.round(s.from + (p - acc) / s.w * (s.to - s.from));
    acc += s.w;
  }
  return TIME_SEGMENTS[TIME_SEGMENTS.length - 1].to;
}

/* Dos carriles de marcas bajo la barra (conflictos ⚔ y eventos ⭐💡),
   con clústeres cuando las marcas se tocan. Si se sigue un país, solo
   se muestra lo que afecta a su historia. */

let markPop = null;
function closeMarkPop() { if (markPop) { markPop.remove(); markPop = null; } }
document.addEventListener('click', e => {
  if (markPop && !markPop.contains(e.target) && !e.target.closest('.tmark')) closeMarkPop();
}, true);

function markAction(it) {
  closeMarkPop();
  if (it.tipo === 'war') {
    requestYear(it.c.inicio);
    const b = conflictBounds(it.c);
    if (b) map.fitBounds(b, { maxZoom: 6, padding: [40, 40] });
  } else {
    requestYear(it.ev.anio);
    map.flyTo([it.ev.lat, it.ev.lng], Math.max(map.getZoom(), 5));
    setTimeout(() => {
      L.popup({ maxWidth: 340 }).setLatLng([it.ev.lat, it.ev.lng]).setContent(eventPopupHtml(it.ev)).openOn(map);
    }, 600);
  }
}

function buildTimeMarks() {
  const box = document.getElementById('timeMarks');
  if (!box || !historia) return;
  closeMarkPop();
  box.innerHTML = '';
  const keys = followKeys();

  const lanes = [
    { top: 1, items: (historia.conflictos || []).filter(c => c.inicio >= TIME_SEGMENTS[0].from && warRelevant(c, keys))
        .map(c => ({ tipo: 'war', y: c.inicio, y2: c.fin, n: c.nombre, c })) },
    { top: 17, items: (historia.eventos || []).filter(ev => ev.anio >= TIME_SEGMENTS[0].from && eventRelevant(ev, keys))
        .map(ev => ({ tipo: 'event', y: ev.anio, n: ev.nombre, inv: ev.categoria === 'invento', ev })) }
  ];

  const fmt = it => `${it.n} (${i18n.formatYear(it.y)}${it.y2 ? '–' + i18n.formatYear(it.y2) : ''})`;

  for (const lane of lanes) {
    lane.items.sort((a, b) => a.y - b.y);
    // clustering por proximidad en % de la barra
    const groups = [];
    let g = null;
    for (const it of lane.items) {
      const p = yearToPos(it.y) / SLIDER_MAX * 100;
      if (g && p - g.pLast < 1.5) { g.list.push(it); g.pLast = p; g.p = (g.p0 + p) / 2; }
      else { g = { p0: p, pLast: p, p, list: [it] }; groups.push(g); }
    }
    for (const gr of groups) {
      const el = document.createElement('span');
      el.tabIndex = 0;
      if (gr.list.length > 1) {
        el.className = 'tmark tm-cluster ' + (lane.top === 1 ? 'tmc-war' : 'tmc-event');
        el.textContent = gr.list.length;
        el.style.top = (lane.top - 2) + 'px';
        el.title = gr.list.slice(0, 8).map(fmt).join('\n') + (gr.list.length > 8 ? '\n…' : '');
      } else {
        const it = gr.list[0];
        el.className = 'tmark ' + (it.tipo === 'war' ? 'tm-war' : 'tm-event');
        if (it.tipo === 'event') el.textContent = it.inv ? '💡' : '★';
        el.style.top = lane.top + 'px';
        el.title = fmt(it);
      }
      el.style.left = gr.p + '%';
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        if (gr.list.length === 1) { markAction(gr.list[0]); return; }
        closeMarkPop();
        markPop = document.createElement('div');
        markPop.className = 'mark-pop';
        markPop.innerHTML = gr.list.map((it, i) =>
          `<div class="mp-row" data-i="${i}"><span>${it.tipo === 'war' ? '⚔️' : (it.inv ? '💡' : '⭐')}</span><span class="mp-n">${escHtml(it.n)}</span><span class="mp-y">${i18n.formatYear(it.y)}${it.y2 ? '–' + i18n.formatYear(it.y2) : ''}</span></div>`
        ).join('');
        markPop.style.left = Math.min(Math.max(gr.p, 4), 78) + '%';
        box.appendChild(markPop);
        markPop.addEventListener('click', e2 => {
          const r = e2.target.closest('.mp-row');
          if (r) markAction(gr.list[+r.dataset.i]);
        });
      });
      box.appendChild(el);
    }
  }

  // etiquetas de los límites de tramo
  for (const y of [500, 1500]) {
    const el = document.createElement('span');
    el.className = 'tmark tm-limit';
    el.style.left = (yearToPos(y) / SLIDER_MAX * 100) + '%';
    el.textContent = y;
    box.appendChild(el);
  }
}

/* ---------- relevancia histórica/* ---------- relevancia histórica: ¿afecta al país seguido? ---------- */

function normTxt(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function followKeys() {
  if (!state.follow) return null;
  const keys = [state.follow.nombre || state.follow.id, ...(state.follow.relacionados || [])];
  return keys.map(normTxt);
}

/* coincide si algún nombre implicado contiene alguna clave como palabra completa */
function matchesKeys(names, keys) {
  if (!names || !names.length) return false;
  for (const raw of names) {
    const n = normTxt(raw);
    for (const k of keys) {
      if (n === k) return true;
      const re = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
      if (re.test(n)) return true;
    }
  }
  return false;
}

function warRelevant(c, keys) { return !keys || matchesKeys(c.paises, keys); }
function eventRelevant(ev, keys) { return !keys || matchesKeys(ev.paises, keys); }

/* ---------- petición de año (barra, input, play, hash) ---------- */

let yearDebounce;

function requestYear(y, opts = {}) {
  y = Math.max(-123000, Math.min(MAX_YEAR, y));
  if (y === state.requestedYear && !opts.force) return;
  if (!opts.fromPlay) stopPlay();
  state.requestedYear = y;
  const slider = document.getElementById('yearSlider');
  const input = document.getElementById('yearInput');
  input.value = y;
  slider.value = yearToPos(y);
  updateShownLabel(nearestYear(y));
  clearTimeout(yearDebounce);
  yearDebounce = setTimeout(() => {
    showYear(y);
    updateBattles();
    updateEvents();
    updateTerritorios();
    updateWarZones();
    updateYearPanel();
    writeHash();
  }, opts.fromPlay ? 0 : 250);
}

/* ---------- animación temporal ---------- */

function stopPlay() {
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
    document.getElementById('playBtn').textContent = '▶';
  }
}

function startPlay() {
  stopPlay();
  const speed = +document.getElementById('speedSelect').value;
  document.getElementById('playBtn').textContent = '⏸';
  const step = () => {
    const i = state.years.indexOf(nearestYear(state.requestedYear));
    if (i < 0 || i >= state.years.length - 1) { stopPlay(); return; }
    requestYear(state.years[i + 1], { fromPlay: true });
  };
  step();
  state.playTimer = setInterval(step, speed);
}

/* ---------- capas on/off ---------- */

function applyPrefs() {
  const on = (layer, visible) => {
    if (!layer) return;
    if (visible && !map.hasLayer(layer)) layer.addTo(map);
    if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
  };
  on(state.battleLayer, prefs.batallas);
  on(state.warLayer, prefs.zonas);
  on(state.eventLayer, prefs.eventos);
  on(state.territoryLayer, prefs.territorios);
  on(state.labelLayer, prefs.nombres);
  document.getElementById('map').classList.toggle('hide-coa', !prefs.escudos);
  if (state.layer) state.layer.setStyle(featureStyle);
}

function setupLayersPanel() {
  const bind = (id, key) => {
    const cb = document.getElementById(id);
    cb.checked = prefs[key];
    cb.addEventListener('change', () => {
      prefs[key] = cb.checked;
      savePrefs();
      applyPrefs();
    });
  };
  bind('lyBatallas', 'batallas');
  bind('lyZonas', 'zonas');
  bind('lyEventos', 'eventos');
  bind('lyNombres', 'nombres');
  bind('lyEscudos', 'escudos');
  bind('lyRelleno', 'relleno');
  bind('lyTerritorios', 'territorios');
  // margen de años: cuántos años alrededor del elegido se muestran batallas y eventos
  const sel = document.getElementById('margenSelect');
  sel.value = String(prefs.margen || 0);
  sel.addEventListener('change', () => {
    prefs.margen = parseInt(sel.value, 10) || 0;
    savePrefs();
    state.lastBattleYear = state.lastEventYear = null;   // forzar repintado
    updateBattles();
    updateEvents();
  });
}

/* ---------- mapas base (sin API key) ---------- */

let baseLayers = null;
let layersControl = null;

function setupBaseLayers() {
  const hb = ' | <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>';
  baseLayers = {
    neutral: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors' + hb }),
    osm: L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + hb }),
    terrain: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 13, attribution: 'Tiles &copy; Esri &mdash; Source: Esri' + hb })
  };

  // Si la capa neutra falla repetidamente (p. ej. sin acceso a Esri), pasar a OSM.
  let neutralErrors = 0;
  baseLayers.neutral.on('tileerror', () => {
    neutralErrors++;
    if (neutralErrors === 8 && map.hasLayer(baseLayers.neutral)) {
      map.removeLayer(baseLayers.neutral);
      baseLayers.osm.addTo(map);
    }
  });

  baseLayers.neutral.addTo(map);
  refreshLayersControl();
}

/* El control de capas se reconstruye al cambiar de idioma para traducir sus etiquetas. */
function refreshLayersControl() {
  if (layersControl) map.removeControl(layersControl);
  const named = {};
  named[i18n.t('basemap.neutral')] = baseLayers.neutral;
  named[i18n.t('basemap.osm')] = baseLayers.osm;
  named[i18n.t('basemap.terrain')] = baseLayers.terrain;
  layersControl = L.control.layers(named, null, { position: 'topright' }).addTo(map);
}

/* ---------- controles ---------- */

function setupControls() {
  const slider = document.getElementById('yearSlider');
  const input = document.getElementById('yearInput');

  slider.addEventListener('input', () => requestYear(posToYear(+slider.value)));
  input.addEventListener('change', () => requestYear(+input.value || 0));

  document.getElementById('prevYear').addEventListener('click', () => {
    const i = state.years.indexOf(state.shownYear);
    if (i > 0) requestYear(state.years[i - 1]);
  });
  document.getElementById('nextYear').addEventListener('click', () => {
    const i = state.years.indexOf(state.shownYear);
    if (i >= 0 && i < state.years.length - 1) requestYear(state.years[i + 1]);
  });

  document.getElementById('playBtn').addEventListener('click', () => {
    if (state.playTimer) stopPlay(); else startPlay();
  });
  document.getElementById('speedSelect').addEventListener('change', () => {
    if (state.playTimer) startPlay(); // reinicia con la nueva velocidad
  });

  document.getElementById('langSelect').addEventListener('change', e => {
    i18n.setLang(e.target.value).then(() => {
      updateShownLabel(state.shownYear);
      refreshLayersControl();
      updateLegend();
      buildTimeMarks();
      updateYearPanel();
    });
  });

  const followInput = document.getElementById('followInput');
  followInput.addEventListener('change', () => {
    const v = followInput.value.trim().toLowerCase();
    if (!v) { setFollow(null); return; }
    const pais = (historia.paises || []).find(p =>
      (p.nombre || '').toLowerCase() === v || p.id === v ||
      (p.nombres || []).some(n => n.toLowerCase() === v));
    if (pais) setFollow(pais);
  });
  document.getElementById('followClear').addEventListener('click', () => setFollow(null));

  map.on('moveend zoomend', () => { updateLabels(); writeHash(); });
}

/* ---------- arranque ---------- */

async function init() {
  await i18n.init();
  document.getElementById('langSelect').value = i18n.lang;

  state.years = (await (await fetch('data/years.json')).json()).sort((a, b) => a - b);
  // años modernos navegables (reproducción y botones ◀ ▶); usan el mapa de 2010
  for (const vy of [2014, 2020, 2022, MAX_YEAR]) if (!state.years.includes(vy)) state.years.push(vy);
  state.years.sort((a, b) => a - b);

  const h = readHash();
  const startYear = h ? h.year : INITIAL_YEAR;
  const startView = (h && !isNaN(h.lat) && !isNaN(h.lng) && !isNaN(h.zoom))
    ? { center: [h.lat, h.lng], zoom: h.zoom } : { center: [35, 10], zoom: 3 };

  hashApplying = true;
  map = L.map('map', { preferCanvas: true, worldCopyJump: true, minZoom: 2, maxZoom: 12, zoomControl: true })
    .setView(startView.center, startView.zoom);
  hashApplying = false;

  const warPane = map.createPane('warzones');
  warPane.style.zIndex = 450; // sobre los territorios (400), bajo los marcadores (600)
  warRenderer = L.svg({ pane: 'warzones', padding: 0.5 });

  setupBaseLayers();
  state.labelLayer = L.layerGroup();
  state.warLayer = L.layerGroup();
  state.battleLayer = L.layerGroup();
  state.eventLayer = L.layerGroup();
  state.territoryLayer = L.layerGroup();
  map.on('zoomend', updateTerrZoom);
  updateTerrZoom();

  setupControls();
  setupLayersPanel();
  setupLegend();
  setupYearPanel();
  setupWikiOnPopup();

  await loadHistoria();
  fillFollowDatalist();
  buildTimeMarks();
  if (h && h.follow && paisPorId.has(h.follow)) setFollow(paisPorId.get(h.follow));

  state.requestedYear = null; // fuerza la primera petición
  requestYear(startYear, { force: true, fromPlay: true });
  applyPrefs();
  writeHash();
}

init();
