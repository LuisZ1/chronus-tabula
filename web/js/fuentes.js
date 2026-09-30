/* Chronus Tabula — fuentes.js
   Página de fuentes y referencias (fuentes.html). Lee data/fuentes.json (cifras,
   tipos de dato y obras del registro datos/referencias.json) y, solo cuando se
   abre una de las listas, data/fuentes-listas.json (todos los artículos de
   Wikipedia y elementos de Wikidata citados). Ambos los genera api/compilar.py. */
(function () {
	'use strict';

	// [clave plural, plural, clave singular, singular] (el español es el texto fuente)
	const TIPOS = {
		libro: ['libros', 'Libros', 'libro', 'Libro'],
		articulo: ['articulos', 'Artículos', 'articulo', 'Artículo'],
		mapa: ['mapas', 'Mapas y atlas', 'mapa', 'Mapa'],
		datos: ['datos', 'Bases de datos', 'dato', 'Base de datos'],
		web: ['webs', 'Webs', 'web', 'Web']
	};
	const ICONO = { libro: 'i-libro', articulo: 'i-ficha', mapa: 'i-globo', datos: 'i-marcas', web: 'i-enlace' };
	const IDIOMAS = { es: 'español', en: 'inglés', de: 'alemán', fr: 'francés', it: 'italiano', pt: 'portugués' };
	const PASO = 150; // filas por tanda en las listas largas

	let D = null; // data/fuentes.json (o fuentes.<idioma>.json)
	const lang = () => (window.idioma ? window.idioma.lang : 'es');
	const suf = () => (lang() === 'es' ? '' : '.' + lang());
	const t = (k, es, vars) => (window.idioma ? window.idioma.t('fuentes.js.' + k, es, vars) : es);
	const plural = tp => t(TIPOS[tp][0], TIPOS[tp][1]);
	const nombreIdioma = l => t('idioma.' + l, IDIOMAS[l] || l);
	const estado = { tipo: null, dato: null };

	const $ = s => document.querySelector(s);
	const esc = t =>
		String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
	const num = n => Number(n).toLocaleString(lang() === 'es' ? 'es-ES' : lang());
	const anio = y => (y == null ? '' : y < 0 ? t('ac', '{n} a. C.', { n: -y }) : String(y));
	const sinTildes = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

	/* enlace al mapa en esa ficha y ese año (mapa.html#año/lat/lng/zoom/seguir) */
	function enlaceFicha(f) {
		const [col, id, nombre, y] = f;
		const texto = col === 'mapas' ? t('mapaDe', 'Mapa de {a}', { a: anio(y) }) : nombre || id;
		const hash = y == null ? '' : col === 'paises' ? `#${y}////${encodeURIComponent(id)}` : `#${y}`;
		return `<a href="mapa.html${hash}">${esc(texto)}</a>`;
	}

	function datoEtiqueta(k) {
		return t('dato.' + k, (D.tipos_dato[k] && D.tipos_dato[k].etiqueta) || k);
	}

	/* ---------- cabecera: cifras ---------- */
	function pintarCifras() {
		const r = D.resumen;
		for (const el of document.querySelectorAll('[data-cifra]')) el.textContent = num(r[el.dataset.cifra] ?? 0);
		const langs = Object.entries(r.wikipedia_idiomas)
			.map(([l, n]) => t('enIdioma', '{n} en {idioma}', { n: num(n), idioma: nombreIdioma(l) }))
			.join(', ');
		$('#cifras2').innerHTML = t(
			'resumen',
			'De los artículos, <b>{wp}</b> son de Wikipedia ({langs}){otros}. Además, <b>{datos}</b> bases de datos, <b>{webs}</b> webs y <b>{wd}</b> elementos de Wikidata: <b>{citas}</b> citas en <b>{fichas}</b> fichas y en los mapas de fronteras.',
			{
				wp: num(r.articulos_wikipedia),
				langs: esc(langs),
				otros: r.articulos_otros ? t('resumenOtros', ' y <b>{n}</b> de otras obras', { n: num(r.articulos_otros) }) : '',
				datos: num(r.datos),
				webs: num(r.webs),
				wd: num(r.wikidata),
				citas: num(r.citas),
				fichas: num(r.fichas)
			}
		);
		$('#curado').textContent = t(
			'curado',
			'Cuando un dato se deduce contrastando varias fuentes, se marca como elaboración propia ({n} citas).',
			{ n: num(r.curado) }
		);
		$('#listaWiki summary span').textContent = t('verWiki', 'Consultar los {n} artículos de Wikipedia citados', { n: num(r.articulos_wikipedia) });
		$('#listaWd summary span').textContent = t('verWd', 'Consultar los {n} elementos de Wikidata citados', { n: num(r.wikidata) });
	}

	/* ---------- por tipo de dato ---------- */
	function pintarPorDato() {
		const cont = $('#porDato');
		const orden = Object.entries(D.tipos_dato).filter(([, v]) => v.citas > 0);
		cont.innerHTML = orden
			.map(
				([k, v]) =>
					`<button type="button" class="fu-dato" data-dato="${k}" aria-pressed="false"><b>${num(v.citas)}</b><span>${esc(datoEtiqueta(k))}</span></button>`
			)
			.join('');
		if (cont.dataset.escucha) return;
		cont.dataset.escucha = '1';
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
		const botones = [['', t('todas', 'Todas ({n})', { n: D.obras.length })]].concat(
			Object.keys(TIPOS)
				.filter(tp => cuenta[tp])
				.map(tp => [tp, `${plural(tp)} (${cuenta[tp]})`])
		);
		const cont = $('#filtroTipo');
		cont.innerHTML = botones
			.map(([tp, et]) => `<button type="button" class="fu-filtro" data-tipo="${tp}" aria-pressed="${tp === '' ? 'true' : 'false'}">${esc(et)}</button>`)
			.join('');
		if (cont.dataset.escucha) return;
		cont.dataset.escucha = '1';
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
		const ed = [
			o.traductor && t('trad', 'Trad. de {t}', { t: esc(o.traductor) }),
			o.editorial && esc(o.editorial),
			o.coleccion && t('col', 'col. {c}', { c: esc(o.coleccion) }),
			o.anio && anio(o.anio)
		]
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
			fd.innerHTML = `${t('soloDato', 'Solo las fuentes de <b>{dato}</b>.', { dato: esc(datoEtiqueta(estado.dato)) })} <button type="button" class="fu-quitar">${esc(t('verTodas', 'Ver todas'))}</button>`;
			fd.querySelector('button').addEventListener('click', () => {
				estado.dato = null;
				pintarObras();
			});
		} else fd.hidden = true;

		const lista = D.obras.filter(o => (!estado.tipo || o.tipo === estado.tipo) && (!estado.dato || o.datos.includes(estado.dato)));
		const grupos = Object.keys(TIPOS).filter(tp => lista.some(o => o.tipo === tp));
		let html = '';
		for (const tp of grupos) {
			html += `<h3 class="fu-grupo"><svg class="icono" aria-hidden="true"><use href="#${ICONO[tp]}"/></svg>${esc(plural(tp))}</h3><ul class="fu-refs">`;
			for (const o of lista.filter(x => x.tipo === tp)) {
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
		$('#listaObras').innerHTML = html || `<p class="nota">${esc(t('ninguna', 'No hay obras de ese tipo para este dato.'))}</p>`;
		marcarDestino();
	}

	function usoTexto(o) {
		const mapas = o.fichas.every(f => f[0] === 'mapas');
		if (mapas)
			return o.fichas.length === 1
				? t('usadoMapa', 'Usado en 1 mapa')
				: t('usadoMapas', 'Usado en {n} mapas', { n: num(o.fichas.length) });
		return o.citas === 1 ? t('citadoVez', 'Citado 1 vez') : t('citadoVeces', 'Citado {n} veces', { n: num(o.citas) });
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
		if (!listas) listas = await (await fetch(`data/fuentes-listas${suf()}.json`, { cache: 'no-cache' })).json();
		return listas;
	}

	function montarLista(det) {
		const tipo = det.dataset.lista;
		const cuerpo = det.querySelector('.fu-lista-cuerpo');
		if (cuerpo.dataset.listo) return;
		cuerpo.dataset.listo = '1';
		cuerpo.innerHTML = `<p class="nota">${esc(t('cargandoLista', 'Cargando…'))}</p>`;
		cargarListas().then(L => {
			const filas = L[tipo];
			const langs = tipo === 'wikipedia' ? [...new Set(filas.map(f => f[0]))] : [];
			cuerpo.innerHTML = `
				<div class="fu-buscar">
					<label><svg class="icono" aria-hidden="true"><use href="#i-lupa"/></svg><span class="sr">${esc(t('buscar', 'Buscar'))}</span>
						<input type="search" placeholder="${esc(tipo === 'wikipedia' ? t('buscarArticulo', 'Buscar un artículo…') : t('buscarQid', 'Buscar un Qid o una ficha…'))}"></label>
					${
						langs.length > 1
							? `<select aria-label="${esc(t('idioma', 'Idioma'))}"><option value="">${esc(t('todosIdiomas', 'Todos los idiomas'))}</option>${langs.map(l => `<option value="${l}">${esc(nombreIdioma(l))}</option>`).join('')}</select>`
							: ''
					}
					<select aria-label="${esc(t('tipoDato', 'Tipo de dato'))}" data-f="dato"><option value="">${esc(t('todosDatos', 'Todos los datos'))}</option>${Object.entries(D.tipos_dato)
						.filter(([, v]) => v.citas)
						.map(([k]) => `<option value="${k}">${esc(datoEtiqueta(k))}</option>`)
						.join('')}</select>
					<span class="fu-total" aria-live="polite"></span>
				</div>
				<ol class="fu-filas"></ol>
				<button type="button" class="btn fu-mas" hidden></button>`;
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
					const [l, titulo, n, datos, fichas] = f;
					const url = `https://${l}.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, '_'))}`;
					return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(titulo)}</a> <span class="fu-idioma">${esc(l)}</span><span class="fu-de">${datos
						.map(datoEtiqueta)
						.join(', ')} · ${fichas.map(enlaceFicha).join(', ')}${n > fichas.length ? t('yMas', ' y {n} más', { n: num(n - fichas.length) }) : ''}</span></li>`;
				}
				const [q, n, datos, fichas] = f;
				return `<li><a href="https://www.wikidata.org/wiki/${esc(q)}" target="_blank" rel="noopener">${esc(q)}</a><span class="fu-de">${datos
					.map(datoEtiqueta)
					.join(', ')} · ${fichas.map(enlaceFicha).join(', ')}${n > fichas.length ? t('yMas', ' y {n} más', { n: num(n - fichas.length) }) : ''}</span></li>`;
			};
			const tanda = () => {
				ol.insertAdjacentHTML('beforeend', vista.slice(mostradas, mostradas + PASO).map(fila).join(''));
				mostradas = Math.min(vista.length, mostradas + PASO);
				mas.hidden = mostradas >= vista.length;
				mas.textContent = t('mas', 'Mostrar más (quedan {n})', { n: num(vista.length - mostradas) });
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
				total.textContent = t('deTotal', '{a} de {b}', { a: num(vista.length), b: num(filas.length) });
				tanda();
			};
			let espera;
			inp.addEventListener('input', () => {
				clearTimeout(espera);
				espera = setTimeout(filtrar, 150);
			});
			if (selL) selL.addEventListener('change', filtrar);
			selD.addEventListener('change', filtrar);
			mas.addEventListener('click', tanda);
			filtrar();
		}, () => {
			cuerpo.innerHTML = `<p class="nota">${esc(t('errorLista', 'No se pudo cargar la lista.'))}</p>`;
			delete cuerpo.dataset.listo;
		});
	}

	async function cargar() {
		D = await (await fetch(`data/fuentes${suf()}.json`, { cache: 'no-cache' })).json();
	}

	function pintarTodo() {
		pintarCifras();
		pintarPorDato();
		pintarFiltroTipo();
		pintarObras();
	}

	async function init() {
		for (const det of document.querySelectorAll('.fu-lista')) det.addEventListener('toggle', () => det.open && montarLista(det));
		if (window.idioma) await window.idioma.listo;
		try {
			await cargar();
		} catch (e) {
			$('#listaObras').innerHTML = `<p class="nota">${esc(t('error', 'No se pudo cargar data/fuentes.json.'))}</p>`;
			return;
		}
		pintarTodo();
		window.addEventListener('hashchange', () => {
			for (const el of document.querySelectorAll('.fu-ref.destino')) el.classList.remove('destino');
			marcarDestino();
		});
		// al cambiar de idioma: otros datos (nombres de fichas traducidos), se repinta
		// todo y las listas se vuelven a montar al abrirlas
		let ultimo = lang();
		window.addEventListener('idioma', async () => {
			if (lang() === ultimo) return;
			ultimo = lang();
			listas = null;
			try {
				await cargar();
			} catch (e) {
				return;
			}
			pintarTodo();
			for (const det of document.querySelectorAll('.fu-lista')) {
				const c = det.querySelector('.fu-lista-cuerpo');
				delete c.dataset.listo;
				c.innerHTML = '';
				if (det.open) montarLista(det);
			}
		});
	}

	init();
})();
