/* Chronus Tabula — fichas.js
   Popups (territorio, conflicto, batalla, evento, territorio menor), fuentes y extractos de Wikipedia.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

/* pie de fuentes de una ficha: plegado, se despliega solo si el lector lo pide */
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
	const y = state.requestedYear;
	const pais = paisFor(props);
	const name = (pais && pais.nombre) || props.NAME || i18n.t('popup.unknown');
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
	if (props.wikipedia) {
		const url = /^https?:/.test(props.wikipedia)
			? props.wikipedia
			: `https://en.wikipedia.org/wiki/${encodeURIComponent(props.wikipedia)}`;
		rows += `<tr><td>${i18n.t('popup.wikipedia')}</td><td><a href="${esc(url)}" target="_blank" rel="noopener">↗</a></td></tr>`;
	}

	// título para el extracto de Wikipedia: preferimos el nombre curado en español
	let wikiRef = '';
	if (pais) wikiRef = 'es:' + (pais.wiki || pais.nombre);
	else if (props.wikipedia && !/^https?:/.test(props.wikipedia)) wikiRef = 'en:' + props.wikipedia;

	return `<div class="territory-popup" data-wiki="${esc(wikiRef)}"><h3>${esc(name)}</h3><table>${rows}</table>${fuentesHtml(pais)}</div>`;
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

function setupWikiOnPopup() {
	map.on('popupopen', async e => {
		const el = e.popup.getElement();
		if (!el) return;
		const box = el.querySelector('[data-wiki]');
		if (!box || !box.dataset.wiki || box.querySelector('.wiki-extract')) return;
		const ref = box.dataset.wiki;
		const info = await fetchWikiSummary(ref);
		if (!info || box.querySelector('.wiki-extract')) return;
		const div = document.createElement('div');
		div.className = 'wiki-extract';
		div.innerHTML = `${info.t ? `<img src="${escHtml(info.t)}" alt="">` : ''}<p>${escHtml(info.e)}${info.u ? ` <a href="${escHtml(info.u)}" target="_blank" rel="noopener">${i18n.t('wiki.more')}</a>` : ''}</p><div class="wiki-src">${i18n.t('wiki.source')}</div>`;
		box.appendChild(div);
		e.popup.update();
	});
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
	const wikiRef = 'es:' + (c.wiki || c.nombre);
	return `<div class="territory-popup war-popup" data-wiki="${esc(wikiRef)}"><h3>🔥 ${esc(c.nombre)}</h3><table>${rows}</table>${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ''}${fuentesHtml(c)}</div>`;
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
	const wikiRef = 'es:' + (b.wiki || b.nombre);
	return `<div class="territory-popup battle-popup" data-wiki="${esc(wikiRef)}"><h3>⚔️ ${esc(b.nombre)}</h3><table>${rows}</table>${desc ? `<p>${desc}</p>` : ''}${fuentesHtml(b.fuentes ? b : c)}</div>`;
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
	const wikiRef = 'es:' + (ev.wiki || ev.nombre);
	const ico = ev.categoria === 'invento' ? '💡' : '⭐';
	return `<div class="territory-popup event-popup" data-wiki="${esc(wikiRef)}"><h3>${ico} ${esc(ev.nombre)}</h3><table>${rows}</table>${ev.descripcion ? `<p>${escHtml(ev.descripcion)}</p>` : ''}${fuentesHtml(ev)}</div>`;
}

function territorioPopupHtml(t, color) {
	const esc = escHtml;
	const fin = t.hasta !== undefined && t.hasta !== null ? i18n.formatYear(t.hasta) : i18n.t('terr.present');
	let rows = `<tr><td>${i18n.t('popup.partof')}</td><td>${esc(t.pais)}</td></tr>`;
	rows += `<tr><td>${i18n.t('battle.period')}</td><td>${i18n.formatYear(t.desde)} – ${fin}</td></tr>`;
	const wikiRef = 'es:' + (t.wiki || t.nombre);
	return `<div class="territory-popup terr-popup" data-wiki="${esc(wikiRef)}"><h3><span class="terr-dot" style="background:${color}"></span> ${esc(t.nombre)}</h3><table>${rows}</table>${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}${fuentesHtml(t)}</div>`;
}
