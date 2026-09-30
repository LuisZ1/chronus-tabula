/* Chronus Tabula — capas.js
   Marcadores del año: batallas, eventos y territorios menores.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* Cada marcador es un punto en su coordenada exacta y un rótulo que js/rotulos.js
   coloca donde no tape a otro (o agrupa en un círculo con número). k: b batalla,
   e acontecimiento, i invento, t territorio. */
function marcaRotulada(latlng, k, rotulo, color) {
	const pt = `<span class="rot-pt"${color ? ` style="background:${color}"` : ''}></span>`;
	const icon = L.divIcon({
		html: `<div class="rot rot-${k}">${pt}<span class="rot-hilo"></span>${rotulo}</div>`,
		className: 'battle-wrap',
		iconSize: [0, 0],
		iconAnchor: [0, 0]
	});
	const mk = L.marker(latlng, { icon, keyboard: false });
	mk.rot = { k };
	return mk;
}

/* ---------- territorios menores (Ceuta, Canarias, Azores, Gibraltar…) ---------- */

function paisDeTerritorio(t) {
	const b = normTxt(t.pais || '');
	if (!b) return null;
	const ps = historia.paises || [];
	// coincidencia exacta con el nombre (o con cada parte de un nombre compuesto
	// como «Reino Unido / Gran Bretaña»), luego con nombres del GeoJSON y linaje
	const partes = p =>
		normTxt(nombreEs(p))
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
		const color = colorFor(enMapa || nombres[0] || t.pais || nombreEs(t));
		// extensión aproximada: polígono recortado a la costa (para entidades
		// sin frontera propia en los mapas, como Sumeria o las póleis griegas)
		if (t.poligono) {
			const anillos = t.mar ? [t.poligono] : clipZoneToLand('terr|' + nombreEs(t), t.poligono);
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
		marcaRotulada([t.lat, t.lng], 't', `<span class="terr-label"><span class="terr-name">${escHtml(nombreTxt(t))}</span></span>`, color)
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
			marcaRotulada([b.lat, b.lng], 'b', `<span class="battle-label"><span class="battle-ico">⚔️</span><span>${escHtml(nombreTxt(b))}</span></span>`)
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
		const inv = ev.categoria === 'invento';
		marcaRotulada([ev.lat, ev.lng], inv ? 'i' : 'e', `<span class="event-label"><span class="event-ico">${inv ? '💡' : '⭐'}</span><span>${escHtml(nombreTxt(ev))}</span></span>`)
			.bindPopup(() => eventPopupHtml(ev), { maxWidth: 340 })
			.addTo(state.eventLayer);
	}
}
