/* Chronus Tabula — arranque.js
   Arranque de la aplicación.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

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
		zoomControl: true
	}).setView(startView.center, startView.zoom);
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

	// modo móvil: época inicial, chips y reacción al cambiar de tamaño/orientación
	activeEra = eraFor(startYear);
	updateEraChips();
	mqMobile.addEventListener('change', () => {
		activeEra = eraFor(state.requestedYear);
		updateEraChips();
		navRender(); // el navegador (escritorio) y su ventana
		buildTimeMarks();
		document.getElementById('yearSlider').value = curYearToPos(state.requestedYear);
	});
	// en móvil los paneles arrancan plegados; su título los abre y cierra
	const lp = document.getElementById('layersPanel');
	lp.querySelector('.panel-title').addEventListener('click', () => lp.classList.toggle('collapsed'));
	if (isMobile()) lp.classList.add('collapsed');

	state.requestedYear = null; // fuerza la primera petición
	requestYear(startYear, { force: true, fromPlay: true });
	applyPrefs();
	writeHash();
}

init();
