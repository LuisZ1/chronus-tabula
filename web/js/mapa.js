/* Chronus Tabula — mapa.js
   Mapa: estilo de territorios, etiquetas y escudos, análisis del año, carga y dibujo, capas base.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

/* ---------- estilo de los territorios ---------- */

function featureStyle(f) {
	const key = f.properties.SUBJECTO || f.properties.NAME || '?';
	const followed = isFollowed(f.properties);
	let fillOpacity;
	if (state.follow) fillOpacity = followed ? 0.75 : prefs.relleno ? 0.1 : 0;
	else fillOpacity = prefs.relleno ? 0.55 : 0;
	return {
		color: followed ? '#b3261e' : '#4a4a4a',
		weight: followed ? 2 : 0.5,
		fillColor: colorFor(key),
		fillOpacity
	};
}

/* ---------- etiquetas: nombre del reino + escudo de armas ---------- */

const LABEL_MIN_PX = 3500; // área proyectada mínima (px²) para etiquetar
const LABEL_MAX = 110; // máximo de etiquetas simultáneas

function ringAreaCentroid(ring) {
	let a = 0,
		cx = 0,
		cy = 0;
	for (let i = 0, n = ring.length - 1; i < n; i++) {
		const x1 = ring[i][0],
			y1 = ring[i][1],
			x2 = ring[i + 1][0],
			y2 = ring[i + 1][1];
		const f = x1 * y2 - x2 * y1;
		a += f;
		cx += (x1 + x2) * f;
		cy += (y1 + y2) * f;
	}
	a /= 2;
	if (Math.abs(a) < 1e-10) return { area: 0, lng: ring[0][0], lat: ring[0][1] };
	return { area: Math.abs(a), lng: cx / (6 * a), lat: cy / (6 * a) };
}

function featureLabelInfo(f) {
	const g = f.geometry;
	if (!g) return null;
	const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
	let best = null,
		total = 0;
	for (const poly of polys) {
		if (!poly.length) continue;
		const r = ringAreaCentroid(poly[0]);
		const w = r.area * Math.max(0.15, Math.cos((r.lat * Math.PI) / 180));
		total += w;
		if (!best || w > best.w) {
			best = r;
			best.w = w;
		}
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
			const paisF = paisFor(props);
			state.labelData.push({
				name, // nombre del GeoJSON: clave de escudo/superficie (no traducir)
				display: nombreVisible(name, state.shownYear, false), // texto visible (español/época)
				escudoUrl: paisF ? escudoParaAnio(paisF, state.shownYear) : null, // escudo del periodo
				wiki: props.wikipedia,
				lat: info.lat,
				lng: info.lng,
				area: info.area
			});
			state.areaByName.set(name, (state.areaByName.get(name) || 0) + info.area * DEG2_TO_KM2);
		}
		const key = props.SUBJECTO || name;
		if (!key) continue;
		let e = byKey.get(key);
		if (!e) {
			e = { key, area: 0, minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
			byKey.set(key, e);
		}
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
	// escudo del periodo (guardado en la ficha) tiene prioridad; si no, el actual
	// que se descarga en vivo (P94 por nombre) y queda en coaCache.
	let src = d.escudoUrl || null;
	if (!src) {
		const cached = coaCache.get(d.name);
		if (typeof cached === 'string' && cached !== 'none' && cached !== 'pending') src = cached;
	}
	const img = `<img class="coa-img ${coaClass(d.name)}" alt=""${src ? ` src="${esc(src)}"` : ' hidden'}>`;
	const icon = L.divIcon({
		html: `<span class="map-label">${img}<span>${esc(d.display || d.name)}</span></span>`,
		className: 'map-label-wrap',
		iconSize: null
	});
	if (!d.escudoUrl && !coaCache.has(d.name)) requestCoA(d);
	return L.marker([d.lat, d.lng], { icon, interactive: false, keyboard: false });
}

function updateLabels() {
	if (!state.labelLayer || !state.labelData) return;
	state.labelLayer.clearLayers();
	const k = Math.pow((256 * Math.pow(2, map.getZoom())) / 360, 2); // px² por grado²
	const bounds = map.getBounds().pad(0.15);
	let count = 0;
	for (const d of state.labelData) {
		// ordenados por área desc.
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
	try {
		stored = localStorage.getItem('mapamundi.coa.' + d.name);
	} catch (e) {}
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
	try {
		url = await fetchCoAUrl(d);
	} catch (e) {
		/* sin red o sin datos: sin escudo */
	}
	coaCache.set(d.name, url || 'none');
	try {
		localStorage.setItem('mapamundi.coa.' + d.name, url || 'none');
	} catch (e) {}
	if (url) applyCoA(d.name, url);
	coaActive--;
	pumpCoA();
}

async function fetchCoAUrl(d) {
	let qid = null;
	if (d.wiki) {
		const title = String(d.wiki).replace(/^[a-z]{2}:/, '');
		const r = await (
			await fetch(
				'https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&origin=*&titles=' +
					encodeURIComponent(title)
			)
		).json();
		const pages = r.query && r.query.pages;
		if (pages) {
			const p = Object.values(pages)[0];
			qid = p && p.pageprops && p.pageprops.wikibase_item;
		}
	}
	if (!qid) {
		const r = await (
			await fetch(
				'https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&limit=1&language=en&format=json&origin=*&search=' +
					encodeURIComponent(d.name)
			)
		).json();
		qid = r.search && r.search[0] && r.search[0].id;
	}
	if (!qid) return null;
	const c = await (
		await fetch(
			'https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' +
				qid +
				'&property=P94&format=json&origin=*'
		)
	).json();
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
		state.lastTerrYear = null; // repintar los puntos con los colores del mapa recién cargado
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

/* ---------- mapas base (sin API key) ---------- */

let baseLayers = null;
let layersControl = null;

function setupBaseLayers() {
	const hb =
		' | <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>';
	baseLayers = {
		neutral: L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
			{
				maxZoom: 16,
				attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors' + hb
			}
		),
		osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + hb
		}),
		terrain: L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 13, attribution: 'Tiles &copy; Esri &mdash; Source: Esri' + hb }
		)
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
