/* Chronus Tabula — fuentes.js
   Página de fuentes y referencias (fuentes.html). Lee data/fuentes.json (cifras,
   tipos de dato y obras del registro datos/referencias.json) y, solo cuando se
   abre una de las listas, data/fuentes-listas.json (todos los artículos de
   Wikipedia y elementos de Wikidata citados). Ambos los genera api/compilar.py. */
(function () {
	'use strict';

	const TIPOS = {
		libro: ['Libros', 'Libro'],
		articulo: ['Artículos', 'Artículo'],
		mapa: ['Mapas y atlas', 'Mapa'],
		datos: ['Bases de datos', 'Base de datos'],
		web: ['Webs', 'Web']
	};
	const ICONO = { libro: 'i-libro', articulo: 'i-ficha', mapa: 'i-globo', datos: 'i-marcas', web: 'i-enlace' };
	const IDIOMAS = { es: 'español', en: 'inglés', de: 'alemán', fr: 'francés', it: 'italiano', pt: 'portugués' };
	const PASO = 150; // filas por tanda en las listas largas

	let D = null; // data/fuentes.json
	const estado = { tipo: null, dato: null };

	const $ = s => document.querySelector(s);
	const esc = t =>
		String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
	const num = n => Number(n).toLocaleString('es-ES');
	const anio = y => (y == null ? '' : y < 0 ? `${-y} a. C.` : String(y));
	const sinTildes = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

	/* enlace al mapa en esa ficha y ese año (mapa.html#año/lat/lng/zoom/seguir) */
	function enlaceFicha(f) {
		const [col, id, nombre, y] = f;
		const texto = col === 'mapas' ? `Mapa de ${anio(y)}` : nombre || id;
		const hash = y == null ? '' : col === 'paises' ? `#${y}////${encodeURIComponent(id)}` : `#${y}`;
		return `<a href="mapa.html${hash}">${esc(texto)}</a>`;
	}

	function datoEtiqueta(k) {
		return (D.tipos_dato[k] && D.tipos_dato[k].etiqueta) || k;
	}

	/* ---------- cabecera: cifras ---------- */
	function pintarCifras() {
		const r = D.resumen;
		for (const el of document.querySelectorAll('[data-cifra]')) el.textContent = num(r[el.dataset.cifra] ?? 0);
		const langs = Object.entries(r.wikipedia_idiomas)
			.map(([l, n]) => `${num(n)} en ${IDIOMAS[l] || l}`)
			.join(', ');
		$('#cifras2').innerHTML =
			`De los artículos, <b>${num(r.articulos_wikipedia)}</b> son de Wikipedia (${esc(langs)})` +
			(r.articulos_otros ? ` y <b>${num(r.articulos_otros)}</b> de otras obras` : '') +
			`. Además, <b>${num(r.datos)}</b> bases de datos, <b>${num(r.webs)}</b> webs y <b>${num(r.wikidata)}</b> elementos de Wikidata: ` +
			`<b>${num(r.citas)}</b> citas en <b>${num(r.fichas)}</b> fichas y en los mapas de fronteras.`;
		$('#curado').textContent =
			`Cuando un dato se deduce contrastando varias fuentes, se marca como elaboración propia (${num(r.curado)} citas).`;
		const s1 = $('#listaWiki summary span');
		const s2 = $('#listaWd summary span');
		s1.textContent = `Consultar los ${num(r.articulos_wikipedia)} artículos de Wikipedia citados`;
		s2.textContent = `Consultar los ${num(r.wikidata)} elementos de Wikidata citados`;
	}

	/* ---------- por tipo de dato ---------- */
	function pintarPorDato() {
		const cont = $('#porDato');
		const orden = Object.entries(D.tipos_dato).filter(([, v]) => v.citas > 0);
		cont.innerHTML = orden
			.map(
				([k, v]) =>
					`<button type="button" class="fu-dato" data-dato="${k}" aria-pressed="false"><b>${num(v.citas)}</b><span>${esc(v.etiqueta)}</span></button>`
			)
			.join('');
		cont.addEventListener('click', e => {
			const b = e.target.closest('[data-dato]');
			if (!b) return;
			estado.dato = estado.dato === b.dataset.dato ? null : b.dataset.dato;
			pintarObras();
			if (estado.dato) $('#obras').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		});
	}

	/* ---------- bibliografía ---------- */
	function pintarFiltroTipo() {
		const cuenta = {};
		for (const o of D.obras) cuenta[o.tipo] = (cuenta[o.tipo] || 0) + 1;
		const botones = [['', `Todas (${D.obras.length})`]].concat(
			Object.keys(TIPOS)
				.filter(t => cuenta[t])
				.map(t => [t, `${TIPOS[t][0]} (${cuenta[t]})`])
		);
		const cont = $('#filtroTipo');
		cont.innerHTML = botones
			.map(([t, et]) => `<button type="button" class="fu-filtro" data-tipo="${t}" aria-pressed="${t === '' ? 'true' : 'false'}">${esc(et)}</button>`)
			.join('');
		cont.addEventListener('click', e => {
			const b = e.target.closest('[data-tipo]');
			if (!b) return;
			estado.tipo = b.dataset.tipo || null;
			pintarObras();
		});
	}

	function referencia(o) {
		// cita al estilo de una bibliografía: Autor. Título. Editorial (colección), año. ISBN.
		const partes = [];
		if (o.autor) partes.push(`<span class="fu-autor">${esc(o.autor)}</span>`);
		const titulo = o.url
			? `<a href="${esc(o.url)}" target="_blank" rel="noopener"><cite>${esc(o.titulo)}</cite></a>`
			: `<cite>${esc(o.titulo)}</cite>`;
		partes.push(titulo);
		const ed = [o.traductor && `Trad. de ${esc(o.traductor)}`, o.editorial && esc(o.editorial), o.coleccion && `col. ${esc(o.coleccion)}`, o.anio && anio(o.anio)]
			.filter(Boolean)
			.join(', ');
		if (ed) partes.push(ed);
		if (o.isbn) partes.push(`ISBN ${esc(o.isbn)}`);
		return partes.join('. ') + '.';
	}

	function pintarObras() {
		for (const b of document.querySelectorAll('#filtroTipo [data-tipo]'))
			b.setAttribute('aria-pressed', String((b.dataset.tipo || null) === estado.tipo));
		for (const b of document.querySelectorAll('#porDato [data-dato]'))
			b.setAttribute('aria-pressed', String(b.dataset.dato === estado.dato));
		const fd = $('#filtroDato');
		if (estado.dato) {
			fd.hidden = false;
			fd.innerHTML = `Solo las fuentes de <b>${esc(datoEtiqueta(estado.dato))}</b>. <button type="button" class="fu-quitar">Ver todas</button>`;
			fd.querySelector('button').addEventListener('click', () => {
				estado.dato = null;
				pintarObras();
			});
		} else fd.hidden = true;

		const lista = D.obras.filter(o => (!estado.tipo || o.tipo === estado.tipo) && (!estado.dato || o.datos.includes(estado.dato)));
		const grupos = Object.keys(TIPOS).filter(t => lista.some(o => o.tipo === t));
		let html = '';
		for (const t of grupos) {
			html += `<h3 class="fu-grupo"><svg class="icono" aria-hidden="true"><use href="#${ICONO[t]}"/></svg>${TIPOS[t][0]}</h3><ul class="fu-refs">`;
			for (const o of lista.filter(x => x.tipo === t)) {
				const usos = o.fichas.length
					? `<details class="fu-usos"><summary>${usoTexto(o)}</summary><p>${o.fichas.map(enlaceFicha).join(' · ')}${
							o.citas > o.fichas.length ? ' …' : ''
						}</p></details>`
					: o.uso
						? ''
						: '';
				html += `<li class="fu-ref" id="${esc(o.id)}">
					<p class="fu-cita">${referencia(o)}</p>
					<p class="fu-meta">${o.datos.map(d => `<span class="chip">${esc(datoEtiqueta(d))}</span>`).join(' ')}${
						o.licencia ? ` <span class="fu-lic">${esc(o.licencia)}</span>` : ''
					}</p>
					${o.uso ? `<p class="fu-uso">${esc(o.uso.charAt(0).toUpperCase() + o.uso.slice(1))}.</p>` : ''}
					${o.nota ? `<p class="fu-uso">${esc(o.nota)}.</p>` : ''}
					${usos}
				</li>`;
			}
			html += '</ul>';
		}
		$('#listaObras').innerHTML = html || '<p class="nota">No hay obras de ese tipo para este dato.</p>';
		marcarDestino();
	}

	function usoTexto(o) {
		const mapas = o.fichas.every(f => f[0] === 'mapas');
		if (mapas) return `Usado en ${num(o.fichas.length)} ${o.fichas.length === 1 ? 'mapa' : 'mapas'}`;
		return `Citado ${num(o.citas)} ${o.citas === 1 ? 'vez' : 'veces'}`;
	}

	/* fuentes.html#libro:… (desde las fichas del mapa): resalta esa obra */
	function marcarDestino() {
		const id = decodeURIComponent(location.hash.slice(1));
		if (!id) return;
		let el = document.getElementById(id);
		if (!el && D.obras.some(o => o.id === id) && (estado.tipo || estado.dato)) {
			// la obra está oculta por un filtro: se quitan los filtros para enseñarla
			estado.tipo = estado.dato = null;
			pintarObras();
			return;
		}
		if (el && el.classList.contains('fu-ref')) {
			el.classList.add('destino');
			el.scrollIntoView({ block: 'center' });
		}
	}

	/* ---------- listas completas (a demanda) ---------- */
	let listas = null;
	async function cargarListas() {
		if (!listas) listas = await (await fetch('data/fuentes-listas.json', { cache: 'no-cache' })).json();
		return listas;
	}

	function montarLista(det) {
		const tipo = det.dataset.lista;
		const cuerpo = det.querySelector('.fu-lista-cuerpo');
		if (cuerpo.dataset.listo) return;
		cuerpo.dataset.listo = '1';
		cuerpo.innerHTML = '<p class="nota">Cargando…</p>';
		cargarListas().then(L => {
			const filas = L[tipo];
			const langs = tipo === 'wikipedia' ? [...new Set(filas.map(f => f[0]))] : [];
			cuerpo.innerHTML = `
				<div class="fu-buscar">
					<label><svg class="icono" aria-hidden="true"><use href="#i-lupa"/></svg><span class="sr">Buscar</span>
						<input type="search" placeholder="${tipo === 'wikipedia' ? 'Buscar un artículo…' : 'Buscar un Qid o una ficha…'}"></label>
					${
						langs.length > 1
							? `<select aria-label="Idioma"><option value="">Todos los idiomas</option>${langs.map(l => `<option value="${l}">${esc(IDIOMAS[l] || l)}</option>`).join('')}</select>`
							: ''
					}
					<select aria-label="Tipo de dato" data-f="dato"><option value="">Todos los datos</option>${Object.entries(D.tipos_dato)
						.filter(([, v]) => v.citas)
						.map(([k, v]) => `<option value="${k}">${esc(v.etiqueta)}</option>`)
						.join('')}</select>
					<span class="fu-total" aria-live="polite"></span>
				</div>
				<ol class="fu-filas"></ol>
				<button type="button" class="btn fu-mas" hidden>Mostrar más</button>`;
			const inp = cuerpo.querySelector('input');
			const selL = cuerpo.querySelector('select:not([data-f])');
			const selD = cuerpo.querySelector('select[data-f="dato"]');
			const ol = cuerpo.querySelector('ol');
			const mas = cuerpo.querySelector('.fu-mas');
			const total = cuerpo.querySelector('.fu-total');
			let vista = [];
			let mostradas = 0;
			const fila = f => {
				if (tipo === 'wikipedia') {
					const [l, t, n, datos, fichas] = f;
					const url = `https://${l}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
					return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(t)}</a> <span class="fu-idioma">${esc(l)}</span><span class="fu-de">${datos
						.map(datoEtiqueta)
						.join(', ')} · ${fichas.map(enlaceFicha).join(', ')}${n > fichas.length ? ` y ${num(n - fichas.length)} más` : ''}</span></li>`;
				}
				const [q, n, datos, fichas] = f;
				return `<li><a href="https://www.wikidata.org/wiki/${esc(q)}" target="_blank" rel="noopener">${esc(q)}</a><span class="fu-de">${datos
					.map(datoEtiqueta)
					.join(', ')} · ${fichas.map(enlaceFicha).join(', ')}${n > fichas.length ? ` y ${num(n - fichas.length)} más` : ''}</span></li>`;
			};
			const tanda = () => {
				ol.insertAdjacentHTML('beforeend', vista.slice(mostradas, mostradas + PASO).map(fila).join(''));
				mostradas = Math.min(vista.length, mostradas + PASO);
				mas.hidden = mostradas >= vista.length;
				mas.textContent = `Mostrar más (quedan ${num(vista.length - mostradas)})`;
			};
			const filtrar = () => {
				const q = sinTildes(inp.value.trim());
				const l = selL ? selL.value : '';
				const d = selD.value;
				vista = filas.filter(f => {
					if (tipo === 'wikipedia' && l && f[0] !== l) return false;
					const datos = tipo === 'wikipedia' ? f[3] : f[2];
					if (d && !datos.includes(d)) return false;
					if (!q) return true;
					const fichas = tipo === 'wikipedia' ? f[4] : f[3];
					const texto = (tipo === 'wikipedia' ? f[1] : f[0]) + ' ' + fichas.map(x => x[2] || '').join(' ');
					return sinTildes(texto).includes(q);
				});
				ol.innerHTML = '';
				mostradas = 0;
				total.textContent = `${num(vista.length)} de ${num(filas.length)}`;
				tanda();
			};
			let t;
			inp.addEventListener('input', () => {
				clearTimeout(t);
				t = setTimeout(filtrar, 150);
			});
			if (selL) selL.addEventListener('change', filtrar);
			selD.addEventListener('change', filtrar);
			mas.addEventListener('click', tanda);
			filtrar();
		}, () => {
			cuerpo.innerHTML = '<p class="nota">No se pudo cargar la lista.</p>';
			delete cuerpo.dataset.listo;
		});
	}

	async function init() {
		for (const det of document.querySelectorAll('.fu-lista')) det.addEventListener('toggle', () => det.open && montarLista(det));
		try {
			D = await (await fetch('data/fuentes.json', { cache: 'no-cache' })).json();
		} catch (e) {
			$('#listaObras').innerHTML = '<p class="nota">No se pudo cargar data/fuentes.json.</p>';
			return;
		}
		pintarCifras();
		pintarPorDato();
		pintarFiltroTipo();
		pintarObras();
		window.addEventListener('hashchange', () => {
			for (const el of document.querySelectorAll('.fu-ref.destino')) el.classList.remove('destino');
			marcarDestino();
		});
	}

	init();
})();
