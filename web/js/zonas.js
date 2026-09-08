/* Chronus Tabula — zonas.js
   Zonas de guerra: franjas diagonales, recorte contra la costa y pintado por fases.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* ---------- zonas de conflicto (franjas rojas diagonales) ---------- */

let warRenderer = null;

function ensureStripePattern() {
	if (!warRenderer || !warRenderer._container) return;
	const svg = warRenderer._container;
	if (svg.querySelector('#warstripes')) return;
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
	defs.innerHTML =
		'<pattern id="warstripes" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">' +
		'<rect width="12" height="12" fill="rgba(150,30,25,0.16)"></rect>' +
		'<rect width="5" height="12" fill="rgba(200,35,30,0.55)"></rect>' +
		'</pattern>';
	svg.insertBefore(defs, svg.firstChild);
}

/* --- recorte de zonas contra la tierra firme (Natural Earth 50M) --- */

let landPolys = null; // [{poly: MultiPolygon-part, bbox: [minLng, minLat, maxLng, maxLat]}]
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
					const polys =
						f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
					for (const poly of polys) {
						let minX = 180,
							minY = 90,
							maxX = -180,
							maxY = -90;
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
			.catch(e => {
				console.warn('Sin máscara de tierra; zonas sin recortar', e);
				landPolys = [];
			});
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
			let minX = 180,
				minY = 90,
				maxX = -180,
				maxY = -90;
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
				result =
					inter && inter.length
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
		L.polygon(
			latlngs,
			occupied
				? {
						renderer: warRenderer,
						pane: 'warzones',
						className: 'war-occupied',
						color: z.color || '#a04a42',
						weight: 1.2,
						dashArray: '3 4',
						fillColor: z.color || '#c0392b',
						fillOpacity: z.color ? 0.2 : 0.14
					}
				: {
						renderer: warRenderer,
						pane: 'warzones',
						className: 'war-zone',
						color: '#8b1a1a',
						weight: 2,
						dashArray: '7 5',
						fillColor: '#c0392b',
						fillOpacity: 1
					}
		)
			.bindPopup(() => conflictPopupHtml(c, z), { maxWidth: 340 })
			.addTo(state.warLayer);
	}
	requestAnimationFrame(ensureStripePattern);
}
