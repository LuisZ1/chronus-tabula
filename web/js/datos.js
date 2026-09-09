/* Chronus Tabula — datos.js
   historia.json: carga, países, seguimiento de una entidad y relevancia histórica.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* ---------- historia.json: gobernantes, población, conflictos, eventos ---------- */

let historia = null; // contenido de data/historia.json
const paisPorNombre = new Map(); // nombre del GeoJSON -> entrada de 'paises'
const paisPorId = new Map();

async function loadHistoria() {
	try {
		// no-cache: revalidar siempre, para que los datos recién editados/exportados
		// aparezcan al recargar sin necesidad de vaciar la caché del navegador
		historia = await (await fetch('data/historia.json', { cache: 'no-cache' })).json();
		for (const p of historia.paises || []) {
			paisPorId.set(p.id, p);
			for (const n of p.nombres || []) paisPorNombre.set(n, p);
		}
	} catch (e) {
		console.warn('No se pudo cargar data/historia.json', e);
		historia = { paises: [], conflictos: [], eventos: [], territorios: [] };
	}
}

function paisFor(props) {
	return paisPorNombre.get(props.NAME) || paisPorNombre.get(props.SUBJECTO) || null;
}

/* ---------- nombre visible de un país en el mapa/leyenda ----------
   El GeoJSON rotula en inglés y a veces con un nombre desactualizado
   (p. ej. «Zaire» para la RD del Congo). Preferimos el nombre de la ficha:
   - si define 'nombres_periodo', el que corresponda al año (así cada mapa
     muestra el nombre correcto de esa época: Congo Belga → Zaire → RD del Congo);
   - si no, el 'nombre' de la ficha, PERO en la etiqueta del mapa solo cuando es
     un nombre moderno (no un imperio/reino histórico), para no rotular un país
     moderno como su antiguo imperio; la leyenda sí admite el nombre histórico.
   - en último caso, el nombre original del GeoJSON. */
const NOMBRE_HISTORICO = /imperio|reino|califato|dinast[íi]a|vikingos|dos naciones|sacro|bizan|hel[ée]n|antigua|cl[áa]sic|\//i;

function nombrePeriodo(pais, y) {
	if (!pais || !Array.isArray(pais.nombres_periodo)) return null;
	for (const per of pais.nombres_periodo) {
		const desde = per.desde ?? -1e9;
		const hasta = per.hasta ?? 1e9;
		if (y >= desde && y <= hasta) return per.nombre;
	}
	return null;
}

function nombreVisible(name, y, permitirHistorico) {
	const pais = paisPorNombre.get(name);
	if (pais) {
		const per = nombrePeriodo(pais, y);
		if (per) return per;
		if (pais.nombre && (permitirHistorico || !NOMBRE_HISTORICO.test(pais.nombre))) return pais.nombre;
	}
	return name;
}

/* ---------- escudo del periodo consultado ----------
   Si la ficha define 'escudos' [{archivo, desde, hasta}], se elige el vigente en
   el año mostrado; si no, el mapa usa el escudo actual en vivo (P94 por nombre). */
function escudoUrlDe(archivo) {
	if (!archivo) return null;
	if (/^https?:/.test(archivo)) return archivo;
	return (
		'https://commons.wikimedia.org/wiki/Special:FilePath/' +
		encodeURIComponent(archivo) +
		'?width=48'
	);
}

/* escudo ('escudos') o bandera ('banderas') vigente en el año y, según campo */
function emblemaParaAnio(pais, y, campo) {
	if (!pais || !Array.isArray(pais[campo])) return null;
	// primero los que tienen vigencia (desde/hasta); el que no la tiene es el
	// respaldo «actual» y solo se usa si ningún periodo cubre el año (el orden en
	// el fichero es canónico por fecha y el respaldo queda el primero, así que no
	// vale con recorrer la lista sin más)
	let respaldo = null;
	for (const e of pais[campo]) {
		if (e.desde == null && e.hasta == null) {
			respaldo = respaldo || e;
			continue;
		}
		const desde = e.desde ?? -1e9;
		const hasta = e.hasta ?? 1e9;
		if (y >= desde && y <= hasta) return escudoUrlDe(e.archivo);
	}
	return respaldo ? escudoUrlDe(respaldo.archivo) : null;
}

function escudoParaAnio(pais, y) {
	return emblemaParaAnio(pais, y, 'escudos');
}

/* el emblema que el usuario ha elegido ver (prefs.emblema): campo de la ficha y
   propiedad de Wikidata para el respaldo en vivo */
function emblemaElegido() {
	return prefs.emblema === 'bandera'
		? { campo: 'banderas', prop: 'P41', clave: 'flag' }
		: { campo: 'escudos', prop: 'P94', clave: 'coa' };
}

function gobernanteEn(pais, y) {
	if (!pais || !pais.gobernantes) return [];
	return pais.gobernantes.filter(g => g.desde <= y && y <= g.hasta);
}

function poblacionCercana(pais, y) {
	if (!pais || !pais.poblacion || !pais.poblacion.length) return null;
	let best = null;
	for (const p of pais.poblacion) {
		if (!best || Math.abs(p.anio - y) < Math.abs(best.anio - y)) best = p;
	}
	return best;
}

/* ---------- seguimiento de una entidad ---------- */

function isFollowed(props) {
	if (!state.follow) return false;
	const n = state.follow.nombres;
	return n.includes(props.NAME) || n.includes(props.SUBJECTO);
}

function setFollow(pais) {
	state.follow = pais || null;
	const input = document.getElementById('followInput');
	const clear = document.getElementById('followClear');
	if (pais) {
		input.value = pais.nombre || pais.id;
		clear.hidden = false;
	} else {
		input.value = '';
		clear.hidden = true;
	}
	if (state.layer) state.layer.setStyle(featureStyle);
	if (historia) {
		buildTimeMarks();
		updateYearPanel();
	}
	writeHash();
}

function fillFollowDatalist() {
	const dl = document.getElementById('entidadesList');
	dl.innerHTML = '';
	for (const p of historia.paises || []) {
		const o = document.createElement('option');
		o.value = p.nombre || p.id;
		dl.appendChild(o);
	}
}

/* ---------- relevancia histórica: ¿afecta al país seguido? ---------- */

function normTxt(t) {
	return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function followKeys() {
	if (!state.follow) return null;
	const keys = [state.follow.nombre || state.follow.id, ...(state.follow.relacionados || [])];
	return keys.map(normTxt);
}

/* coincide si algún nombre implicado contiene alguna clave como palabra completa */
function matchesKeys(names, keys) {
	if (!names || !names.length) return false;
	for (const raw of names) {
		const n = normTxt(raw);
		for (const k of keys) {
			if (n === k) return true;
			const re = new RegExp(
				'(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])'
			);
			if (re.test(n)) return true;
		}
	}
	return false;
}

function warRelevant(c, keys) {
	return !keys || matchesKeys(c.paises, keys);
}
function eventRelevant(ev, keys) {
	return !keys || matchesKeys(ev.paises, keys);
}
