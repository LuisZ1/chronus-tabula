/* Chronus Tabula — datos.js
   historia.json: carga, países, seguimiento de una entidad y relevancia histórica.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de index.html. */

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
