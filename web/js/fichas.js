/* Chronus Tabula — fichas.js
   Popups (territorio, conflicto, batalla, evento, territorio menor), fuentes y extractos de Wikipedia.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* pie de fuentes de una ficha: plegado, se despliega solo si el lector lo pide */
/* recordatorio al pie de cada ficha: los datos son orientativos */
function avisoDatoHtml() {
	return `<p class="aviso-dato">${i18n.t('popup.disclaimer')} <a href="aviso-legal.html#exactitud" target="_blank" rel="noopener">${i18n.t('popup.disclaimerMore')}</a></p>`;
}

function fuentesHtml(reg) {
	const fs = reg && reg.fuentes;
	if (!fs || !fs.length) return '';
	const links = fs
		.map(f => {
			const label = escHtml(f.id || f.url || '?');
			return f.url ? `<a href="${escHtml(f.url)}" target="_blank" rel="noopener">${label}</a>` : label;
		})
		.join('<br>');
	return `<details class="fuentes"><summary>${i18n.t('popup.sources')} (${fs.length})</summary><div>${links}</div></details>`;
}

/* ---------- popup de territorio ---------- */

function popupHtml(props) {
	const esc = escHtml;
	if (sinDatos(props))
		return `<div class="territory-popup sin-datos-popup"><h3>${i18n.t('popup.noData')}</h3><p>${i18n.t('popup.noDataText')}</p></div>`;
	const y = state.requestedYear;
	const pais = paisFor(props);
	// en su época actual, la ficha; en otra época, el nombre de ese periodo
	// (Antiguo Egipto, no Egipto) y nada que sea solo del país actual
	const actual = esEpocaActual(pais, y);
	const periodo = periodoActivo(pais, y);
	const name = (periodo && periodo.nombre) || (pais && pais.nombre) || props.NAME || i18n.t('popup.unknown');
	let rows = '';

	for (const g of gobernanteEn(pais, y)) {
		rows += `<tr><td>${i18n.t('popup.ruler')}</td><td><strong>${esc(g.nombre)}</strong>${g.titulo ? '<br><em>' + esc(g.titulo) + '</em>' : ''}</td></tr>`;
	}
	const pop = poblacionCercana(pais, y);
	if (pop) {
		rows += `<tr><td>${i18n.t('popup.population')}</td><td>~${pop.valor.toLocaleString(i18n.lang)} (${i18n.t('popup.popData')} ${i18n.formatYear(pop.anio)})</td></tr>`;
	}
	const area = state.areaByName.get(props.NAME);
	if (area && area > 500) {
		rows += `<tr><td>${i18n.t('popup.area')}</td><td>${fmtKm2(area)}</td></tr>`;
	}

	if (props.NAME && pais && pais.nombre && pais.nombre !== props.NAME)
		rows += `<tr><td>${i18n.t('popup.originalName')}</td><td>${esc(props.NAME)}</td></tr>`;
	if (props.SUBJECTO && props.SUBJECTO !== props.NAME)
		rows += `<tr><td>${i18n.t('popup.sovereign')}</td><td>${esc(props.SUBJECTO)}</td></tr>`;
	if (props.PARTOF && props.PARTOF !== props.NAME && props.PARTOF !== props.SUBJECTO)
		rows += `<tr><td>${i18n.t('popup.partof')}</td><td>${esc(props.PARTOF)}</td></tr>`;
	if (props.RELLENO && props.RELLENO.origen) {
		const m = /world_(bc)?(\d+)/.exec(props.RELLENO.origen);
		const anio = m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
		rows += `<tr><td>${i18n.t('popup.filled')}</td><td>${esc(i18n.t('popup.filledText').replace('{y}', anio == null ? '?' : i18n.formatYear(anio)))}</td></tr>`;
	}
	if (props.wikipedia) {
		const url = /^https?:/.test(props.wikipedia)
			? props.wikipedia
			: `https://en.wikipedia.org/wiki/${encodeURIComponent(props.wikipedia)}`;
		rows += `<tr><td>${i18n.t('popup.wikipedia')}</td><td><a href="${esc(url)}" target="_blank" rel="noopener">↗</a></td></tr>`;
	}

	// reseña curada guardada en la ficha: si existe, se muestra y NO se descarga el
	// extracto en vivo (evita texto duplicado); si no, se deja el extracto en vivo.
	const resena = actual && pais && pais.resena;

	// título para el extracto de Wikipedia: preferimos el nombre curado en español;
	// fuera de la época actual, el artículo de ese periodo
	let wikiRef = '';
	if (!resena) {
		if (pais && !actual) wikiRef = periodo ? refWiki(periodo.wiki || periodo.nombre) : '';
		else if (pais) wikiRef = refWiki(pais.wiki || pais.nombre);
		else if (props.wikipedia && !/^https?:/.test(props.wikipedia)) wikiRef = 'en:' + props.wikipedia;
	}

	// Estado moderno sin nombres por época consultado antes de 1800: la reseña
	// describe el país de hoy, y así se rotula
	const sinPeriodos = pais && (!Array.isArray(pais.nombres_periodo) || !pais.nombres_periodo.length);
	const deHoy = resena && pais.wikidata && sinPeriodos && y < ANIO_EMBLEMAS_MODERNOS;
	const resenaHtml = resena
		? `<div class="wiki-extract">${deHoy ? `<p class="resena-hoy">${i18n.t('popup.todayNote')}</p>` : ''}<p>${esc(resena)}</p><div class="wiki-src">${i18n.t('wiki.source')}</div></div>`
		: '';

	return `<div class="territory-popup" data-wiki="${esc(wikiRef)}"><h3>${esc(name)}</h3><table>${rows}</table>${resenaHtml}${fuentesHtml(pais)}${avisoDatoHtml()}</div>`;
}

/* 'Reino de Aragón' → 'es:Reino de Aragón'; si ya trae prefijo de idioma ('es:…', 'en:…'), se respeta */
function refWiki(w) {
	return /^[a-z]{2,3}:/.test(w) ? w : 'es:' + w;
}

/* ---------- extracto de Wikipedia en los popups ---------- */

const wikiCache = new Map();

async function fetchWikiSummary(ref) {
	if (wikiCache.has(ref)) return wikiCache.get(ref);
	let stored = null;
	try {
		stored = localStorage.getItem('mapamundi.wiki.' + ref);
	} catch (e) {}
	if (stored) {
		const v = stored === 'none' ? null : JSON.parse(stored);
		wikiCache.set(ref, v);
		return v;
	}
	const [lang, ...rest] = ref.split(':');
	const title = rest.join(':');
	let result = null;
	try {
		const r = await fetch(
			`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`
		);
		if (r.ok) {
			const j = await r.json();
			if (j.extract) {
				result = {
					e: j.extract.length > 480 ? j.extract.slice(0, 480) + '…' : j.extract,
					t: (j.thumbnail && j.thumbnail.source) || null,
					u: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || null
				};
			}
		}
	} catch (e) {
		/* sin red: sin extracto */
	}
	wikiCache.set(ref, result);
	try {
		localStorage.setItem('mapamundi.wiki.' + ref, result ? JSON.stringify(result) : 'none');
	} catch (e) {}
	return result;
}

/* añade el extracto de Wikipedia a una ficha ya pintada (globo o hoja móvil) */
async function cargarExtracto(raiz, alTerminar) {
	const box = raiz && raiz.querySelector('[data-wiki]');
	if (!box || !box.dataset.wiki || box.querySelector('.wiki-extract')) return;
	const info = await fetchWikiSummary(box.dataset.wiki);
	if (!info || box.querySelector('.wiki-extract') || !box.isConnected) return;
	const div = document.createElement('div');
	div.className = 'wiki-extract';
	div.innerHTML = `${info.t ? `<img src="${escHtml(info.t)}" alt="">` : ''}<p>${escHtml(info.e)}${info.u ? ` <a href="${escHtml(info.u)}" target="_blank" rel="noopener">${i18n.t('wiki.more')}</a>` : ''}</p><div class="wiki-src">${i18n.t('wiki.source')}</div>`;
	const aviso = box.querySelector('.aviso-dato');
	if (aviso) box.insertBefore(div, aviso);
	else box.appendChild(div);
	if (alTerminar) alTerminar();
}

function setupWikiOnPopup() {
	// en el móvil los globos de Leaflet no caben: la ficha se abre en una hoja
	// modal (fondo oscurecido, se cierra con la ✕, tocando fuera, deslizando
	// hacia abajo, con Escape o con el botón «atrás» del sistema)
	L.Popup.mergeOptions({ autoPan: !isMobile() });
	map.on('popupopen', e => {
		const el = e.popup.getElement();
		if (!el) return;
		if (isMobile()) {
			const cont = el.querySelector('.leaflet-popup-content');
			const html = cont ? cont.innerHTML : '';
			map.closePopup(e.popup);
			abrirHojaFicha(html);
			return;
		}
		cargarExtracto(el, () => e.popup.update());
	});
}

/* ---------- hoja modal de la ficha en el móvil ---------- */

let hojaFicha = null;
let hojaFocoPrevio = null;
let hojaEnHistorial = false;

function crearHojaFicha() {
	const d = document.createElement('div');
	d.id = 'hojaFicha';
	d.className = 'hoja-ficha';
	d.hidden = true;
	d.innerHTML =
		'<div class="hoja-velo" data-cerrar></div>' +
		`<section class="hoja-panel" tabindex="-1" role="dialog" aria-modal="true" aria-label="${escHtml(i18n.t('sheet.label'))}">` +
		'<div class="hoja-cab"><span class="hoja-asa" aria-hidden="true"></span>' +
		`<button type="button" class="hoja-cerrar" data-cerrar aria-label="${escHtml(i18n.t('sheet.close'))}">` +
		'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
		'<div class="hoja-cuerpo"></div></section>';
	document.body.appendChild(d);
	d.addEventListener('click', ev => {
		if (ev.target.closest('[data-cerrar]')) cerrarHojaFicha();
	});
	d.addEventListener('keydown', ev => {
		if (ev.key === 'Escape') cerrarHojaFicha();
		else if (ev.key === 'Tab') {
			// el foco no sale de la hoja
			const fs = [...d.querySelectorAll('button, a[href], summary, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent);
			if (!fs.length) return;
			const i = fs.indexOf(document.activeElement);
			if (ev.shiftKey && i <= 0) {
				ev.preventDefault();
				fs[fs.length - 1].focus();
			} else if (!ev.shiftKey && i === fs.length - 1) {
				ev.preventDefault();
				fs[0].focus();
			}
		}
	});
	// deslizar hacia abajo desde la cabecera (o desde el cuerpo sin scroll) cierra
	const panel = d.querySelector('.hoja-panel');
	const cuerpo = d.querySelector('.hoja-cuerpo');
	let y0 = null;
	let dy = 0;
	panel.addEventListener(
		'touchstart',
		ev => {
			const enCab = ev.target.closest('.hoja-cab');
			if (!enCab && cuerpo.scrollTop > 0) return;
			y0 = ev.touches[0].clientY;
			dy = 0;
			panel.style.transition = 'none';
		},
		{ passive: true }
	);
	panel.addEventListener(
		'touchmove',
		ev => {
			if (y0 == null) return;
			dy = Math.max(0, ev.touches[0].clientY - y0);
			panel.style.transform = dy ? `translateY(${dy}px)` : '';
		},
		{ passive: true }
	);
	const soltar = () => {
		if (y0 == null) return;
		y0 = null;
		panel.style.transition = '';
		if (dy > Math.min(140, panel.offsetHeight * 0.25)) cerrarHojaFicha();
		else panel.style.transform = '';
	};
	panel.addEventListener('touchend', soltar);
	panel.addEventListener('touchcancel', soltar);
	window.addEventListener('popstate', () => {
		if (hojaEnHistorial) {
			hojaEnHistorial = false;
			cerrarHojaFicha(true);
		}
	});
	return d;
}

function abrirHojaFicha(html) {
	if (!hojaFicha) hojaFicha = crearHojaFicha();
	const cuerpo = hojaFicha.querySelector('.hoja-cuerpo');
	cuerpo.innerHTML = html;
	cuerpo.scrollTop = 0;
	const panel = hojaFicha.querySelector('.hoja-panel');
	panel.style.transform = '';
	const yaAbierta = !hojaFicha.hidden;
	if (!yaAbierta) {
		hojaFocoPrevio = document.activeElement;
		hojaFicha.hidden = false;
		void hojaFicha.offsetWidth; // aplicar el estado inicial antes de la transición
		hojaFicha.classList.add('abierta');
		// «atrás» en el móvil cierra la hoja en vez de salir del mapa
		try {
			history.pushState({ hojaFicha: true }, '');
			hojaEnHistorial = true;
		} catch (e) {}
	}
	panel.focus({ preventScroll: true }); // la ✕ sigue a un Tab de distancia
	cargarExtracto(cuerpo);
}

function cerrarHojaFicha(desdeHistorial) {
	if (!hojaFicha || hojaFicha.hidden) return;
	hojaFicha.classList.remove('abierta');
	const panel = hojaFicha.querySelector('.hoja-panel');
	const fin = () => {
		if (hojaFicha.classList.contains('abierta')) return;
		hojaFicha.hidden = true;
		panel.style.transform = '';
	};
	if (menosMovimiento()) fin();
	else {
		panel.addEventListener('transitionend', fin, { once: true });
		setTimeout(fin, 320);
	}
	if (!desdeHistorial && hojaEnHistorial) {
		hojaEnHistorial = false;
		try {
			history.back();
		} catch (e) {}
	}
	if (hojaFocoPrevio && hojaFocoPrevio.focus) hojaFocoPrevio.focus({ preventScroll: true });
}

function conflictPopupHtml(c, zona) {
	const esc = escHtml;
	let rows = '';
	rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(c.inicio)} – ${i18n.formatYear(c.fin)}</td></tr>`;
	if (zona && zona.nombre) rows += `<tr><td>${i18n.t('war.theater')}</td><td>${esc(zona.nombre)}</td></tr>`;
	if (zona && (zona.desde !== undefined || zona.hasta !== undefined)) {
		const zi = zona.desde !== undefined ? zona.desde : c.inicio;
		const zf = zona.hasta !== undefined ? zona.hasta : c.fin;
		rows += `<tr><td>${i18n.t('war.phase')}</td><td>${zi === zf ? i18n.formatYear(zi) : i18n.formatYear(zi) + ' – ' + i18n.formatYear(zf)}</td></tr>`;
	}
	if (zona)
		rows += `<tr><td>${i18n.t('war.type')}</td><td>${i18n.t(zona.tipo === 'ocupado' ? 'war.occupied' : 'war.front')}</td></tr>`;
	if (c.paises && c.paises.length)
		rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${c.paises.map(esc).join(', ')}</td></tr>`;
	if (c.bajas) rows += `<tr><td>${i18n.t('battle.casualties')}</td><td>${esc(c.bajas)}</td></tr>`;
	const wikiRef = refWiki(c.wiki || c.nombre);
	return `<div class="territory-popup war-popup" data-wiki="${esc(wikiRef)}"><h3>🔥 ${esc(c.nombre)}</h3><table>${rows}</table>${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ''}${fuentesHtml(c)}${avisoDatoHtml()}</div>`;
}

/* ---------- batallas y eventos ---------- */

function battlePopupHtml(c, b) {
	const esc = escHtml;
	let rows = `<tr><td>${i18n.t('battle.war')}</td><td><strong>${esc(c.nombre)}</strong></td></tr>`;
	rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(c.inicio)} – ${i18n.formatYear(c.fin)}</td></tr>`;
	const bAnios =
		b.hasta && b.hasta !== b.anio
			? `${i18n.formatYear(b.anio)} – ${i18n.formatYear(b.hasta)}`
			: i18n.formatYear(b.anio);
	rows += `<tr><td>${i18n.t('battle.year')}</td><td>${bAnios}</td></tr>`;
	if (c.paises && c.paises.length)
		rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${c.paises.map(esc).join(', ')}</td></tr>`;
	if (b.bajas) rows += `<tr><td>${i18n.t('battle.casualtiesBattle')}</td><td>${esc(b.bajas)}</td></tr>`;
	if (c.bajas) rows += `<tr><td>${i18n.t('battle.casualties')}</td><td>${esc(c.bajas)}</td></tr>`;
	const desc = [b.descripcion, c.descripcion].filter(Boolean).map(esc).join('<br>');
	const wikiRef = refWiki(b.wiki || b.nombre);
	return `<div class="territory-popup battle-popup" data-wiki="${esc(wikiRef)}"><h3>⚔️ ${esc(b.nombre)}</h3><table>${rows}</table>${desc ? `<p>${desc}</p>` : ''}${fuentesHtml(b.fuentes ? b : c)}${avisoDatoHtml()}</div>`;
}

function eventPopupHtml(ev) {
	const esc = escHtml;
	const years =
		ev.hasta && ev.hasta !== ev.anio
			? `${i18n.formatYear(ev.anio)} – ${i18n.formatYear(ev.hasta)}`
			: i18n.formatYear(ev.anio);
	let rows = `<tr><td>${i18n.t('event.year')}</td><td>${years}</td></tr>`;
	if (ev.paises && ev.paises.length)
		rows += `<tr><td>${i18n.t('battle.countries')}</td><td>${ev.paises.map(esc).join(', ')}</td></tr>`;
	const wikiRef = refWiki(ev.wiki || ev.nombre);
	const ico = ev.categoria === 'invento' ? '💡' : '⭐';
	return `<div class="territory-popup event-popup" data-wiki="${esc(wikiRef)}"><h3>${ico} ${esc(ev.nombre)}</h3><table>${rows}</table>${ev.descripcion ? `<p>${escHtml(ev.descripcion)}</p>` : ''}${fuentesHtml(ev)}${avisoDatoHtml()}</div>`;
}

function territorioPopupHtml(t, color) {
	const esc = escHtml;
	const fin = t.hasta !== undefined && t.hasta !== null ? i18n.formatYear(t.hasta) : i18n.t('terr.present');
	// 'estatus' describe la situación jurídica sin afirmar pertenencia (el país solo da el color)
	let rows = t.estatus
		? `<tr><td>${i18n.t('terr.status')}</td><td>${esc(t.estatus)}</td></tr>`
		: `<tr><td>${i18n.t('popup.partof')}</td><td>${esc(t.pais)}</td></tr>`;
	rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(t.desde)} – ${fin}</td></tr>`;
	const wikiRef = refWiki(t.wiki || t.nombre);
	return `<div class="territory-popup terr-popup" data-wiki="${esc(wikiRef)}"><h3><span class="terr-dot" style="background:${color}"></span> ${esc(t.nombre)}</h3><table>${rows}</table>${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}${fuentesHtml(t)}${avisoDatoHtml()}</div>`;
}
