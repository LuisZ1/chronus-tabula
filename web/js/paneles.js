/* Chronus Tabula — paneles.js
   Paneles laterales: leyenda de entidades, panel «Este año» y panel de capas.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

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
		// nombre por época (RD del Congo…); la leyenda sí admite nombres históricos
		const display = nombreVisible(e.key, state.shownYear, true);
		rows.push(
			`<div class="legend-row" data-i="${i}"><span class="chip" style="background:${colorFor(e.key)}"></span><span class="lname" title="${escHtml(e.key)}">${escHtml(display)}</span><span class="larea">${fmtKm2(km2)}</span></div>`
		);
	}
	list.innerHTML = rows.join('');
}

function setupLegend() {
	const panel = document.getElementById('legendPanel');
	const btn = document.getElementById('legendToggle');
	let collapsed = false;
	try {
		collapsed = localStorage.getItem('mapamundi.legend') === 'closed';
	} catch (e) {}
	const apply = () => {
		panel.classList.toggle('collapsed', collapsed);
		btn.textContent = collapsed ? '▸' : '▾';
	};
	apply();
	btn.addEventListener('click', () => {
		collapsed = !collapsed;
		try {
			localStorage.setItem('mapamundi.legend', collapsed ? 'closed' : 'open');
		} catch (e) {}
		apply();
	});
	document.getElementById('legendList').addEventListener('click', ev => {
		const row = ev.target.closest('.legend-row');
		if (!row) return;
		const e = state.legendData[+row.dataset.i];
		if (!e) return;
		map.fitBounds(
			[
				[e.minLat, e.minLng],
				[e.maxLat, e.maxLng]
			],
			{ maxZoom: 6, padding: [30, 30] }
		);
	});
}

/* ---------- panel «Este año»: conflictos activos y datos de interés ---------- */

function conflictBounds(c) {
	let minLat = 90,
		maxLat = -90,
		minLng = 180,
		maxLng = -180,
		any = false;
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
	return any
		? [
				[minLat, minLng],
				[maxLat, maxLng]
			]
		: null;
}

function updateYearPanel() {
	if (!historia) return;
	const y = state.requestedYear;
	const keys = followKeys();
	document.getElementById('ypYear').textContent =
		i18n.formatYear(y) + (state.follow ? ' · ' + (state.follow.nombre || state.follow.id) : '');

	const wars = (historia.conflictos || []).filter(c => y >= c.inicio && y <= c.fin && warRelevant(c, keys));
	const warsBox = document.getElementById('ypWars');
	warsBox.innerHTML = wars.length
		? wars
				.map(
					c =>
						`<div class="yp-row" data-war="${escHtml(c.id)}"><span class="yp-ico">⚔️</span><span class="yp-name">${escHtml(c.nombre)}</span><span class="yp-years">${i18n.formatYear(c.inicio)}–${i18n.formatYear(c.fin)}</span></div>`
				)
				.join('')
		: `<div class="yp-empty">${i18n.t('panel.none')}</div>`;

	// datos de interés cuyo año «pertenece» al snapshot mostrado
	const facts = (historia.eventos || []).filter(
		ev => nearestYear(ev.anio) === state.shownYear && eventRelevant(ev, keys)
	);
	const factsBox = document.getElementById('ypFacts');
	factsBox.innerHTML = facts.length
		? facts
				.map(
					(ev, i) =>
						`<div class="yp-row" data-fact="${i}"><span class="yp-ico">${ev.categoria === 'invento' ? '💡' : '⭐'}</span><span class="yp-name">${escHtml(ev.nombre)}</span><span class="yp-years">${i18n.formatYear(ev.anio)}</span></div>`
				)
				.join('')
		: `<div class="yp-empty">${i18n.t('panel.none')}</div>`;
	factsBox._facts = facts;
}

function setupYearPanel() {
	const panel = document.getElementById('yearPanel');
	const btn = document.getElementById('yearPanelToggle');
	let collapsed = false;
	try {
		collapsed = localStorage.getItem('mapamundi.yearpanel') === 'closed';
	} catch (e) {}
	const apply = () => {
		panel.classList.toggle('collapsed', collapsed);
		btn.textContent = collapsed ? '▸' : '▾';
	};
	apply();
	btn.addEventListener('click', () => {
		collapsed = !collapsed;
		try {
			localStorage.setItem('mapamundi.yearpanel', collapsed ? 'closed' : 'open');
		} catch (e) {}
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
		requestYear(f.anio); // salta al año exacto del dato
		map.flyTo([f.lat, f.lng], Math.max(map.getZoom(), 5));
		setTimeout(() => {
			L.popup({ maxWidth: 340 }).setLatLng([f.lat, f.lng]).setContent(eventPopupHtml(f)).openOn(map);
		}, 600);
	});
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
		state.lastBattleYear = state.lastEventYear = null; // forzar repintado
		updateBattles();
		updateEvents();
	});
}
