/* Chronus Tabula — nucleo.js
   Estado global, constantes, preferencias y utilidades básicas.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* Mapa Mundi Anual — visor de fronteras históricas.
   Datos de fronteras: aourednik/historical-basemaps (GeoJSON por año, en data/geojson).
   Datos curados (gobernantes, población, conflictos, batallas, eventos): data/historia.json. */

const state = {
	years: [], // años con datos, ordenados
	shownYear: null, // snapshot actualmente dibujado
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
const LAST_MAP_YEAR = 2010; // último mapa de fronteras disponible: los años
// posteriores reutilizan el mapa de 2010
const DEG2_TO_KM2 = 111.195 * 111.195; // 1º×1º en el ecuador ≈ 12364 km²
let map;

/* Preferencias de capas (persisten en el navegador) */
const prefs = {
	batallas: true,
	eventos: true,
	zonas: true,
	nombres: true,
	escudos: true,
	relleno: true,
	territorios: true,
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

function nearestYear(y) {
	let best = state.years[0],
		d = Infinity;
	for (const yr of state.years) {
		const dd = Math.abs(yr - y);
		if (dd < d) {
			d = dd;
			best = yr;
		}
	}
	return best;
}

function fileForYear(y) {
	if (y > LAST_MAP_YEAR) y = LAST_MAP_YEAR; // aún no hay mapas posteriores
	return y < 0 ? `data/geojson/world_bc${-y}.geojson` : `data/geojson/world_${y}.geojson`;
}

/* Color estable por entidad soberana: el mismo reino conserva su color
   en todos los años. Hash del nombre -> tono HSL. */
function colorFor(name) {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	const hue = h % 360;
	const light = 52 + (h % 17); // 52–68 %
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
