/* Chronus Tabula — datos.js
   historia.json: carga, países, seguimiento de una entidad y relevancia histórica.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

/* ---------- historia.json: gobernantes, población, conflictos, eventos ---------- */

let historia = null; // contenido de data/historia.json
const paisPorNombre = new Map(); // nombre del GeoJSON -> entrada de 'paises'
const paisPorId = new Map();
let nombresMapa = {}; // nombre del GeoJSON -> {es, en}: datos/nombres.json, compilado en historia.json

async function loadHistoria() {
	try {
		// no-cache: revalidar siempre, para que los datos recién editados/exportados
		// aparezcan al recargar sin necesidad de vaciar la caché del navegador
		historia = await (await fetch('data/historia.json', { cache: 'no-cache' })).json();
		nombresMapa = historia.nombres_mapa || {};
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

function periodoActivo(pais, y) {
	if (!pais || !Array.isArray(pais.nombres_periodo)) return null;
	for (const per of pais.nombres_periodo) {
		const desde = per.desde ?? -1e9;
		const hasta = per.hasta ?? 1e9;
		if (y >= desde && y <= hasta) return per;
	}
	return null;
}

/* ---------- nombres en el idioma elegido ----------
   Las fichas tienen 'nombre' (español) y 'nombre_en'; sus periodos, igual. Lo que
   no tiene ficha se traduce con la tabla de nombres de los mapas (datos/nombres.json):
   'es' siempre; 'en' solo si el nombre original no sirve como inglés (erratas,
   nombres en francés…). Si nada lo traduce, se muestra el nombre del mapa. */
function enIngles() {
	return i18n.lang === 'en';
}

function nombreMapa(name) {
	const t = nombresMapa[name];
	if (!t) return name;
	return (enIngles() ? t.en : t.es) || name;
}

function nombreDe(obj) {
	if (!obj) return null;
	return enIngles() ? obj.nombre_en || null : obj.nombre || null;
}

/* nombre visible de una guerra, batalla, zona, acontecimiento o territorio menor */
function nombreTxt(obj) {
	return (obj && (nombreDe(obj) || obj.nombre)) || '';
}

function nombrePeriodo(pais, y) {
	const per = periodoActivo(pais, y);
	return per ? nombreDe(per) || per.nombre : null;
}

/* nombre de una ficha (título del popup, buscador, «siguiendo a…»): el del periodo
   del año si lo hay; si no, el de la ficha; si no tiene en ese idioma, la traducción
   de su primer nombre en los mapas */
function nombreFicha(pais, y) {
	if (!pais) return null;
	return (
		(y != null && nombrePeriodo(pais, y)) ||
		nombreDe(pais) ||
		nombreMapa((pais.nombres || [])[0] || pais.nombre || pais.id)
	);
}

/* ---------- ¿el año consultado es la época «actual» de la ficha? ----------
   Una ficha como Egipto cubre del Antiguo Egipto a hoy con 'nombres_periodo',
   pero su reseña, su bandera o su escudo sin fechas y los emblemas que se
   buscan en vivo son los del país actual. Solo valen en su época: en el año
   −2804 el mapa no debe enseñar la bandera ni la reseña de la República Árabe
   de Egipto. Es época actual si el periodo activo llega a nuestros días, o si no
   hay periodo activo y el año no es anterior al primero (p. ej. la RD del Congo
   después de «Zaire»). Sin 'nombres_periodo', la ficha es una sola entidad. */
const ANIO_ACTUAL = new Date().getFullYear();

/* emblemas «actuales» (sin fechas, o buscados en vivo): además de la época
   actual, en una ficha de Estado moderno (con Qid de Wikidata) sin periodos no
   se muestran antes de 1800, porque las banderas y escudos nacionales de hoy
   no existían: mejor ninguno que uno anacrónico (Armenia en 323 a. C.) */
const ANIO_EMBLEMAS_MODERNOS = 1800;

function emblemaActualVale(pais, y) {
	if (!esEpocaActual(pais, y)) return false;
	const sinPeriodos = !Array.isArray(pais.nombres_periodo) || !pais.nombres_periodo.length;
	return !(sinPeriodos && pais.wikidata && y < ANIO_EMBLEMAS_MODERNOS);
}

function esEpocaActual(pais, y) {
	if (!pais || !Array.isArray(pais.nombres_periodo) || !pais.nombres_periodo.length) return true;
	const per = periodoActivo(pais, y);
	if (per) return per.hasta == null || per.hasta >= ANIO_ACTUAL - 1;
	const primero = Math.min(...pais.nombres_periodo.map(p => p.desde ?? -1e9));
	return y >= primero;
}

function nombreVisible(name, y, permitirHistorico) {
	const pais = paisPorNombre.get(name);
	if (pais) {
		const per = nombrePeriodo(pais, y);
		if (per) return per;
		const propio = nombreDe(pais);
		if (propio && (permitirHistorico || !NOMBRE_HISTORICO.test(pais.nombre || ''))) return propio;
	}
	return nombreMapa(name);
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
	let primeroFechado = Infinity;
	for (const e of pais[campo]) {
		if (e.desde == null && e.hasta == null) {
			respaldo = respaldo || e;
			continue;
		}
		const desde = e.desde ?? -1e9;
		const hasta = e.hasta ?? 1e9;
		primeroFechado = Math.min(primeroFechado, desde);
		if (y >= desde && y <= hasta) return escudoUrlDe(e.archivo);
	}
	// el respaldo sin fechas es el emblema actual: nunca antes del primer emblema
	// fechado ni fuera de la época actual de la ficha
	if (!respaldo || (primeroFechado !== Infinity && y < primeroFechado) || !emblemaActualVale(pais, y)) return null;
	return escudoUrlDe(respaldo.archivo);
}

/* el emblema en vivo (Wikidata por nombre) es siempre el actual: solo sin ficha,
   o si la ficha no trae emblemas de ese tipo y el año es de su época actual */
function puedeEmblemaEnVivo(pais, y, campo) {
	if (!pais) return true;
	if (Array.isArray(pais[campo]) && pais[campo].length) return false;
	return emblemaActualVale(pais, y);
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

/* 'hasta' vacío o ausente = sigue en el cargo: vale hasta el año en curso */
function gobernanteEn(pais, y) {
	if (!pais || !pais.gobernantes) return [];
	return pais.gobernantes.filter(g => g.desde <= y && y <= (g.hasta ?? ANIO_ACTUAL));
}

/* la estimación más cercana, pero no de otra época: dentro del periodo activo
   (si la ficha los tiene) y a menos de 500 años */
function poblacionCercana(pais, y) {
	if (!pais || !pais.poblacion || !pais.poblacion.length) return null;
	const per = periodoActivo(pais, y);
	const lo = per && per.desde != null ? per.desde : -1e9;
	const hi = per && per.hasta != null ? per.hasta : 1e9;
	let best = null;
	for (const p of pais.poblacion) {
		if (p.anio < lo || p.anio > hi || Math.abs(p.anio - y) > 500) continue;
		if (!best || Math.abs(p.anio - y) < Math.abs(best.anio - y)) best = p;
	}
	return best;
}

/* ---------- seguimiento de una entidad ---------- */

/* Seguir una entidad resalta ella, sus predecesores y lo que incluye, en cadena
   (España → Corona de Castilla → Reino de León), según los 'vinculos' de las
   fichas (api/fuentes/vinculos.py). Con año, solo cuentan los vínculos vigentes
   ese año (un 'incluye' de 1542 a 1824 no resalta Perú en 2010). Los
   antecesores territoriales (quien gobernó antes el territorio sin continuidad
   de Estado: Califato de Córdoba → España) solo con la opción del panel de capas. */
function tiposSeguidos() {
	return prefs.territorial ? ['predecesor', 'incluye', 'antecesor_territorial'] : ['predecesor', 'incluye'];
}

function seguidas(pais, y) {
	const tipos = tiposSeguidos();
	const out = new Set([pais.id]);
	const cola = [pais];
	while (cola.length) {
		const p = cola.shift();
		for (const v of p.vinculos || []) {
			if (!tipos.includes(v.tipo)) continue;
			if (y != null && ((v.desde != null && y < v.desde) || (v.hasta != null && y > v.hasta))) continue;
			const q = paisPorId.get(v.id);
			if (q && !out.has(q.id)) {
				out.add(q.id);
				cola.push(q);
			}
		}
	}
	return out;
}

let cacheSeguidos = { clave: null, nombres: null };
function nombresSeguidos() {
	const clave = state.follow.id + '|' + state.requestedYear + '|' + (prefs.territorial ? 't' : '');
	if (cacheSeguidos.clave !== clave) {
		const nombres = new Set();
		for (const id of seguidas(state.follow, state.requestedYear))
			for (const n of (paisPorId.get(id) || {}).nombres || []) nombres.add(n);
		cacheSeguidos = { clave, nombres };
	}
	return cacheSeguidos.nombres;
}

function isFollowed(props) {
	if (!state.follow) return false;
	const n = nombresSeguidos();
	return n.has(props.NAME) || n.has(props.SUBJECTO);
}

function setFollow(pais) {
	state.follow = pais || null;
	const input = document.getElementById('followInput');
	const clear = document.getElementById('followClear');
	if (pais) {
		input.value = nombreFicha(pais) || pais.id;
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
		o.value = nombreFicha(p) || p.id;
		dl.appendChild(o);
	}
}

/* ---------- relevancia histórica: ¿afecta al país seguido? ---------- */

function normTxt(t) {
	return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function followKeys() {
	if (!state.follow) return null;
	// guerras y acontecimientos de toda la cadena, en cualquier año (la barra de
	// tiempo los muestra todos): nombre y alias de cada entidad seguida
	const keys = [];
	for (const id of seguidas(state.follow, null)) {
		const p = paisPorId.get(id);
		if (p) keys.push(p.nombre || p.id, ...(p.relacionados || []));
	}
	return [...new Set(keys.map(normTxt))];
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
