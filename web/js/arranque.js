/* Chronus Tabula — arranque.js
   Arranque de la aplicación.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* ---------- selector de idioma ----------
   Botón con la bandera y un menú propio (role=listbox). El <select id="langSelect">
   oculto sigue siendo la fuente de verdad: el menú cambia su valor y lanza 'change',
   que es lo que escucha tiempo.js para traducir la interfaz. */
function montarMenuIdioma() {
	const sel = document.getElementById('langSelect');
	const btn = document.getElementById('langBtn');
	const menu = document.getElementById('langMenu');
	if (!sel || !btn || !menu) return;
	const ops = [...menu.querySelectorAll('[role=option]')];
	const pintar = () => {
		const actual = ops.find(o => o.dataset.lang === sel.value) || ops[0];
		btn.querySelector('.bandera').textContent = actual.querySelector('.bandera').textContent;
		btn.setAttribute('aria-label', 'Idioma · Language: ' + actual.title);
		ops.forEach(o => o.setAttribute('aria-selected', o === actual));
	};
	const abrir = () => {
		menu.hidden = false;
		btn.setAttribute('aria-expanded', 'true');
		(ops.find(o => o.getAttribute('aria-selected') === 'true') || ops[0]).focus();
	};
	const cerrar = foco => {
		menu.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
		if (foco) btn.focus();
	};
	const elegir = o => {
		cerrar(true);
		if (sel.value !== o.dataset.lang) {
			sel.value = o.dataset.lang;
			sel.dispatchEvent(new Event('change'));
		}
		pintar();
	};
	btn.addEventListener('click', () => (menu.hidden ? abrir() : cerrar()));
	btn.addEventListener('keydown', e => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			abrir();
		}
	});
	ops.forEach((o, i) => {
		o.tabIndex = -1;
		o.addEventListener('click', () => elegir(o));
		o.addEventListener('keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				elegir(o);
			} else if (e.key === 'Escape') cerrar(true);
			else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				ops[(i + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length].focus();
			} else if (e.key === 'Tab') cerrar();
		});
	});
	// clic o toque fuera: se cierra
	document.addEventListener('pointerdown', e => {
		if (!menu.hidden && !e.target.closest('.lang-box')) cerrar();
	});
	sel.addEventListener('change', pintar);
	pintar();
}

/* ---------- arranque ---------- */

async function init() {
	await i18n.init();
	document.getElementById('langSelect').value = i18n.lang;
	montarMenuIdioma();

	state.years = (await (await fetch('data/years.json')).json()).sort((a, b) => a - b);
	LAST_MAP_YEAR = state.years[state.years.length - 1];
	// años modernos navegables (reproducción y botones ◀ ▶); usan el último mapa
	for (const vy of [2014, 2020, 2022, MAX_YEAR]) if (!state.years.includes(vy)) state.years.push(vy);
	state.years.sort((a, b) => a - b);

	const h = readHash();
	const startYear = h ? h.year : INITIAL_YEAR;
	const startView =
		h && !isNaN(h.lat) && !isNaN(h.lng) && !isNaN(h.zoom)
			? { center: [h.lat, h.lng], zoom: h.zoom }
			: { center: [35, 10], zoom: 3 };

	hashApplying = true;
	map = L.map('map', {
		preferCanvas: true,
		worldCopyJump: true,
		minZoom: 2,
		maxZoom: 12,
		zoomControl: true,
		// movimiento reducido: zoom sin escala animada (el arrastre y el pellizco siguen al dedo)
		zoomAnimation: !menosMovimiento(),
		markerZoomAnimation: !menosMovimiento()
	}).setView(startView.center, startView.zoom);
	hashApplying = false;
	// en el crédito del mapa, junto a Leaflet: el aviso legal (datos orientativos, licencia)
	map.attributionControl.addAttribution(
		`<a href="aviso-legal.html" target="_blank" rel="noopener">${i18n.t('popup.disclaimerMore')}</a>`
	);

	const warPane = map.createPane('warzones');
	warPane.style.zIndex = 450; // sobre los territorios (400), bajo los marcadores (600)
	warRenderer = L.svg({ pane: 'warzones', padding: 0.5 });
	// reproducir: la capa de fronteras anterior se funde encima de la nueva
	const outPane = map.createPane('saliente');
	outPane.style.zIndex = 401; // justo sobre los territorios (400)
	outPane.style.pointerEvents = 'none';
	salienteRenderer = L.canvas({ pane: 'saliente' });

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

	// cambio móvil↔escritorio (tamaño u orientación): otra escala en la barra
	updateEdgeLabels();
	mqMobile.addEventListener('change', () => {
		navRender(); // el navegador (escritorio) y su ventana; también los extremos
		actualizarPasoFlechas();
		buildTimeMarks();
		document.getElementById('yearSlider').value = curYearToPos(state.requestedYear);
	});
	// en móvil los paneles arrancan plegados; su título los abre y cierra
	const lp = document.getElementById('layersPanel');
	const lt = lp.querySelector('.panel-title');
	const plegar = () => {
		lp.classList.toggle('collapsed');
		lt.setAttribute('aria-expanded', lp.classList.contains('collapsed') ? 'false' : 'true');
	};
	lt.addEventListener('click', plegar);
	lt.addEventListener('keydown', e => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			plegar();
		}
	});
	if (isMobile()) {
		lp.classList.add('collapsed');
		lt.setAttribute('aria-expanded', 'false');
	}

	state.requestedYear = null; // fuerza la primera petición
	requestYear(startYear, { force: true, fromPlay: true });
	applyPrefs();
	writeHash();
}

init();
