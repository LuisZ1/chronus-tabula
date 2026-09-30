/* Chronus Tabula — rotulos.js
   Que los rótulos de batallas, acontecimientos y territorios no se tapen.

   Cada marcador (capas.js, marcaRotulada) es un punto en su coordenada exacta y un
   rótulo. Tras cada zoom o desplazamiento:
     1. Las marcas en el mismo sitio (a menos de ~150 m) se juntan siempre en un
        círculo con el número: no hay forma de separarlas acercando.
     2. Cada rótulo se coloca en el primer hueco libre alrededor de su punto
        (arriba, a un lado, abajo, en diagonal; si no, algo más lejos con un hilo).
        Van primero las batallas, luego los acontecimientos y los territorios.
     3. Si en una zona se quedan sin sitio UMBRAL rótulos o más, esas marcas pasan a
        un círculo con número; las pocas que no caben se quedan en su punto (el
        nombre sale al pasar por encima).
   Pulsar un círculo acerca lo justo para separar sus marcas, o, si están en el
   mismo sitio o ya no se puede acercar más, las abre en abanico. Al acercar, las
   marcas salen del círculo y se deslizan a su sitio.
   Los ficheros de js/ comparten ámbito global y se cargan en el orden de mapa.html. */

const ROT = {
	UMBRAL: 3, // rótulos sin sitio en una zona a partir de los cuales se agrupa
	ZONA: 44, // px: marcas sin rótulo a esta distancia forman una misma zona
	MISMO_SITIO: 6, // px al zoom máximo (~150 m): marcas «en la misma coordenada»
	SEP: 5, // px entre el punto y su rótulo
	capa: null, // círculos y abanicos
	previo: new Map(), // marcador → latlng del círculo en que estaba (para el vuelo)
	zoomPrevio: null,
	abanico: null, // { capa, zoom } mientras hay uno abierto
	pendiente: false
};
const PRIO_ROT = { b: 0, e: 1, i: 1, t: 2 };
/* el nombre de la marca, sin su icono */
const nombreRot = r => (r.et.querySelector('span:last-child') || r.et).textContent.trim();
const COLOR_ROT = { b: '#b8291c', e: '#c9a227', i: '#c9a227', t: '#8a949c' };

function setupRotulos() {
	ROT.capa = L.layerGroup().addTo(map);
	map.on('zoomend moveend resize', programarRotulos);
	map.on('zoomstart', cerrarAbanico);
	map.on('click', cerrarAbanico);
	// al pintar o quitar marcadores (cambio de año, capas on/off)
	map.on('layeradd layerremove', e => {
		if (e.layer && (e.layer.rot || e.layer === state.battleLayer || e.layer === state.eventLayer || e.layer === state.territoryLayer))
			programarRotulos();
	});
	programarRotulos();
}

/* una sola colocación por fotograma, aunque lleguen muchos avisos */
function programarRotulos() {
	if (ROT.pendiente) return;
	ROT.pendiente = true;
	requestAnimationFrame(() => {
		ROT.pendiente = false;
		// con un abanico abierto, un desplazamiento sin zoom (p. ej. al abrir una ficha) no lo cierra
		if (ROT.abanico && ROT.abanico.zoom === map.getZoom()) return;
		colocarRotulos();
	});
}

function marcasRotuladas() {
	const out = [];
	for (const capa of [state.battleLayer, state.eventLayer, state.territoryLayer]) {
		if (!capa || !map.hasLayer(capa)) continue;
		capa.eachLayer(mk => {
			if (mk.rot && mk.getElement()) out.push(mk);
		});
	}
	return out;
}

/* partes del marcador y tamaño de su rótulo (se mide una vez) */
function partesRot(mk) {
	const r = mk.rot;
	if (!r.el) {
		r.el = mk.getElement().querySelector('.rot');
		r.et = r.el.querySelector('.battle-label, .event-label, .terr-label');
		r.hilo = r.el.querySelector('.rot-hilo');
		r.pt = r.el.querySelector('.rot-pt');
	}
	if (!r.w) {
		// oculto (p. ej. territorios con poco zoom) mide 0: se medirá cuando se vea
		r.w = r.et.offsetWidth || 0;
		r.h = r.et.offsetHeight || 0;
	}
	return r;
}

const solapaRot = (a, b, m = 1) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const radioGrupoRot = n => 14 + Math.min(9, Math.sqrt(n) * 3);

/* uniones por cercanía: [[i, j…], …] con los índices a menos de 'dist' */
function juntarRot(pts, dist) {
	const padre = pts.map((_, i) => i);
	const raiz = i => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
	for (let i = 0; i < pts.length; i++)
		for (let j = i + 1; j < pts.length; j++)
			if (Math.abs(pts[i].x - pts[j].x) < dist && Math.abs(pts[i].y - pts[j].y) < dist && pts[i].distanceTo(pts[j]) < dist)
				padre[raiz(j)] = raiz(i);
	const g = new Map();
	pts.forEach((_, i) => {
		const r = raiz(i);
		if (!g.has(r)) g.set(r, []);
		g.get(r).push(i);
	});
	return [...g.values()];
}

function colocarRotulos() {
	if (!map || !ROT.capa) return;
	cerrarAbanico();
	ROT.capa.clearLayers();
	const z = map.getZoom();
	const zoomCambia = ROT.zoomPrevio !== null && ROT.zoomPrevio !== z;
	const sinRotuloTerr = z < 4; // con el mundo entero a la vista, los territorios son solo su punto
	const vista = map.getBounds().pad(0.3);
	const todas = marcasRotuladas();
	const ms = [];
	for (const mk of todas) {
		const r = partesRot(mk);
		r.el.parentNode.style.display = '';
		if (vista.contains(mk.getLatLng())) ms.push(mk);
		else ponerRotulo(r, null); // fuera de la vista: como venga, no se ve
	}
	ms.sort((a, b) => PRIO_ROT[a.rot.k] - PRIO_ROT[b.rot.k]);
	const px = ms.map(mk => map.latLngToLayerPoint(mk.getLatLng()));

	// 1. mismo sitio: siempre agrupadas
	const pxMax = ms.map(mk => map.project(mk.getLatLng(), map.getMaxZoom()));
	let grupos = juntarRot(pxMax, ROT.MISMO_SITIO)
		.filter(g => g.length > 1)
		.map(g => ({ miembros: g, mismoSitio: true }));
	// 2 y 3. colocar; si en una zona quedan UMBRAL o más sin sitio, se agrupan y se vuelve a colocar
	let res;
	for (let vuelta = 0; vuelta < 3; vuelta++) {
		res = colocarPasada(ms, px, grupos, sinRotuloTerr);
		const sinSitio = res.sinSitio;
		const zonas = juntarRot(sinSitio.map(i => px[i]), ROT.ZONA)
			.map(g => g.map(k => sinSitio[k]))
			.filter(g => g.length >= ROT.UMBRAL);
		if (!zonas.length) break;
		grupos = fundirGrupos(grupos.concat(zonas.map(g => ({ miembros: g, mismoSitio: false }))), px);
		res = null;
	}
	if (!res) res = colocarPasada(ms, px, grupos, sinRotuloTerr); // con los círculos definitivos

	// pintar
	const enGrupo = new Set(grupos.flatMap(g => g.miembros));
	const ahora = new Map();
	grupos.forEach(g => {
		const c = centroRot(g.miembros.map(i => px[i]));
		const ll = map.layerPointToLatLng(c);
		g.miembros.forEach(i => {
			ms[i].rot.el.parentNode.style.display = 'none';
			ahora.set(ms[i], ll);
		});
		pintarGrupoRot(g.miembros.map(i => ms[i]), g.miembros.map(i => px[i]), c, g.mismoSitio);
	});
	ms.forEach((mk, i) => {
		if (enGrupo.has(i)) return;
		ponerRotulo(mk.rot, res.sitio.get(i) || null, res.sitio.has(i) ? false : !(mk.rot.k === 't' && sinRotuloTerr));
		const antes = ROT.previo.get(mk);
		if (zoomCambia && antes) volarRot(mk.rot.el, map.latLngToLayerPoint(antes), px[i]);
	});
	ROT.previo = ahora;
	ROT.zoomPrevio = z;
}

/* dos círculos que se tocan se funden en uno */
function fundirGrupos(grupos, px) {
	let cambio = true;
	while (cambio) {
		cambio = false;
		for (let i = 0; i < grupos.length && !cambio; i++)
			for (let j = i + 1; j < grupos.length && !cambio; j++) {
				const a = grupos[i], b = grupos[j];
				const ca = centroRot(a.miembros.map(k => px[k])), cb = centroRot(b.miembros.map(k => px[k]));
				if (ca.distanceTo(cb) < radioGrupoRot(a.miembros.length) + radioGrupoRot(b.miembros.length) + 4) {
					grupos[i] = { miembros: a.miembros.concat(b.miembros), mismoSitio: a.mismoSitio && b.mismoSitio };
					grupos.splice(j, 1);
					cambio = true;
				}
			}
	}
	return grupos;
}

function centroRot(pts) {
	return L.point(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length);
}

/* una pasada de colocación: los círculos y todos los puntos ocupan su sitio; luego,
   por orden, cada rótulo busca hueco */
function colocarPasada(ms, px, grupos, sinRotuloTerr) {
	const ocupado = [];
	const enGrupo = new Set();
	for (const g of grupos) {
		g.miembros.forEach(i => enGrupo.add(i));
		const c = centroRot(g.miembros.map(i => px[i]));
		const r = radioGrupoRot(g.miembros.length) + 2;
		ocupado.push({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r });
	}
	ms.forEach((mk, i) => {
		if (!enGrupo.has(i)) ocupado.push({ x: px[i].x - 5, y: px[i].y - 5, w: 10, h: 10 });
	});
	const sitio = new Map();
	const sinSitio = [];
	ms.forEach((mk, i) => {
		if (enGrupo.has(i)) return;
		const r = mk.rot;
		if (r.k === 't' && sinRotuloTerr) return;
		const w = r.w, h = r.h, s = ROT.SEP, p = px[i];
		let hueco = null;
		for (const d of [0, 16, 32]) {
			const e = d * 0.7;
			const cand = [
				[-w / 2, -h - s - d], // arriba
				[s + 2 + d, -h / 2], // derecha
				[-w - s - 2 - d, -h / 2], // izquierda
				[-w / 2, s + d], // abajo
				[s + e, -h - s - e],
				[-w - s - e, -h - s - e],
				[s + e, s + e],
				[-w - s - e, s + e]
			];
			for (const [ox, oy] of cand) {
				const caja = { x: p.x + ox, y: p.y + oy, w, h };
				if (!ocupado.some(o => solapaRot(o, caja))) {
					hueco = { ox, oy, lejos: d > 0 };
					ocupado.push(caja);
					break;
				}
			}
			if (hueco) break;
		}
		if (hueco) sitio.set(i, hueco);
		else sinSitio.push(i);
	});
	return { sitio, sinSitio };
}

/* coloca el rótulo (o lo quita) y tiende el hilo si queda lejos del punto */
function ponerRotulo(r, hueco, oculto = false) {
	r.el.classList.toggle('sin-rotulo', oculto);
	r.pt.title = oculto ? nombreRot(r) : '';
	if (!hueco) {
		r.et.style.transform = '';
		r.hilo.style.display = 'none';
		return;
	}
	r.et.style.transform = `translate(${Math.round(hueco.ox)}px, ${Math.round(hueco.oy)}px)`;
	if (hueco.lejos) {
		// del punto al borde más cercano del rótulo
		const ex = Math.max(hueco.ox, Math.min(0, hueco.ox + r.w));
		const ey = Math.max(hueco.oy, Math.min(0, hueco.oy + r.h));
		r.hilo.style.display = 'block';
		r.hilo.style.width = Math.hypot(ex, ey) + 'px';
		r.hilo.style.transform = `rotate(${Math.atan2(ey, ex)}rad)`;
	} else r.hilo.style.display = 'none';
}

/* la marca sale de donde estaba su círculo y se desliza a su sitio */
function volarRot(el, desde, hasta) {
	if (menosMovimiento() || desde.distanceTo(hasta) < 2) return;
	el.classList.remove('vuelo');
	el.style.transform = `translate(${desde.x - hasta.x}px, ${desde.y - hasta.y}px)`;
	el.style.opacity = '0.2';
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			el.classList.add('vuelo');
			el.style.transform = '';
			el.style.opacity = '';
		})
	);
}

function pintarGrupoRot(mks, pts, c, mismoSitio) {
	const n = mks.length;
	const cuenta = { b: 0, e: 0, t: 0 };
	mks.forEach(mk => (cuenta[mk.rot.k === 'i' ? 'e' : mk.rot.k] += 1));
	let a = 0;
	const aro = ['b', 'e', 't']
		.filter(k => cuenta[k])
		.map(k => {
			const d = (cuenta[k] / n) * 360;
			const t = `${COLOR_ROT[k]} ${a}deg ${a + d}deg`;
			a += d;
			return t;
		})
		.join(',');
	const nombres = mks.map(mk => nombreRot(mk.rot));
	const lista = nombres.slice(0, 8).join(' · ') + (n > 8 ? ' …' : '');
	const titulo = `${i18n.t('group.count').replace('{n}', n)}: ${lista}`;
	const d = 2 * radioGrupoRot(n);
	const icon = L.divIcon({
		html: `<div class="grupo-marcas" style="width:${d}px;height:${d}px;background:conic-gradient(${aro})"><span>${n}</span></div>`,
		className: 'battle-wrap',
		iconSize: [0, 0],
		iconAnchor: [0, 0]
	});
	const mk = L.marker(map.layerPointToLatLng(c), { icon, keyboard: true, title: titulo, alt: titulo, riseOnHover: true, zIndexOffset: 500 });
	mk.on('click', e => {
		L.DomEvent.stopPropagation(e);
		abrirGrupoRot(mks, pts, c, mismoSitio, mk);
	});
	mk.addTo(ROT.capa);
}

function abrirGrupoRot(mks, pts, c, mismoSitio, mkGrupo) {
	const b = L.latLngBounds(mks.map(mk => mk.getLatLng()));
	const zFit = Math.min(map.getMaxZoom(), map.getBoundsZoom(b.pad(0.6)));
	if (!mismoSitio && zFit > map.getZoom()) {
		map.flyToBounds(b.pad(0.6), { maxZoom: map.getMaxZoom(), duration: menosMovimiento() ? 0 : 0.6 });
		return;
	}
	abrirAbanico(mks, pts, c, mkGrupo);
}

/* abanico: los rótulos en columna junto al círculo, cada uno con su hilo al punto */
function abrirAbanico(mks, pts, c, mkGrupo) {
	cerrarAbanico();
	const capa = L.layerGroup().addTo(map);
	const n = mks.length;
	const alto = 22;
	const x0 = c.x + radioGrupoRot(n) + 24;
	const y0 = c.y - ((n - 1) * alto) / 2;
	mks.forEach((mk, i) => {
		const r = mk.rot;
		const q = L.point(x0, y0 + i * alto);
		const p = pts[i];
		const dx = q.x - p.x, dy = q.y - p.y;
		const pt = r.pt.outerHTML;
		// hilo desde el punto exacto de la marca hasta su rótulo
		L.marker(mk.getLatLng(), {
			icon: L.divIcon({
				html: `<div class="rot rot-${r.k} en-abanico">${pt}<span class="rot-hilo" style="display:block;width:${Math.hypot(dx, dy)}px;transform:rotate(${Math.atan2(dy, dx)}rad)"></span></div>`,
				className: 'battle-wrap',
				iconSize: [0, 0],
				iconAnchor: [0, 0]
			}),
			keyboard: false,
			interactive: false,
			zIndexOffset: 600
		}).addTo(capa);
		const et = L.marker(map.layerPointToLatLng(q), {
			icon: L.divIcon({
				html: `<div class="rot rot-${r.k} en-abanico">${r.et.outerHTML.replace('style="', 'data-x="')}</div>`,
				className: 'battle-wrap',
				iconSize: [0, 0],
				iconAnchor: [0, 0]
			}),
			keyboard: true,
			title: nombreRot(r),
			zIndexOffset: 700
		})
			.on('click', e => {
				L.DomEvent.stopPropagation(e);
				mk.openPopup();
			})
			.addTo(capa);
		volarRot(et.getElement().querySelector('.rot'), c, q);
	});
	const el = mkGrupo.getElement();
	if (el) el.classList.add('grupo-abierto');
	ROT.abanico = { capa, zoom: map.getZoom(), el };
}

function cerrarAbanico() {
	if (!ROT.abanico) return;
	map.removeLayer(ROT.abanico.capa);
	if (ROT.abanico.el) ROT.abanico.el.classList.remove('grupo-abierto');
	ROT.abanico = null;
}
