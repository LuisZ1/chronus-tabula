/* Chronus Tabula — admin-editor.js
   Asistente de edición de fichas del panel de administración.

   Tres pasos: 1) elegir colección y ficha (o crear una nueva), 2) editarla en un
   formulario generado a partir de schema/*.json, 3) revisar el cambio (errores,
   avisos y diff del fichero) y guardarlo. El servidor (api/editor.py) valida,
   escribe datos/<colección>/<fichero>.json en formato canónico y recompila el
   mapa, así que nadie tiene que tocar el JSON a mano.

   Usa del panel (admin.html): la variable global `token`, mostrarLogin() y esc(). */
(function () {
	'use strict';

	const COLS = [
		{ id: 'paises', et: 'Países', uno: 'país' },
		{ id: 'conflictos', et: 'Conflictos', uno: 'conflicto' },
		{ id: 'eventos', et: 'Eventos', uno: 'evento' },
		{ id: 'territorios', et: 'Territorios', uno: 'territorio' }
	];
	const LARGOS = new Set(['resena', 'descripcion']); // cuadro de texto amplio
	const HOY = new Date().toISOString().slice(0, 10);
	// etiquetas legibles para las claves del esquema (el resto se muestra tal cual)
	const ETIQ = {
		id: 'Identificador', nombre: 'Nombre', nombres: 'Nombres en los mapas (GeoJSON)',
		nombres_periodo: 'Nombres por época', wiki: 'Artículo de Wikipedia', wikidata: 'Wikidata (Qid)',
		wikidata_hist: 'Wikidata de entidades predecesoras', owid: 'Our World in Data',
		relacionados: 'Relacionados y alias', vinculos: 'Vínculos con otras fichas', resena: 'Reseña', gobernantes: 'Gobernantes',
		poblacion: 'Población', escudos: 'Escudos', banderas: 'Banderas', fuentes: 'Fuentes',
		inicio: 'Inicio', fin: 'Fin', paises: 'Países / bandos', bajas: 'Bajas', descripcion: 'Descripción',
		zonas: 'Zonas de guerra', batallas: 'Batallas', anio: 'Año', hasta: 'Hasta', desde: 'Desde',
		categoria: 'Categoría', lat: 'Latitud', lng: 'Longitud', pais: 'País al que pertenece',
		estatus: 'Estatus', poligono: 'Polígono', cargo: 'Cargo', titulo: 'Título', valor: 'Valor',
		fuente: 'Fuente', archivo: 'Fichero de Wikimedia Commons', url: 'URL', licencia: 'Licencia',
		consultado: 'Consultado', tipo: 'Tipo', mar: 'Teatro naval/aéreo', color: 'Color'
	};

	let esquemas = null;
	let col = 'paises';
	let lista = [];
	let nombresPaises = [];
	let actual = null; // { fichero|null, version|null }
	let original = null; // registro tal como se abrió (para detectar cambios)
	let trabajo = null; // registro en edición
	let idManual = false; // en altas, el id sigue al nombre hasta que se toca a mano
	let validacion = null;

	const $e = s => document.querySelector(s);
	const clonar = o => JSON.parse(JSON.stringify(o));
	const sucio = () => trabajo && JSON.stringify(trabajo) !== JSON.stringify(original);
	// 'paises' son bandos en un conflicto; en eventos, simplemente los países implicados
	const etiqueta = k => (k === 'paises' && col !== 'conflictos' ? 'Países' : ETIQ[k] || k);
	const slug = t =>
		String(t || '')
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

	/* --- API: como api() del panel, pero devuelve también el cuerpo de los errores
	   (una validación fallida trae la lista de errores y el diff) --- */
	async function llamar(ruta, cuerpo) {
		const op = { headers: token ? { Authorization: 'Bearer ' + token } : {} };
		if (cuerpo !== undefined) {
			op.method = 'POST';
			op.headers['Content-Type'] = 'application/json';
			op.body = JSON.stringify(cuerpo);
		}
		const r = await fetch(ruta, op);
		const datos = await r.json().catch(() => ({}));
		if (r.status === 401) {
			mostrarLogin(false);
			throw new Error('sesión caducada');
		}
		return { ok: r.ok, status: r.status, datos };
	}

	/* --- paso 1: colección y ficha --- */
	function irPaso(n) {
		[1, 2, 3].forEach(i => {
			$e('#edPaso' + i).hidden = i !== n;
			$e('#edPasos li:nth-child(' + i + ')').classList.toggle('on', i === n);
			$e('#edPasos li:nth-child(' + i + ')').classList.toggle('hecho', i < n);
		});
	}

	function pintarColecciones() {
		const box = $e('#edCols');
		box.innerHTML = COLS.map(
			c => `<button type="button" data-col="${c.id}" class="${c.id === col ? 'on' : ''}">${c.et}</button>`
		).join('');
		box.querySelectorAll('button').forEach(b =>
			b.addEventListener('click', () => {
				col = b.dataset.col;
				pintarColecciones();
				cargarLista();
			})
		);
		$e('#edNueva').textContent = '+ Nuevo ' + COLS.find(c => c.id === col).uno;
	}

	async function cargarLista() {
		$e('#edLista').innerHTML = '<div class="vacio">Cargando…</div>';
		const r = await llamar('/api/fichas/' + col);
		lista = r.ok ? r.datos : [];
		pintarLista();
	}

	function pintarLista() {
		const q = slug($e('#edBuscar').value);
		const hits = lista.filter(f => !q || slug(f.titulo + ' ' + f.detalle + ' ' + f.fichero).includes(q));
		const max = 150;
		$e('#edCuenta').textContent = `${hits.length} de ${lista.length}`;
		$e('#edLista').innerHTML =
			hits
				.slice(0, max)
				.map(
					f =>
						`<button type="button" class="ed-fila${f.roto ? ' roto' : ''}" data-f="${esc(f.fichero)}">` +
						`<b>${esc(f.titulo)}</b><span>${esc(f.detalle)}</span><code>${esc(f.fichero)}</code></button>`
				)
				.join('') +
			(hits.length > max ? `<div class="vacio">…y ${hits.length - max} más: afina la búsqueda.</div>` : '') +
			(hits.length ? '' : '<div class="vacio">Ninguna ficha coincide.</div>');
		$e('#edLista')
			.querySelectorAll('.ed-fila')
			.forEach(b => b.addEventListener('click', () => abrir(b.dataset.f)));
	}

	async function abrir(fichero) {
		const r = await llamar(`/api/fichas/${col}/${encodeURIComponent(fichero)}`);
		if (!r.ok) return alertaPaso1(r.datos.error || 'No se pudo abrir la ficha');
		actual = { fichero: r.datos.fichero, version: r.datos.version };
		original = r.datos.registro;
		trabajo = clonar(original);
		entrantesActual = r.datos.entrantes || [];
		idManual = true;
		empezarEdicion();
	}

	function nueva() {
		actual = { fichero: null, version: null };
		original = {};
		trabajo = {};
		entrantesActual = [];
		idManual = false;
		empezarEdicion();
	}

	function alertaPaso1(msg) {
		$e('#edLista').insertAdjacentHTML('afterbegin', `<div class="ed-msg mal">${esc(msg)}</div>`);
	}

	/* --- paso 2: formulario generado desde el esquema --- */
	function empezarEdicion() {
		const c = COLS.find(x => x.id === col);
		$e('#edTitulo').textContent = actual.fichero
			? `${trabajo.nombre || trabajo.id || actual.fichero}`
			: `Nuevo ${c.uno}`;
		$e('#edFichero').textContent = actual.fichero ? `datos/${col}/${actual.fichero}` : 'fichero nuevo';
		pintarFormulario();
		irPaso(2);
		window.scrollTo({ top: $e('#editor').offsetTop - 10 });
	}

	function pintarFormulario() {
		const sch = esquemas[col];
		const form = $e('#edForm');
		form.innerHTML = '';
		const props = sch.properties || {};
		const req = sch.required || [];
		for (const [k, s] of Object.entries(props)) {
			if (k === 'lng' && props.lat) continue; // va junto a lat
			if (k === 'revision') {
				if (trabajo.revision) form.appendChild(infoRevision(trabajo.revision));
				continue;
			}
			form.appendChild(bloque(trabajo, k, s, req.includes(k), props));
		}
		const extra = Object.keys(trabajo).filter(k => !(k in props));
		if (extra.length)
			form.insertAdjacentHTML(
				'beforeend',
				`<p class="mini">Campos fuera del esquema que se conservan tal cual: <code>${extra.map(esc).join('</code>, <code>')}</code></p>`
			);
	}

	function infoRevision(rev) {
		const d = document.createElement('div');
		d.className = 'ed-campo ed-rev';
		d.innerHTML =
			`<label>Marca de revisión</label><div class="mini">${esc(rev.estado || '?')} · ${esc(rev.fecha || '')}` +
			(rev.por ? ` · ${esc(rev.por)}` : '') +
			'. Si cambias gobernantes, población o nombres por época de una ficha validada, pasará a «borrador».</div>';
		return d;
	}

	function bloque(obj, k, s, requerido, hermanos) {
		const d = document.createElement('div');
		d.className = 'ed-campo';
		const esLista = [].concat(s.type || []).includes('array') && s.items && s.items.type === 'object';
		if (k === 'lat' && hermanos && hermanos.lng) {
			d.appendChild(cabecera('Coordenadas', requerido, 'Latitud y longitud en grados decimales. Pincha en el mapa para elegirlas.'));
			d.appendChild(coordenadas(obj));
			return d;
		}
		if (k === 'vinculos' && col === 'paises' && obj === trabajo) return bloqueVinculos(obj, s);
		if (esLista) {
			d.appendChild(listaObjetos(obj, k, s, requerido));
			return d;
		}
		d.appendChild(cabecera(etiqueta(k), requerido, s.description));
		d.appendChild(control(obj, k, s));
		return d;
	}

	function cabecera(texto, requerido, ayuda) {
		const f = document.createDocumentFragment();
		const l = document.createElement('label');
		l.innerHTML = esc(texto) + (requerido ? ' <span class="req" title="obligatorio">*</span>' : '');
		f.appendChild(l);
		if (ayuda) {
			const a = document.createElement('div');
			a.className = 'ed-ayuda';
			a.textContent = ayuda;
			f.appendChild(a);
		}
		return f;
	}

	function cambiar(obj, k, v) {
		if (v === '' || v === undefined || (Array.isArray(v) && !v.length)) delete obj[k];
		else obj[k] = v;
		marcarCambios();
	}

	function marcarCambios() {
		$e('#edCambios').textContent = sucio() ? '● cambios sin guardar' : '';
		// punto en la pestaña del panel: se ve aunque estés en otra pestaña
		const tab = $e('#tb-editor');
		if (tab) tab.classList.toggle('sucio', !!sucio());
	}

	/* un control para un valor escalar, lista de textos o JSON libre */
	function control(obj, k, s) {
		const tipos = [].concat(s.type || []);
		const v = obj[k];
		let el;
		if (s.enum) {
			el = document.createElement('select');
			el.innerHTML =
				'<option value="">—</option>' + s.enum.map(o => `<option>${esc(o)}</option>`).join('');
			el.value = v == null ? '' : v;
			el.addEventListener('change', () => cambiar(obj, k, el.value));
		} else if (tipos.includes('array') && s.items && s.items.type === 'string') {
			el = document.createElement('textarea');
			el.rows = Math.min(8, Math.max(2, (v || []).length + 1));
			el.placeholder = 'uno por línea';
			el.value = (v || []).join('\n');
			el.addEventListener('input', () =>
				cambiar(obj, k, el.value.split('\n').map(x => x.trim()).filter(Boolean))
			);
		} else if (tipos.includes('boolean')) {
			el = document.createElement('input');
			el.type = 'checkbox';
			el.checked = !!v;
			el.addEventListener('change', () => cambiar(obj, k, el.checked ? true : undefined));
		} else if (tipos.includes('integer') || tipos.includes('number')) {
			el = document.createElement('input');
			el.type = 'number';
			el.step = tipos.includes('integer') ? '1' : 'any';
			if (s.minimum != null) el.min = s.minimum;
			if (s.maximum != null) el.max = s.maximum;
			el.value = v == null ? '' : v;
			if (/año/i.test(s.description || '') || ['desde', 'hasta', 'anio', 'inicio', 'fin'].includes(k))
				el.placeholder = 'año (negativo = a. C.)';
			el.addEventListener('input', () => {
				const n = el.value === '' ? undefined : Number(el.value);
				cambiar(obj, k, Number.isNaN(n) ? el.value : n);
			});
		} else if (tipos.includes('string') || !tipos.length) {
			el = document.createElement(LARGOS.has(k) ? 'textarea' : 'input');
			if (LARGOS.has(k)) el.rows = 3;
			el.value = v == null ? '' : v;
			if (k === 'pais' && col === 'territorios') el.setAttribute('list', 'edPaisesList');
			if (k === 'consultado') el.placeholder = 'AAAA-MM-DD';
			if (s.pattern === '^Q[0-9]+$') el.placeholder = 'Q…';
			el.addEventListener('input', () => {
				cambiar(obj, k, el.value);
				if (k === 'nombre' && obj === trabajo) seguirNombre();
			});
			if (k === 'id' && obj === trabajo) {
				el.id = 'edId';
				if (actual.fichero && (col === 'paises' || col === 'conflictos')) {
					el.readOnly = true;
					el.title = 'El id da nombre al fichero: no se cambia desde aquí';
				} else el.addEventListener('input', () => (idManual = true));
			}
		} else {
			el = jsonLibre(obj, k);
		}
		return el;
	}

	/* en altas de países/conflictos, el id se propone a partir del nombre */
	function seguirNombre() {
		if (actual.fichero || idManual || !(col === 'paises' || col === 'conflictos')) return;
		const id = slug(trabajo.nombre);
		const el = $e('#edId');
		if (el) el.value = id;
		cambiar(trabajo, 'id', id);
	}

	/* polígonos y cualquier estructura sin formulario propio: JSON validado al vuelo */
	function jsonLibre(obj, k) {
		const box = document.createElement('div');
		const ta = document.createElement('textarea');
		ta.className = 'ed-json';
		ta.rows = 4;
		ta.value = obj[k] == null ? '' : JSON.stringify(obj[k]);
		ta.placeholder = k === 'poligono' ? '[[lat, lng], [lat, lng], [lat, lng], …]' : 'JSON';
		const msg = document.createElement('div');
		msg.className = 'ed-ayuda';
		ta.addEventListener('input', () => {
			if (!ta.value.trim()) {
				msg.textContent = '';
				return cambiar(obj, k, undefined);
			}
			try {
				cambiar(obj, k, JSON.parse(ta.value));
				ta.classList.remove('mal');
				msg.textContent = '';
			} catch (e) {
				ta.classList.add('mal');
				msg.textContent = 'JSON no válido todavía: ' + e.message;
			}
		});
		box.append(ta, msg);
		return box;
	}

	/* lista de objetos (gobernantes, población, batallas, fuentes…): filas editables */
	function listaObjetos(obj, k, s, requerido) {
		const det = document.createElement('details');
		det.className = 'ed-lista';
		const items = obj[k] || [];
		det.open = items.length <= 6;
		const sum = document.createElement('summary');
		const pintarSum = () => {
			const n = (obj[k] || []).length;
			sum.innerHTML =
				`<b>${esc(etiqueta(k))}</b>${requerido ? ' <span class="req">*</span>' : ''} <span class="mini">(${n})</span>`;
		};
		pintarSum();
		det.appendChild(sum);
		if (s.description) {
			const a = document.createElement('div');
			a.className = 'ed-ayuda';
			a.textContent = s.description;
			det.appendChild(a);
		}
		const cuerpo = document.createElement('div');
		det.appendChild(cuerpo);
		const sub = s.items.properties || {};
		const subReq = s.items.required || [];
		const pintar = () => {
			cuerpo.innerHTML = '';
			const arr = obj[k] || [];
			arr.forEach((it, i) => {
				const fila = document.createElement('div');
				fila.className = 'ed-item';
				for (const [sk, ss] of Object.entries(sub)) {
					if (sk === 'lng' && sub.lat) continue;
					const c = document.createElement('div');
					c.className = 'ed-sub' + (sk === 'poligono' || LARGOS.has(sk) ? ' ancho' : '');
					if (sk === 'lat' && sub.lng) {
						c.classList.add('coord');
						c.appendChild(cabecera('Coordenadas', subReq.includes('lat')));
						c.appendChild(coordenadas(it));
					} else {
						c.appendChild(cabecera(etiqueta(sk), subReq.includes(sk)));
						c.appendChild(control(it, sk, ss));
					}
					fila.appendChild(c);
				}
				const acc = document.createElement('div');
				acc.className = 'ed-acc';
				acc.innerHTML =
					`<button type="button" class="sec" data-a="subir" title="Subir"${i ? '' : ' disabled'}>↑</button>` +
					`<button type="button" class="sec" data-a="bajar" title="Bajar"${i < arr.length - 1 ? '' : ' disabled'}>↓</button>` +
					'<button type="button" class="peligro" data-a="quitar" title="Quitar">✕</button>';
				acc.addEventListener('click', ev => {
					const a = ev.target.closest('button') && ev.target.closest('button').dataset.a;
					if (!a) return;
					if (a === 'quitar') arr.splice(i, 1);
					else {
						const j = a === 'subir' ? i - 1 : i + 1;
						[arr[i], arr[j]] = [arr[j], arr[i]];
					}
					if (!arr.length) delete obj[k];
					marcarCambios();
					pintar();
					pintarSum();
				});
				fila.appendChild(acc);
				cuerpo.appendChild(fila);
			});
			const mas = document.createElement('button');
			mas.type = 'button';
			mas.className = 'sec ed-mas';
			mas.textContent = '+ Añadir';
			mas.addEventListener('click', () => {
				if (!obj[k]) obj[k] = [];
				obj[k].push(k === 'fuentes' ? { consultado: HOY } : {});
				marcarCambios();
				pintar();
				pintarSum();
				const filas = cuerpo.querySelectorAll('.ed-item');
				const ult = filas[filas.length - 1];
				if (ult) ult.querySelector('input, textarea, select').focus();
			});
			cuerpo.appendChild(mas);
			if (['gobernantes', 'poblacion', 'nombres_periodo', 'escudos', 'banderas', 'batallas'].includes(k))
				cuerpo.insertAdjacentHTML(
					'beforeend',
					'<span class="mini"> Al guardar se ordena cronológicamente.</span>'
				);
		};
		pintar();
		return det;
	}

	/* --- vínculos entre países (predecesor, sucesor, parte de, incluye) ---
	   Se elige la otra ficha de una lista (no se escribe su nombre a mano), el
	   servidor escribe el inverso en ella al guardar, y aquí se ve de antemano qué
	   se resaltará al seguir esta entidad en el mapa. */
	const TIPOS_VINC = [
		{ id: 'predecesor', et: 'Predecesor', ayuda: 'esta hereda su Estado, dinastía o instituciones' },
		{ id: 'sucesor', et: 'Sucesor', ayuda: 'heredó el Estado de esta' },
		{ id: 'parte_de', et: 'Parte de', ayuda: 'esta formaba parte de la otra' },
		{ id: 'incluye', et: 'Incluye', ayuda: 'la otra (territorio, colonia, reino) formaba parte de esta' },
		{ id: 'antecesor_territorial', et: 'Antecesor territorial', ayuda: 'gobernó antes este territorio, sin continuidad de Estado' },
		{ id: 'sucesor_territorial', et: 'Sucesor territorial', ayuda: 'gobernó después este territorio, sin continuidad de Estado' }
	];
	const INVERSO_VINC = {
		predecesor: 'sucesor',
		sucesor: 'predecesor',
		parte_de: 'incluye',
		incluye: 'parte_de',
		antecesor_territorial: 'sucesor_territorial',
		sucesor_territorial: 'antecesor_territorial'
	};
	let entidades = []; // [{id, nombre, vinculos, relacionados, nombres, lapso}]
	let entPorId = new Map();
	let entrantesActual = []; // vínculos que otras fichas declaran hacia la abierta

	const normE = t =>
		String(t || '')
			.toLowerCase()
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.trim();
	const nombreEnt = id => (entPorId.get(id) || {}).nombre || id;
	const anioTxt = y => (y == null ? '' : y < 0 ? `${-y} a. C.` : String(y));

	async function cargarEntidades() {
		const r = await llamar('/api/fichas/_entidades');
		if (!r.ok) return;
		entidades = r.datos;
		entPorId = new Map(entidades.map(e => [e.id, e]));
		const dl = $e('#edEntidadesList');
		if (dl)
			dl.innerHTML = entidades
				.map(e => `<option value="${esc(e.id)}">${esc(e.nombre)}${e.lapso ? ` · ${anioTxt(e.lapso[0])}–${anioTxt(e.lapso[1])}` : ''}</option>`)
				.join('');
	}

	/* la misma prioridad que el buscador del mapa: nombre, partes «A / B», id, nombres, nombres por época */
	function resolverEnt(texto, excluir) {
		const v = normE(texto);
		if (!v) return null;
		const ps = entidades.filter(e => e.id !== excluir);
		const pruebas = [
			e => normE(e.nombre) === v,
			e => String(e.nombre || '').split('/').some(x => normE(x) === v),
			e => e.id === v,
			e => (e.nombres || []).some(x => normE(x) === v)
		];
		for (const p of pruebas) {
			const hits = ps.filter(p);
			if (hits.length === 1) return hits[0].id;
			if (hits.length > 1) return null;
		}
		return null;
	}

	/* tipo probable según los años en que ambas salen en los mapas (igual que api/vincular.py) */
	function sugerirTipo(propio, otro) {
		if (!propio || !otro) return 'predecesor';
		const [a1, b1] = propio;
		const [a2, b2] = otro;
		if (a2 < a1) return b2 >= b1 ? 'parte_de' : 'predecesor';
		if (a2 > a1) return b2 <= b1 ? 'incluye' : 'sucesor';
		return 'predecesor';
	}

	/* entidades que se resaltan al seguir esta: ella, sus predecesores y lo que
	   incluye, en cadena (como seguidas() en js/datos.js) */
	function cierreSeguimiento(idPropio, propios, tipos = ['predecesor', 'incluye']) {
		const vinc = id => (id === idPropio ? propios : (entPorId.get(id) || {}).vinculos || []);
		const vistos = new Set([idPropio]);
		const cola = [idPropio];
		while (cola.length) {
			const id = cola.shift();
			for (const v of vinc(id)) {
				if (tipos.includes(v.tipo) && v.id && !vistos.has(v.id)) {
					vistos.add(v.id);
					cola.push(v.id);
				}
			}
		}
		vistos.delete(idPropio);
		return [...vistos];
	}

	function bloqueVinculos(obj, s) {
		const d = document.createElement('div');
		d.className = 'ed-campo ed-vinc';
		d.appendChild(
			cabecera(
				'Vínculos con otras fichas',
				false,
				'Elige la otra entidad de la lista y qué relación tiene con esta. Al guardar se escribe también el vínculo inverso en la otra ficha. Los años son opcionales: acotan cuándo vale el vínculo.'
			)
		);
		const cuerpo = document.createElement('div');
		d.appendChild(cuerpo);
		const pintar = () => {
			cuerpo.innerHTML = '';
			const arr = obj.vinculos || [];
			arr.forEach((v, i) => cuerpo.appendChild(filaVinculo(obj, v, i, pintar)));
			const mas = document.createElement('button');
			mas.type = 'button';
			mas.className = 'sec ed-mas';
			mas.textContent = '+ Añadir vínculo';
			mas.addEventListener('click', () => {
				if (!obj.vinculos) obj.vinculos = [];
				obj.vinculos.push({ tipo: 'predecesor' });
				marcarCambios();
				pintar();
				const ins = cuerpo.querySelectorAll('.ed-vfila input[list]');
				if (ins.length) ins[ins.length - 1].focus();
			});
			cuerpo.appendChild(mas);
			cuerpo.appendChild(sugerencias(obj, pintar));
			cuerpo.appendChild(resumen(obj));
		};
		pintar();
		return d;
	}

	function filaVinculo(obj, v, i, repintar) {
		const fila = document.createElement('div');
		fila.className = 'ed-item ed-vfila';
		// la otra ficha
		const c1 = document.createElement('div');
		c1.className = 'ed-sub ancho';
		c1.appendChild(cabecera('Otra ficha', true));
		const inp = document.createElement('input');
		inp.setAttribute('list', 'edEntidadesList');
		inp.placeholder = 'escribe para buscar: Castilla, Aragón…';
		inp.value = v.id || '';
		const nom = document.createElement('div');
		nom.className = 'ed-ayuda ed-vnom';
		const pintarNom = () => {
			if (!v.id) nom.textContent = '';
			else if (v.id === obj.id) nom.innerHTML = '<span class="mal-txt">no puede ser la propia ficha</span>';
			else if (entPorId.has(v.id)) nom.textContent = nombreEnt(v.id);
			else nom.innerHTML = '<span class="mal-txt">no hay ninguna ficha con ese id</span>';
		};
		inp.addEventListener('change', () => {
			const t = inp.value.trim();
			const id = entPorId.has(t) ? t : resolverEnt(t, obj.id) || slug(t);
			v.id = id || undefined;
			if (!v.id) delete v.id;
			inp.value = v.id || '';
			// al elegir la ficha, proponer el tipo según los años de ambas
			if (v.id && !v._tipoTocado && entPorId.has(v.id)) {
				const yo = entPorId.get(obj.id);
				v.tipo = sugerirTipo(yo && yo.lapso, entPorId.get(v.id).lapso);
				sel.value = v.tipo;
			}
			pintarNom();
			marcarCambios();
			refrescarResumen(fila);
		});
		pintarNom();
		c1.append(inp, nom);
		// tipo
		const c2 = document.createElement('div');
		c2.className = 'ed-sub ancho';
		c2.appendChild(cabecera('Relación', true));
		const sel = document.createElement('select');
		sel.innerHTML = TIPOS_VINC.map(t => `<option value="${t.id}">${t.et}: ${esc(t.ayuda)}</option>`).join('');
		sel.value = v.tipo || 'predecesor';
		sel.addEventListener('change', () => {
			v.tipo = sel.value;
			v._tipoTocado = true;
			marcarCambios();
			refrescarResumen(fila);
		});
		c2.appendChild(sel);
		// años
		const anio = k => {
			const c = document.createElement('div');
			c.className = 'ed-sub';
			c.appendChild(cabecera(k === 'desde' ? 'Desde' : 'Hasta', false));
			const el = document.createElement('input');
			el.type = 'number';
			el.step = '1';
			el.placeholder = 'año (opcional)';
			el.value = v[k] == null ? '' : v[k];
			el.addEventListener('input', () => {
				if (el.value === '') delete v[k];
				else v[k] = Number(el.value);
				marcarCambios();
			});
			c.appendChild(el);
			return c;
		};
		const acc = document.createElement('div');
		acc.className = 'ed-acc';
		acc.innerHTML = '<button type="button" class="peligro" title="Quitar este vínculo (también se quita el inverso)">Quitar</button>';
		acc.querySelector('button').addEventListener('click', () => {
			obj.vinculos.splice(i, 1);
			if (!obj.vinculos.length) delete obj.vinculos;
			marcarCambios();
			repintar();
		});
		fila.append(c1, c2, anio('desde'), anio('hasta'), acc);
		return fila;
	}

	/* atajos: vínculos que otras fichas ya declaran, y 'relacionados' que son otra ficha */
	function sugerencias(obj, repintar) {
		const box = document.createElement('div');
		box.className = 'ed-sug';
		const tiene = id => (obj.vinculos || []).some(v => v.id === id);
		const items = [];
		for (const e of entrantesActual) {
			if (tiene(e.id)) continue;
			items.push({
				texto: `<b>${esc(e.nombre)}</b> ya dice que esta ficha es su ${esc(INVERSO_VINC[e.tipo] || e.tipo)}`,
				boton: `Añadir como ${TIPOS_VINC.find(t => t.id === e.tipo).et.toLowerCase()}`,
				hacer: () => {
					const v = { id: e.id, tipo: e.tipo };
					if (e.desde != null) v.desde = e.desde;
					if (e.hasta != null) v.hasta = e.hasta;
					(obj.vinculos = obj.vinculos || []).push(v);
				}
			});
		}
		const yo = entPorId.get(obj.id);
		for (const n of obj.relacionados || []) {
			const id = resolverEnt(n, obj.id);
			if (!id || tiene(id)) continue;
			const tipo = sugerirTipo(yo && yo.lapso, (entPorId.get(id) || {}).lapso);
			items.push({
				texto: `«${esc(n)}», en <i>Relacionados y alias</i>, es la ficha <b>${esc(nombreEnt(id))}</b>`,
				boton: `Vincular como ${TIPOS_VINC.find(t => t.id === tipo).et.toLowerCase()}`,
				hacer: () => {
					(obj.vinculos = obj.vinculos || []).push({ id, tipo });
					obj.relacionados = obj.relacionados.filter(x => x !== n);
					if (!obj.relacionados.length) delete obj.relacionados;
					// el cuadro de 'relacionados' también cambia: repintar el formulario entero
					setTimeout(pintarFormulario, 0);
				}
			});
		}
		if (!items.length) return box;
		box.innerHTML = `<div class="ed-ayuda"><b>Sugerencias</b> (revisa la relación después de añadirlas)</div>`;
		for (const it of items) {
			const f = document.createElement('div');
			f.className = 'ed-sug-fila';
			f.innerHTML = `<span>${it.texto}</span>`;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'sec';
			b.textContent = it.boton;
			b.addEventListener('click', () => {
				it.hacer();
				marcarCambios();
				repintar();
			});
			f.appendChild(b);
			box.appendChild(f);
		}
		return box;
	}

	function resumen(obj) {
		const p = document.createElement('div');
		p.className = 'ed-vres mini';
		const validos = (obj.vinculos || []).filter(v => v.id && entPorId.has(v.id) && v.id !== obj.id);
		const seg = cierreSeguimiento(obj.id || '(nueva)', validos);
		const partes = [];
		partes.push(
			seg.length
				? `Al seguir <b>${esc(obj.nombre || 'esta ficha')}</b> en el mapa se resaltarán también: ${seg.map(id => esc(nombreEnt(id))).join(', ')}.`
				: `Al seguir <b>${esc(obj.nombre || 'esta ficha')}</b> en el mapa solo se resaltarán sus propios territorios: añade predecesores o lo que incluye para seguir su historia completa.`
		);
		const ter = cierreSeguimiento(obj.id || '(nueva)', validos, ['predecesor', 'incluye', 'antecesor_territorial']).filter(
			id => !seg.includes(id)
		);
		if (ter.length)
			partes.push(
				`Con la opción «Seguir antecesores territoriales» del mapa, también: ${ter.map(id => esc(nombreEnt(id))).join(', ')}.`
			);
		if (validos.length)
			partes.push(
				'Al guardar, cada ficha vinculada recibirá el inverso: ' +
					validos.map(v => `${esc(nombreEnt(v.id))} la tendrá como <i>${esc((TIPOS_VINC.find(t => t.id === INVERSO_VINC[v.tipo]) || {}).et || '?').toLowerCase()}</i>`).join(' · ') +
					'.'
			);
		p.innerHTML = partes.join('<br>');
		return p;
	}

	function refrescarResumen(fila) {
		const box = fila.closest('.ed-vinc');
		const viejo = box && box.querySelector('.ed-vres');
		if (viejo) viejo.replaceWith(resumen(trabajo));
	}

	/* lat/lng con selector en un mapa */
	function coordenadas(obj) {
		const box = document.createElement('div');
		box.className = 'ed-coord';
		const mk = k => {
			const el = document.createElement('input');
			el.type = 'number';
			el.step = 'any';
			el.placeholder = k === 'lat' ? 'lat' : 'lng';
			el.value = obj[k] == null ? '' : obj[k];
			el.addEventListener('input', () => cambiar(obj, k, el.value === '' ? undefined : Number(el.value)));
			return el;
		};
		const la = mk('lat');
		const ln = mk('lng');
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'sec';
		b.textContent = 'Elegir en el mapa';
		b.addEventListener('click', () =>
			elegirEnMapa(obj.lat, obj.lng, (lat, lng) => {
				la.value = lat;
				ln.value = lng;
				obj.lat = lat;
				obj.lng = lng;
				marcarCambios();
			})
		);
		box.append(la, ln, b);
		return box;
	}

	let mapa = null;
	let marca = null;
	function elegirEnMapa(lat, lng, listo) {
		if (typeof L === 'undefined') return alert('No se ha cargado Leaflet (web/lib/leaflet).');
		const modal = $e('#edMapaModal');
		modal.hidden = false;
		let sel = typeof lat === 'number' && typeof lng === 'number' ? [lat, lng] : null;
		if (!mapa) {
			mapa = L.map('edMapa', { worldCopyJump: true }).setView([30, 10], 2);
			L.tileLayer(
				'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
				{ maxZoom: 16, attribution: 'Esri' }
			).addTo(mapa);
		}
		const poner = ll => {
			sel = [Math.round(ll[0] * 1e4) / 1e4, Math.round((((ll[1] + 540) % 360) - 180) * 1e4) / 1e4];
			if (marca) marca.setLatLng(sel);
			else marca = L.marker(sel).addTo(mapa);
			$e('#edMapaSel').textContent = `${sel[0]}, ${sel[1]}`;
		};
		mapa.off('click');
		mapa.on('click', e => poner([e.latlng.lat, e.latlng.lng]));
		if (marca) {
			marca.remove();
			marca = null;
		}
		$e('#edMapaSel').textContent = 'pincha en el mapa';
		setTimeout(() => {
			mapa.invalidateSize();
			if (sel) {
				poner(sel);
				mapa.setView(sel, 6);
			}
		}, 0);
		$e('#edMapaOk').onclick = () => {
			if (sel) listo(sel[0], sel[1]);
			modal.hidden = true;
		};
		$e('#edMapaNo').onclick = () => (modal.hidden = true);
	}

	/* --- paso 3: revisar (validación + diff) y guardar --- */
	async function revisar() {
		irPaso(3);
		$e('#edResultado').innerHTML = '<div class="vacio">Validando…</div>';
		$e('#edDiff').textContent = '';
		$e('#edGuardar').disabled = true;
		const r = await llamar('/api/fichas/_validar', {
			coleccion: col,
			registro: trabajo,
			fichero: actual.fichero
		});
		if (!r.ok) {
			$e('#edResultado').innerHTML = `<div class="ed-msg mal">${esc(r.datos.error || 'Error ' + r.status)}</div>`;
			return;
		}
		validacion = r.datos;
		pintarValidacion(validacion);
		$e('#edGuardar').disabled = validacion.errores.length > 0 || validacion.sin_cambios;
	}

	function limpiarLinea(l) {
		return l.replace(/^\s*[✘⚠]\s*/, '');
	}

	function pintarValidacion(v, extraHtml) {
		let h = extraHtml || '';
		if (v.sin_cambios) h += '<div class="ed-msg">No hay cambios respecto al fichero actual.</div>';
		if (v.errores && v.errores.length)
			h +=
				`<div class="ed-msg mal"><b>${v.errores.length} error(es): hay que corregirlos antes de guardar</b><ul>` +
				v.errores.map(e => `<li>${esc(limpiarLinea(e))}</li>`).join('') +
				'</ul></div>';
		if (v.avisos && v.avisos.length)
			h +=
				`<div class="ed-msg aviso"><b>${v.avisos.length} aviso(s)</b> (no impiden guardar)<ul>` +
				v.avisos.map(e => `<li>${esc(limpiarLinea(e))}</li>`).join('') +
				'</ul></div>';
		if (!h && v.errores) h = '<div class="ed-msg bien">Sin errores ni avisos.</div>';
		if (v.fichero && !v.sin_cambios)
			h += `<p class="mini">Se escribirá <code>datos/${esc(col)}/${esc(v.fichero)}</code>` +
				(actual.fichero && v.fichero !== actual.fichero ? ` (se renombra desde <code>${esc(actual.fichero)}</code>)` : '') +
				'.</p>';
		$e('#edResultado').innerHTML = h;
		$e('#edDiff').innerHTML = (v.diff || '')
			.split('\n')
			.map(l => {
				const c = l.startsWith('+++') || l.startsWith('---') ? 'f' : l[0] === '+' ? 'mas' : l[0] === '-' ? 'menos' : l.startsWith('@@') ? 'at' : '';
				return `<span class="${c}">${esc(l)}</span>`;
			})
			.join('\n');
		$e('#edDiff').hidden = !v.diff;
	}

	async function guardar() {
		$e('#edGuardar').disabled = true;
		const ruta = '/api/fichas/' + col + (actual.fichero ? '/' + encodeURIComponent(actual.fichero) : '');
		const r = await llamar(ruta, { registro: trabajo, version: actual.version });
		if (!r.ok) {
			const conflicto = r.status === 409 && actual.fichero;
			pintarValidacion(
				r.datos.errores ? r.datos : validacion || {},
				`<div class="ed-msg mal">${esc(r.datos.error || 'Error ' + r.status)}` +
					(conflicto ? ' <button type="button" class="sec" id="edRecargar">Recargar la ficha</button>' : '') +
					'</div>'
			);
			const b = $e('#edRecargar');
			if (b) b.addEventListener('click', () => abrir(actual.fichero));
			$e('#edGuardar').disabled = !!(r.datos.errores && r.datos.errores.length);
			return;
		}
		const d = r.datos;
		actual = { fichero: d.fichero, version: d.version };
		// releer lo escrito (formato canónico, marca de revisión ajustada…) para que
		// el formulario siga exactamente lo que hay en disco si se sigue editando
		const rr = await llamar(`/api/fichas/${col}/${encodeURIComponent(d.fichero)}`);
		if (rr.ok) {
			actual.version = rr.datos.version;
			original = rr.datos.registro;
			entrantesActual = rr.datos.entrantes || [];
		} else original = clonar(trabajo);
		if (col === 'paises') await cargarEntidades();
		trabajo = clonar(original);
		idManual = true;
		pintarFormulario();
		$e('#edFichero').textContent = `datos/${col}/${actual.fichero}`;
		marcarCambios();
		pintarValidacion(
			{ avisos: d.avisos, diff: d.diff, fichero: null },
			`<div class="ed-msg bien"><b>✔ Guardado en <code>${esc(d.ruta || '')}</code>.</b> ` +
				(d.reciprocos_escritos && d.reciprocos_escritos.length
					? `También se ha escrito el vínculo inverso en ${d.reciprocos_escritos.map(f => `<code>${esc(f)}</code>`).join(', ')}. `
					: '') +
				(d.recompilado ? 'El mapa local ya lo muestra (recarga la pestaña del mapa). ' : '') +
				'El cambio solo está en tu copia: revísalo con <code>git diff</code>, haz commit y abre un pull request.</div>'
		);
		$e('#edGuardar').disabled = true;
		cargarLista();
	}

	function volverALista() {
		if (sucio() && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
		trabajo = original = actual = null;
		marcarCambios();
		irPaso(1);
	}

	/* --- arranque (lo llama cargarTodo() del panel tras iniciar sesión) --- */
	window.edIniciar = async function () {
		if (!$e('#editor')) return;
		if (!esquemas) {
			const r = await llamar('/api/fichas/_esquemas');
			if (!r.ok) {
				$e('#edLista').innerHTML = `<div class="ed-msg mal">${esc(r.datos.error || 'No se pudieron cargar los esquemas')}</div>`;
				return;
			}
			esquemas = r.datos;
			$e('#edBuscar').addEventListener('input', pintarLista);
			$e('#edNueva').addEventListener('click', nueva);
			$e('#edVolver').addEventListener('click', volverALista);
			$e('#edRevisar').addEventListener('click', revisar);
			$e('#edEditar').addEventListener('click', () => irPaso(2));
			$e('#edGuardar').addEventListener('click', guardar);
			$e('#edOtra').addEventListener('click', volverALista);
			window.addEventListener('beforeunload', ev => {
				if (sucio()) {
					ev.preventDefault();
					ev.returnValue = '';
				}
			});
		}
		pintarColecciones();
		irPaso(trabajo ? 2 : 1);
		await cargarLista();
		await cargarEntidades();
		const rp = await llamar('/api/fichas/paises');
		if (rp.ok) {
			nombresPaises = rp.datos.map(f => f.titulo);
			$e('#edPaisesList').innerHTML = nombresPaises.map(n => `<option value="${esc(n)}">`).join('');
		}
	};
})();
