/* Chronus Tabula — tiempo.js
   Barra de tiempo: escala no lineal, épocas del modo móvil, marcas, petición de año, reproducción y controles.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

/* ---------- escala no lineal de la barra de tiempo ----------
   La barra reparte su ancho por densidad histórica:
   3000 a.C.–500 -> 20 %, 500–1500 -> 30 %, 1500–2026 -> 50 %. */

const TIME_SEGMENTS = [
	{ from: -3000, to: 500, w: 200 },
	{ from: 500, to: 1500, w: 300 },
	{ from: 1500, to: MAX_YEAR, w: 500 }
];
const SLIDER_MAX = 1000;

/* ---------- modo móvil: zoom temporal por épocas ----------
   En pantallas pequeñas el rango completo (5.026 años) deja ~15 años por
   píxel: imposible de manejar con el dedo. Solución: chips de época que
   acotan el deslizador al tramo elegido (1-2 años/px) + burbuja-lupa
   sobre el pulgar. En escritorio nada cambia. */

const mqMobile = window.matchMedia('(max-width: 720px)');
function isMobile() {
	return mqMobile.matches;
}

const ERAS = [
	{ key: 'era.ancient', from: -3000, to: 500 },
	{ key: 'era.medieval', from: 500, to: 1500 },
	{ key: 'era.earlymodern', from: 1500, to: 1800 },
	{ key: 'era.contemporary', from: 1800, to: 1950 },
	{ key: 'era.modern', from: 1950, to: MAX_YEAR }
];
let activeEra = 2;

function eraFor(y) {
	for (let i = ERAS.length - 1; i > 0; i--) if (y >= ERAS[i].from) return i;
	return 0;
}

/* mapeo posición↔año vigente: época activa en móvil, tramos globales en escritorio */
function curYearToPos(y) {
	if (!isMobile()) return yearToPos(y);
	const e = ERAS[activeEra];
	y = Math.max(e.from, Math.min(e.to, y));
	return Math.round(((y - e.from) / (e.to - e.from)) * SLIDER_MAX);
}
function curPosToYear(p) {
	if (!isMobile()) return posToYear(p);
	const e = ERAS[activeEra];
	return Math.round(e.from + (p / SLIDER_MAX) * (e.to - e.from));
}

function updateEraChips() {
	const box = document.getElementById('eraChips');
	if (!box) return;
	if (!box.children.length) {
		ERAS.forEach((e, i) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.addEventListener('click', () => {
				activeEra = i;
				const y = Math.max(e.from, Math.min(e.to, state.requestedYear));
				updateEraChips();
				buildTimeMarks();
				requestYear(y, { force: true });
			});
			box.appendChild(b);
		});
	}
	[...box.children].forEach((b, i) => {
		b.textContent = i18n.t(ERAS[i].key);
		b.classList.toggle('on', i === activeEra);
	});
	const on = box.children[activeEra];
	if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function yearToPos(y) {
	y = Math.max(TIME_SEGMENTS[0].from, Math.min(TIME_SEGMENTS[TIME_SEGMENTS.length - 1].to, y));
	let acc = 0;
	for (const s of TIME_SEGMENTS) {
		if (y <= s.to) return Math.round(acc + ((y - s.from) / (s.to - s.from)) * s.w);
		acc += s.w;
	}
	return SLIDER_MAX;
}

function posToYear(p) {
	let acc = 0;
	for (const s of TIME_SEGMENTS) {
		if (p <= acc + s.w) return Math.round(s.from + ((p - acc) / s.w) * (s.to - s.from));
		acc += s.w;
	}
	return TIME_SEGMENTS[TIME_SEGMENTS.length - 1].to;
}

/* Dos carriles de marcas bajo la barra (conflictos ⚔ y eventos ⭐💡),
   con clústeres cuando las marcas se tocan. Si se sigue un país, solo
   se muestra lo que afecta a su historia. */

let markPop = null;
function closeMarkPop() {
	if (markPop) {
		markPop.remove();
		markPop = null;
	}
}
document.addEventListener(
	'click',
	e => {
		if (markPop && !markPop.contains(e.target) && !e.target.closest('.tmark')) closeMarkPop();
	},
	true
);

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
			L.popup({ maxWidth: 340 })
				.setLatLng([it.ev.lat, it.ev.lng])
				.setContent(eventPopupHtml(it.ev))
				.openOn(map);
		}, 600);
	}
}

/* burbuja-lupa sobre el pulgar del deslizador (solo móvil): el dedo tapa
   el valor, así que el año flota en grande por encima mientras se arrastra */
function showSliderBubble(slider) {
	if (!isMobile()) return;
	const b = document.getElementById('sliderBubble');
	if (!b) return;
	b.hidden = false;
	b.textContent = i18n.formatYear(state.requestedYear);
	const pct = +slider.value / SLIDER_MAX;
	b.style.left = `calc(${(pct * 100).toFixed(2)}% + ${((0.5 - pct) * 34).toFixed(1)}px)`;
}
function hideSliderBubble() {
	const b = document.getElementById('sliderBubble');
	if (b) b.hidden = true;
}

function buildTimeMarks() {
	const box = document.getElementById('timeMarks');
	if (!box || !historia) return;
	closeMarkPop();
	box.innerHTML = '';
	const keys = followKeys();
	// en móvil, solo las marcas de la época activa (el deslizador solo la abarca a ella)
	const enRango = y => !isMobile() || (y >= ERAS[activeEra].from && y <= ERAS[activeEra].to);

	const lanes = [
		{
			top: 1,
			items: (historia.conflictos || [])
				.filter(c => c.inicio >= TIME_SEGMENTS[0].from && enRango(c.inicio) && warRelevant(c, keys))
				.map(c => ({ tipo: 'war', y: c.inicio, y2: c.fin, n: c.nombre, c }))
		},
		{
			top: 17,
			items: (historia.eventos || [])
				.filter(ev => ev.anio >= TIME_SEGMENTS[0].from && enRango(ev.anio) && eventRelevant(ev, keys))
				.map(ev => ({ tipo: 'event', y: ev.anio, n: ev.nombre, inv: ev.categoria === 'invento', ev }))
		}
	];

	const fmt = it => `${it.n} (${i18n.formatYear(it.y)}${it.y2 ? '–' + i18n.formatYear(it.y2) : ''})`;

	for (const lane of lanes) {
		lane.items.sort((a, b) => a.y - b.y);
		// clustering por proximidad en % de la barra
		const groups = [];
		let g = null;
		for (const it of lane.items) {
			const p = (curYearToPos(it.y) / SLIDER_MAX) * 100;
			if (g && p - g.pLast < 1.5) {
				g.list.push(it);
				g.pLast = p;
				g.p = (g.p0 + p) / 2;
			} else {
				g = { p0: p, pLast: p, p, list: [it] };
				groups.push(g);
			}
		}
		for (const gr of groups) {
			const el = document.createElement('span');
			el.tabIndex = 0;
			if (gr.list.length > 1) {
				el.className = 'tmark tm-cluster ' + (lane.top === 1 ? 'tmc-war' : 'tmc-event');
				el.textContent = gr.list.length;
				el.style.top = lane.top - 2 + 'px';
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
				if (gr.list.length === 1) {
					markAction(gr.list[0]);
					return;
				}
				closeMarkPop();
				markPop = document.createElement('div');
				markPop.className = 'mark-pop';
				markPop.innerHTML = gr.list
					.map(
						(it, i) =>
							`<div class="mp-row" data-i="${i}"><span>${it.tipo === 'war' ? '⚔️' : it.inv ? '💡' : '⭐'}</span><span class="mp-n">${escHtml(it.n)}</span><span class="mp-y">${i18n.formatYear(it.y)}${it.y2 ? '–' + i18n.formatYear(it.y2) : ''}</span></div>`
					)
					.join('');
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

	// etiquetas de los límites de tramo (en móvil las dan los chips de época)
	if (!isMobile()) {
		for (const y of [500, 1500]) {
			const el = document.createElement('span');
			el.className = 'tmark tm-limit';
			el.style.left = (yearToPos(y) / SLIDER_MAX) * 100 + '%';
			el.textContent = y;
			box.appendChild(el);
		}
	}
}

/* ---------- petición de año (barra, input, play, hash) ---------- */

let yearDebounce;

function requestYear(y, opts = {}) {
	y = Math.max(-123000, Math.min(MAX_YEAR, y));
	if (y === state.requestedYear && !opts.force) return;
	if (!opts.fromPlay) stopPlay();
	state.requestedYear = y;
	if (isMobile()) {
		// sincronizar la época activa con el año
		const ei = eraFor(y);
		if (ei !== activeEra) {
			activeEra = ei;
			updateEraChips();
			buildTimeMarks();
		}
	}
	const slider = document.getElementById('yearSlider');
	const input = document.getElementById('yearInput');
	input.value = y;
	slider.value = curYearToPos(y);
	updateShownLabel(nearestYear(y));
	clearTimeout(yearDebounce);
	yearDebounce = setTimeout(
		() => {
			showYear(y);
			updateBattles();
			updateEvents();
			updateTerritorios();
			updateWarZones();
			updateYearPanel();
			writeHash();
		},
		opts.fromPlay ? 0 : 250
	);
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
		if (i < 0 || i >= state.years.length - 1) {
			stopPlay();
			return;
		}
		requestYear(state.years[i + 1], { fromPlay: true });
	};
	step();
	state.playTimer = setInterval(step, speed);
}

/* ---------- controles ---------- */

function setupControls() {
	const slider = document.getElementById('yearSlider');
	const input = document.getElementById('yearInput');

	slider.addEventListener('input', () => {
		requestYear(curPosToYear(+slider.value));
		showSliderBubble(slider);
	});
	['change', 'pointerup', 'pointercancel', 'touchend', 'blur'].forEach(ev =>
		slider.addEventListener(ev, hideSliderBubble)
	);
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
		if (state.playTimer) stopPlay();
		else startPlay();
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
			updateEraChips();
			updateYearPanel();
		});
	});

	const followInput = document.getElementById('followInput');
	followInput.addEventListener('change', () => {
		const v = followInput.value.trim().toLowerCase();
		if (!v) {
			setFollow(null);
			return;
		}
		const pais = (historia.paises || []).find(
			p =>
				(p.nombre || '').toLowerCase() === v ||
				p.id === v ||
				(p.nombres || []).some(n => n.toLowerCase() === v)
		);
		if (pais) setFollow(pais);
	});
	document.getElementById('followClear').addEventListener('click', () => setFollow(null));

	map.on('moveend zoomend', () => {
		updateLabels();
		writeHash();
	});
}
