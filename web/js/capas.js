/* Chronus Tabula — capas.js
   Marcadores del año: batallas, eventos y territorios menores.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

/* ---------- territorios menores (Ceuta, Canarias, Azores, Gibraltar…) ---------- */

function paisDeTerritorio(t) {
	const b = normTxt(t.pais || '');
	if (!b) return null;
	const ps = historia.paises || [];
	// coincidencia exacta con el nombre (o con cada parte de un nombre compuesto
	// como «Reino Unido / Gran Bretaña»), luego con nombres del GeoJSON y linaje
	const partes = p =>
		normTxt(p.nombre || '')
			.split('/')
			.map(x => x.trim());
	return (
		ps.find(p => partes(p).includes(b)) ||
		ps.find(p => (p.nombres || []).some(n => normTxt(n) === b)) ||
		ps.find(p => (p.relacionados || []).some(n => normTxt(n) === b)) ||
		null
	);
}

async function updateTerritorios() {
	if (!state.territoryLayer || !historia) return;
	if (state.lastTerrYear === state.requestedYear) return;
	state.lastTerrYear = state.requestedYear;
	const y = state.requestedYear;
	const enRango = (historia.territorios || []).filter(t => {
		const fin = t.hasta !== undefined && t.hasta !== null ? t.hasta : MAX_YEAR;
		return y >= t.desde && y <= fin;
	});
	// si algún territorio dibuja su extensión (polígono), cargar antes el
	// contorno de costas para recortarlo igual que las zonas de guerra
	if (enRango.some(t => t.poligono)) {
		await ensureLand();
		if (state.lastTerrYear !== y) return; // el usuario ya cambió de año
	}
	state.territoryLayer.clearLayers();
	for (const t of enRango) {
		const p = paisDeTerritorio(t);
		// color del país TAL COMO LO PINTA EL MAPA de este año: el nombre de la
		// entidad cambia entre siglos (Great Britain → United Kingdom…), así que
		// se prefiere el nombre presente en el mapa cargado
		const nombres = (p && p.nombres) || [];
		const enMapa = nombres.find(n => state.areaByName.has(n));
		const color = colorFor(enMapa || nombres[0] || t.pais || t.nombre);
		// extensión aproximada: polígono recortado a la costa (para entidades
		// sin frontera propia en los mapas, como Sumeria o las póleis griegas)
		if (t.poligono) {
			const anillos = t.mar ? [t.poligono] : clipZoneToLand('terr|' + t.nombre, t.poligono);
			if (anillos) {
				L.polygon(anillos, {
					pane: 'warzones',
					renderer: warRenderer,
					className: 'terr-zone',
					color,
					weight: 1,
					fillColor: color,
					fillOpacity: 0.3
				})
					.bindPopup(() => territorioPopupHtml(t, color), { maxWidth: 340 })
					.addTo(state.territoryLayer);
			}
		}
		const icon = L.divIcon({
			html: `<span class="terr-label"><span class="terr-dot" style="background:${color}"></span><span class="terr-name">${escHtml(t.nombre)}</span></span>`,
			className: 'battle-wrap',
			iconSize: [0, 0],
			iconAnchor: [0, 0]
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
	const m = prefs.margen || 0; // margen de años elegido en el panel de capas
	for (const c of historia.conflictos || []) {
		if (y < c.inicio - m || y > c.fin + m) continue;
		for (const b of c.batallas || []) {
			// solo en el año (o años) en que se libró, ± el margen elegido
			const bFin = b.hasta !== undefined && b.hasta !== null ? b.hasta : b.anio;
			if (bFin < y - m || b.anio > y + m) continue;
			const icon = L.divIcon({
				html: `<span class="battle-label"><span class="battle-ico">⚔️</span><span>${escHtml(b.nombre)}</span></span>`,
				className: 'battle-wrap',
				iconSize: [0, 0],
				iconAnchor: [0, 0]
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
			className: 'battle-wrap',
			iconSize: [0, 0],
			iconAnchor: [0, 0]
		});
		L.marker([ev.lat, ev.lng], { icon, keyboard: false })
			.bindPopup(() => eventPopupHtml(ev), { maxWidth: 340 })
			.addTo(state.eventLayer);
	}
}
