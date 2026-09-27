# 002 — Cámara del mapa: respetar `prefers-reduced-motion`

- **Status**: DONE (26-09-2026, sin commit)
- **Commit**: b02169b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 ficheros JS (`arranque.js`, `paneles.js`, `tiempo.js`), ~20 líneas

## Problem

Los saltos de cámara son animaciones de Leaflet a través de medio planeta:
`flyTo` (zoom out + desplazamiento + zoom in) y `fitBounds` animado. Son el
movimiento más grande de la app —todo el viewport se desplaza— y ninguno mira
`prefers-reduced-motion`. Es justo el tipo de movimiento vestibular que esa
preferencia pide evitar. Lo mismo el zoom animado de Leaflet.

```js
/* web/js/paneles.js:49-55 — leyenda: centrar entidad */
		map.fitBounds(
			[
				[e.minLat, e.minLng],
				[e.maxLat, e.maxLng]
			],
			{ maxZoom: 6, padding: [30, 30] }
		);
```

```js
/* web/js/paneles.js:150 — panel «Este año», conflictos */
		if (b) map.fitBounds(b, { maxZoom: 6, padding: [40, 40] });
```

```js
/* web/js/paneles.js:176 — volarYAbrir */
	map.flyTo([lat, lng], Math.max(map.getZoom(), 5));
```

```js
/* web/js/tiempo.js:236 — marcas de conflicto */
		if (b) map.fitBounds(b, { maxZoom: 6, padding: [40, 40] });
```

```js
/* web/js/arranque.js:24-30 — creación del mapa */
	map = L.map('map', {
		preferCanvas: true,
		worldCopyJump: true,
		minZoom: 2,
		maxZoom: 12,
		zoomControl: true
	}).setView(startView.center, startView.zoom);
```

## Target

Con movimiento reducido: la cámara **salta** al destino (sin vuelo ni
desplazamiento animado) y el zoom de Leaflet no se anima. La ficha que se abre
después sigue apareciendo con su fundido (opacidad = ayuda a entender, se
mantiene). Sin la preferencia, todo queda como ahora.

```js
/* target — nucleo.js (helpers compartidos) */
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
function menosMovimiento() {
	return mqReduce.matches;
}
// fitBounds/flyTo con la preferencia del usuario
function encuadrar(bounds, opts) {
	map.fitBounds(bounds, { ...opts, animate: !menosMovimiento() });
}
function volarA(latlng, zoom) {
	if (menosMovimiento()) map.setView(latlng, zoom, { animate: false });
	else map.flyTo(latlng, zoom);
}
```

```js
/* target — arranque.js, opciones de L.map */
		zoomControl: true,
		zoomAnimation: !menosMovimiento(),
		markerZoomAnimation: !menosMovimiento()
```

## Repo conventions to follow

- Los helpers globales viven en `web/js/nucleo.js` (ver `setLoading`,
  `colorFor`); los ficheros comparten ámbito global y se cargan en el orden de
  `mapa.html` (nucleo.js va antes que paneles.js y tiempo.js).
- Patrón de media query en JS ya existente: `mqMobile` en `tiempo.js:43`.

## Steps

1. En `web/js/nucleo.js`, al final, añade `mqReduce`, `menosMovimiento`,
   `encuadrar` y `volarA` tal como están arriba, con un comentario en español:
   «movimiento reducido: la cámara salta al destino, sin vuelo».
2. Sustituye las tres llamadas `map.fitBounds(b, {...})` / `map.fitBounds([...], {...})`
   (`paneles.js:49`, `paneles.js:150`, `tiempo.js:236`) por `encuadrar(...)` con
   los mismos argumentos.
3. En `volarYAbrir` (`paneles.js:176`) cambia `map.flyTo(...)` por
   `volarA([lat, lng], Math.max(map.getZoom(), 5))`. Con `setView` sin
   animación `moveend` se dispara igualmente, así que la ficha se abre; la red
   de seguridad de 3 s sigue ahí.
4. En `arranque.js`, añade `zoomAnimation` y `markerZoomAnimation` a las
   opciones de `L.map`.
5. Sube `?v=` en `web/mapa.html`.

## Boundaries

- Do NOT toques el arrastre ni el pellizco del mapa (manipulación directa: sigue
  al dedo, no es una animación).
- Do NOT quites `fadeAnimation` (fundido de fichas y teselas: opacidad, se queda).
- Do NOT cambies las opciones `maxZoom`/`padding` existentes.

## Verification

- **Mechanical**: `node --check` en los tres ficheros.
- **Feel check**: DevTools → Rendering → «Emulate CSS prefers-reduced-motion: reduce»
  (recarga tras activarlo para el zoom):
  - Pulsa una fila de la leyenda: el mapa aparece encuadrado sin desplazarse.
  - Pulsa un ⭐ del panel «Este año»: salto directo y la ficha se abre con fundido.
  - Rueda del ratón / botones +/−: el zoom cambia sin escala animada.
  - Desactiva la emulación y recarga: vuelve el vuelo de siempre.
- **Done when**: `grep -n "fitBounds\|flyTo" web/js/*.js` solo aparece dentro de
  `encuadrar`/`volarA`.
