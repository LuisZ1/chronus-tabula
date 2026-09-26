/* Chronus Tabula — tiempo.js
   Barra de tiempo: escala no lineal, épocas del modo móvil, marcas, petición de año, reproducción y controles.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* ---------- escala no lineal de la barra de tiempo ----------
   La barra reparte su ancho por densidad histórica:
   3000 a.C.–500 -> 20 %, 500–1500 -> 30 %, 1500–2026 -> 50 %. */

const TIME_SEGMENTS = [
	{ from: -3000, to: 500, w: 200 },
	{ from: 500, to: 1500, w: 300 },
	{ from: 1500, to: MAX_YEAR, w: 500 }
];
const SLIDER_MAX = 1000;
const RANGO_MIN = -3000; // primer año de la barra
const RANGO_SPAN = MAX_YEAR - RANGO_MIN;

/* ---------- navegador tipo Premiere (escritorio) ----------
   En vez de una escala no lineal (que hacía impredecible el salto), la barra
   es LINEAL dentro de una «ventana visible» [viewLo, viewHi]. El navegador de
   abajo representa todo el rango y sus tiradores acercan/alejan esa ventana:
   al estrecharla, cada píxel de la barra vale menos años (más precisión), y las
   etiquetas de los extremos muestran siempre qué tramo abarca. */

let viewLo = RANGO_MIN;
let viewHi = MAX_YEAR;

function winPosToYear(p) {
	return Math.round(viewLo + (p / SLIDER_MAX) * (viewHi - viewLo));
}
function winYearToPos(y) {
	const f = (y - viewLo) / (viewHi - viewLo);
	return Math.round(Math.max(0, Math.min(1, f)) * SLIDER_MAX);
}

/* ---------- modo móvil: toda la historia en escala no lineal ----------
   En pantallas pequeñas no hay navegador de zoom: el deslizador abarca de
   3000 a. C. a hoy con la escala no lineal de TIME_SEGMENTS (1500–hoy ocupa
   la mitad de la barra). Para afinar: flechas ◀ ▶ (salto según la densidad
   del tramo), la casilla del año y la burbuja-lupa sobre el pulgar. */

const mqMobile = window.matchMedia('(max-width: 720px)');
function isMobile() {
	return mqMobile.matches;
}


/* mapeo posición↔año vigente: escala no lineal completa en móvil, ventana del navegador en escritorio */
function curYearToPos(y) {
	return isMobile() ? yearToPos(y) : winYearToPos(y);
}
function curPosToYear(p) {
	return isMobile() ? posToYear(p) : winPosToYear(p);
}

/* etiquetas de los extremos de la barra: siempre muestran el tramo que abarca
   (la ventana del navegador en escritorio, toda la historia en móvil) */
function updateEdgeLabels() {
	const lo = document.getElementById('edgeLo'),
		hi = document.getElementById('edgeHi');
	if (!lo || !hi) return;
	if (isMobile()) {
		lo.textContent = i18n.formatYear(RANGO_MIN);
		hi.textContent = i18n.formatYear(MAX_YEAR);
	} else {
		lo.textContent = i18n.formatYear(viewLo);
		hi.textContent = i18n.formatYear(viewHi);
	}
}

/* ---------- navegador: pinta la ventana y engancha tiradores/arrastre ---------- */
function navRender() {
	const win = document.getElementById('navWin');
	if (!win) return;
	win.style.left = ((viewLo - RANGO_MIN) / RANGO_SPAN) * 100 + '%';
	win.style.width = ((viewHi - viewLo) / RANGO_SPAN) * 100 + '%';
	updateEdgeLabels();
}

// aplica un cambio de ventana: repinta navegador, marcas, etiquetas y reubica el pulgar
function applyView() {
	navRender();
	if (historia) buildTimeMarks();
	const slider = document.getElementById('yearSlider');
	if (slider) slider.value = curYearToPos(state.requestedYear);
	actualizarPasoFlechas();
}

function setupNavigator() {
	const nav = document.getElementById('navBar');
	if (!nav) return;
	const win = document.getElementById('navWin');
	const MINW = 30 / RANGO_SPAN; // ventana mínima ~30 años
	const fx = cx => {
		const r = nav.getBoundingClientRect();
		return Math.max(0, Math.min(1, (cx - r.left) / r.width));
	};
	let mode = null,
		grabDX = 0;
	nav.addEventListener('pointerdown', e => {
		nav.setPointerCapture(e.pointerId);
		const t = e.target;
		let loF = (viewLo - RANGO_MIN) / RANGO_SPAN,
			hiF = (viewHi - RANGO_MIN) / RANGO_SPAN;
		if (t.classList.contains('l')) mode = 'L';
		else if (t.classList.contains('r')) mode = 'R';
		else if (t === win) {
			mode = 'M';
			grabDX = fx(e.clientX) - loF;
		} else {
			// clic en la pista: centrar la ventana ahí
			const w = hiF - loF,
				c = fx(e.clientX);
			loF = Math.max(0, Math.min(1 - w, c - w / 2));
			viewLo = Math.round(RANGO_MIN + loF * RANGO_SPAN);
			viewHi = Math.round(viewLo + w * RANGO_SPAN);
			mode = 'M';
			grabDX = fx(e.clientX) - (viewLo - RANGO_MIN) / RANGO_SPAN;
			applyView();
		}
	});
	nav.addEventListener('pointermove', e => {
		if (!mode) return;
		const p = fx(e.clientX);
		let loF = (viewLo - RANGO_MIN) / RANGO_SPAN,
			hiF = (viewHi - RANGO_MIN) / RANGO_SPAN;
		if (mode === 'L') loF = Math.min(hiF - MINW, p);
		else if (mode === 'R') hiF = Math.max(loF + MINW, p);
		else {
			const w = hiF - loF;
			loF = Math.max(0, Math.min(1 - w, p - grabDX));
			hiF = loF + w;
		}
		viewLo = Math.round(RANGO_MIN + loF * RANGO_SPAN);
		viewHi = Math.round(RANGO_MIN + hiF * RANGO_SPAN);
		applyView();
	});
	['pointerup', 'pointercancel'].forEach(ev => nav.addEventListener(ev, () => (mode = null)));
	nav.addEventListener('dblclick', () => {
		viewLo = RANGO_MIN;
		viewHi = MAX_YEAR;
		applyView();
	});
	navRender();
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
		volarYAbrir(it.ev.lat, it.ev.lng, () => eventPopupHtml(it.ev));
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
	// en móvil las marcas van en su propia franja a todo el ancho (#timeMarksM);
	// en escritorio, bajo el deslizador (#timeMarks) para alinearse con él
	const box = document.getElementById(isMobile() ? 'timeMarksM' : 'timeMarks');
	if (!box || !historia) return;
	closeMarkPop();
	box.innerHTML = '';
	const keys = followKeys();
	// solo las marcas del tramo que abarca la barra: todo en móvil,
	// la ventana del navegador en escritorio
	const enRango = y => isMobile() || (y >= viewLo && y <= viewHi);

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

	// en móvil el dedo necesita blancos grandes: agrupamos mucho más (pastillas
	// con el número) y las hacemos tocables; en escritorio, marcas finas y densas.
	const mob = isMobile();
	const gap = 1.5; // escritorio: encadenado fino por proximidad
	// móvil: ancho de cada casilla (%) -> ~7-8 pastillas por carril; en pantallas
	// estrechas, casillas de al menos ~46 px para que las pastillas no se pisen
	const binW = Math.max(13, 4600 / (box.clientWidth || 330));

	for (const lane of lanes) {
		lane.items.sort((a, b) => a.y - b.y);
		const groups = [];
		if (mob) {
			// móvil: casillas de ancho fijo (no encadenado, que colapsaría todo en
			// una sola pastilla con datos densos); cada pastilla va al centro de su
			// casilla -> número acotado, bien repartido y sin solapes.
			const bins = new Map();
			for (const it of lane.items) {
				const p = (curYearToPos(it.y) / SLIDER_MAX) * 100;
				const k = Math.floor(p / binW);
				let arr = bins.get(k);
				if (!arr) bins.set(k, (arr = []));
				arr.push(it);
			}
			for (const [k, list] of bins) groups.push({ p: (k + 0.5) * binW, list });
		} else {
			// escritorio: encadenado por proximidad en % de la barra
			let g = null;
			for (const it of lane.items) {
				const p = (curYearToPos(it.y) / SLIDER_MAX) * 100;
				if (g && p - g.pLast < gap) {
					g.list.push(it);
					g.pLast = p;
					g.p = (g.p0 + p) / 2;
				} else {
					g = { p0: p, pLast: p, p, list: [it] };
					groups.push(g);
				}
			}
		}
		for (const gr of groups) {
			const el = document.createElement('span');
			el.tabIndex = 0;
			const war = lane.top === 1;
			if (gr.list.length > 1) {
				el.className =
					'tmark tm-cluster ' + (war ? 'tmc-war' : 'tmc-event') + (mob ? ' tm-mob' : '');
				el.textContent = mob ? (war ? '⚔️' : '⭐') + gr.list.length : gr.list.length;
				el.style.top = (mob ? (war ? 0 : 20) : lane.top - 2) + 'px';
				el.title = gr.list.slice(0, 8).map(fmt).join('\n') + (gr.list.length > 8 ? '\n…' : '');
			} else {
				const it = gr.list[0];
				if (mob) {
					// en móvil, también las marcas sueltas son pastillas tocables
					el.className = 'tmark tm-cluster tm-mob ' + (war ? 'tmc-war' : 'tmc-event');
					el.textContent = war ? '⚔️' : it.inv ? '💡' : '⭐';
					el.style.top = (war ? 0 : 20) + 'px';
				} else {
					el.className = 'tmark ' + (it.tipo === 'war' ? 'tm-war' : 'tm-event');
					if (it.tipo === 'event') el.textContent = it.inv ? '💡' : '★';
					el.style.top = lane.top + 'px';
				}
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

	updateEdgeLabels();
}

/* salto de las flechas ◀ ▶: una cantidad «redonda» (1,2,5,10,25,50,100,250,500)
   proporcional al tramo visible — fina al acercar, amplia al ver todo — para que
   el usuario siempre sepa cuánto avanza (el tooltip lo muestra). */
function pasoFlechas() {
	let span = viewHi - viewLo;
	if (isMobile()) {
		// escala no lineal: el salto sigue la densidad del tramo del año actual
		// (años que valdría la barra entera a esa densidad): ~25 años desde 1500,
		// ~50 en la Edad Media, ~250 en la Antigüedad
		const y = state.requestedYear == null ? 1500 : state.requestedYear;
		const s =
			TIME_SEGMENTS.find(t => y < t.to) || TIME_SEGMENTS[TIME_SEGMENTS.length - 1];
		span = ((s.to - s.from) * SLIDER_MAX) / s.w;
	}
	const raw = span / 100;
	return [1, 2, 5, 10, 25, 50, 100, 250, 500].find(n => n >= raw) || 1000;
}
function actualizarPasoFlechas() {
	const paso = pasoFlechas();
	const en = i18n.lang === 'en';
	const unidad = en ? (paso === 1 ? ' year' : ' years') : paso === 1 ? ' año' : ' años';
	const prev = document.getElementById('prevYear'),
		next = document.getElementById('nextYear');
	if (prev) prev.title = (en ? 'Back ' : 'Retroceder ') + paso + unidad;
	if (next) next.title = (en ? 'Forward ' : 'Avanzar ') + paso + unidad;
	// en móvil el tooltip no se ve al tocar: mostramos el salto en un texto fijo
	const info = document.getElementById('pasoInfo');
	if (info)
		info.innerHTML =
			'<span class="pi-a">◀</span> ±' + paso + unidad + ' <span class="pi-a">▶</span>';
}

/* ---------- petición de año (barra, input, play, hash) ---------- */

let yearDebounce;

function requestYear(y, opts = {}) {
	y = Math.max(-123000, Math.min(MAX_YEAR, y));
	if (y === state.requestedYear && !opts.force) return;
	if (!opts.fromPlay) stopPlay();
	state.requestedYear = y;
	if (isMobile()) {
		actualizarPasoFlechas(); // el salto depende del tramo del año actual
	} else if (y < viewLo || y > viewHi) {
		// el año pedido cae fuera de la ventana visible: desplázala para incluirlo
		const w = viewHi - viewLo;
		if (y < viewLo) {
			viewLo = Math.max(RANGO_MIN, y);
			viewHi = Math.min(MAX_YEAR, viewLo + w);
		} else {
			viewHi = Math.min(MAX_YEAR, y);
			viewLo = Math.max(RANGO_MIN, viewHi - w);
		}
		navRender();
		if (historia) buildTimeMarks();
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

	document.getElementById('prevYear').addEventListener('click', () =>
		requestYear(state.requestedYear - pasoFlechas())
	);
	document.getElementById('nextYear').addEventListener('click', () =>
		requestYear(state.requestedYear + pasoFlechas())
	);
	actualizarPasoFlechas();

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
			updateEdgeLabels();
			actualizarPasoFlechas();
			updateYearPanel();
		});
	});

	// Búsqueda por PRIORIDAD, no por orden de la lista: primero el nombre propio de
	// una ficha, luego su id y sus nombres en los mapas, y solo al final los
	// 'relacionados' (alias y linaje). Si no, «España» caía en la Corona de Aragón,
	// que la cita como relacionada y va antes en la lista. Sin tildes ni mayúsculas.
	const buscarPais = texto => {
		const v = normTxt(texto).trim();
		const ps = historia.paises || [];
		const igual = n => normTxt(n || '').trim() === v;
		return (
			ps.find(p => igual(p.nombre)) ||
			ps.find(p => (p.nombre || '').split('/').some(igual)) ||
			ps.find(p => p.id === v) ||
			ps.find(p => (p.nombres || []).some(igual)) ||
			ps.find(p => (p.nombres_periodo || []).some(per => igual(per.nombre))) ||
			ps.find(p => (p.relacionados || []).some(igual)) ||
			null
		);
	};

	const followInput = document.getElementById('followInput');
	followInput.addEventListener('change', () => {
		const v = followInput.value.trim().toLowerCase();
		if (!v) {
			setFollow(null);
			return;
		}
		const pais = buscarPais(v);
		if (pais) setFollow(pais);
	});
	document.getElementById('followClear').addEventListener('click', () => setFollow(null));

	setupNavigator();

	map.on('moveend zoomend', () => {
		updateLabels();
		writeHash();
	});
}
