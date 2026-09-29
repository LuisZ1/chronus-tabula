/* Chronus Tabula — nucleo.js
   Estado global, constantes, preferencias y utilidades básicas.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* Mapa Mundi Anual — visor de fronteras históricas.
   Datos de fronteras: aourednik/historical-basemaps (GeoJSON por año, en data/geojson).
   Datos curados (gobernantes, población, conflictos, batallas, eventos): data/historia.json. */

const state = {
	years: [], // años con datos, ordenados
	shownYear: null, // snapshot actualmente dibujado
	colorYear: null, // año del mapa cuyos colores (data/colores.json) se aplican
	requestedYear: 1492, // año exacto elegido por el usuario (no el del snapshot)
	layer: null, // capa GeoJSON activa
	cache: new Map(), // año -> GeoJSON (máx. CACHE_MAX entradas)
	loadToken: 0, // para descartar cargas obsoletas
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
	areaByName: new Map(), // NAME -> km² estimados (año mostrado)
	legendData: [], // entidades del año por superficie
	follow: null, // entrada de 'paises' que se sigue, o null
	playTimer: null
};
const CACHE_MAX = 6;
const INITIAL_YEAR = 1492;
const MAX_YEAR = 2026; // último año navegable (conflictos y eventos actuales)
let LAST_MAP_YEAR = 2011; // último mapa de fronteras disponible (se lee de data/years.json al
// arrancar): los años posteriores reutilizan ese mapa y la barra dice de qué año son las fronteras
const DEG2_TO_KM2 = 111.195 * 111.195; // 1º×1º en el ecuador ≈ 12364 km²
let map;

/* Preferencias de capas (persisten en el navegador) */
const prefs = {
	batallas: true,
	eventos: true,
	zonas: true,
	nombres: true,
	escudos: true, // mostrar emblema junto al nombre
	emblema: 'escudo', // cuál: 'escudo' (P94) o 'bandera' (P41), uno u otro
	relleno: true,
	territorios: true,
	territorial: false, // al seguir un reino, incluir sus antecesores territoriales
	margen: 0
};
try {
	const saved = JSON.parse(localStorage.getItem('mapamundi.prefs') || '{}');
	Object.assign(prefs, saved);
} catch (e) {
	/* sin almacenamiento */
}
function savePrefs() {
	try {
		localStorage.setItem('mapamundi.prefs', JSON.stringify(prefs));
	} catch (e) {}
}

/* ---------- utilidades ---------- */

function escHtml(s) {
	return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/* Mapa que se muestra para un año pedido: el ÚLTIMO mapa disponible no
   posterior a ese año (state.years está ordenado). Un mapa fechado en Y
   retrata la situación de Y, que se mantiene hasta la siguiente instantánea;
   elegir el «más cercano» anticipaba hechos aún no ocurridos (en 1942 salía
   la Alemania dividida del mapa de 1945, en 1493 la América del de 1500). Para
   años anteriores al primer mapa se usa el primero. */
function nearestYear(y) {
	let best = state.years[0];
	for (const yr of state.years) {
		if (yr <= y) best = yr;
		else break;
	}
	return best;
}

function fileForYear(y) {
	if (y > LAST_MAP_YEAR) y = LAST_MAP_YEAR; // aún no hay mapas posteriores
	return y < 0 ? `data/geojson/world_bc${-y}.geojson` : `data/geojson/world_${y}.geojson`;
}

/* tintas del mapa mural (css/marca.css): ocho colores planos de lámina, cada uno
   en dos tonos (índices i e i+8), repartidos por hash del nombre. Así una entidad
   conserva su color en todos los años. Para que dos vecinas no coincidan,
   api/colorear.py genera data/colores.json con las excepciones de cada mapa
   ({año: {clave: índice}}), que se cargan al arrancar (js/arranque.js). */
const TINTAS_MAPA = [
	'#eaa39b', '#f1d06e', '#a9d18e', '#f2b27a', '#bda6d8', '#9cc7e0', '#d8b48a', '#b3d3c1',
	'#df8f86', '#e6bf52', '#93c077', '#e89e5f', '#a78fc9', '#84b5d3', '#c9a072', '#98c2ab'
];
let COLORES = {}; // año de mapa -> { clave: índice en TINTAS_MAPA } (data/colores.json)
function colorFor(name, anio = state.colorYear) {
	const exc = COLORES[anio];
	if (exc && Object.prototype.hasOwnProperty.call(exc, name)) return TINTAS_MAPA[exc[name]];
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return TINTAS_MAPA[h % TINTAS_MAPA.length];
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
		lat: parseFloat(p[1]),
		lng: parseFloat(p[2]),
		zoom: parseFloat(p[3]),
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

/* ---------- movimiento reducido: la cámara salta al destino, sin vuelo ----------
   flyTo / fitBounds animados desplazan todo el mapa (el mayor movimiento de la
   app); con prefers-reduced-motion se sustituyen por un salto directo. */
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
function menosMovimiento() {
	return mqReduce.matches;
}
function encuadrar(bounds, opts) {
	map.fitBounds(bounds, { ...opts, animate: !menosMovimiento() });
}
function volarA(latlng, zoom) {
	if (menosMovimiento()) map.setView(latlng, zoom, { animate: false });
	else map.flyTo(latlng, zoom);
}
