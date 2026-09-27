# 004 — Reproducir: fundido entre mapas de fronteras

- **Status**: DONE (26-09-2026, sin commit)
- **Commit**: b02169b
- **Severity**: LOW (aditivo; el de más impacto «narrativo» de la app)
- **Category**: Missed opportunities
- **Estimated scope**: 2 ficheros (`web/js/mapa.js`, `web/js/arranque.js`), ~30 líneas

## Problem

En modo ▶ Reproducir la historia avanza de mapa en mapa y **las fronteras saltan**
de un estado al siguiente. Es el único momento de la app pensado para *mirar*
el cambio (explicación), y un corte seco hace difícil ver qué se ganó y qué se
perdió.

```js
/* web/js/mapa.js:274-281 — current */
		if (state.layer) map.removeLayer(state.layer);
		state.layer = L.geoJSON(gj, {
			style: featureStyle,
			onEachFeature: (f, layer) => {
				layer.bindPopup(() => popupHtml(f.properties), { maxWidth: 320 });
			}
		}).addTo(map);
```

El mapa usa `preferCanvas: true` (`arranque.js:25`): los polígonos se pintan en
un `<canvas>` por pane, así que no hay nodos SVG que transicionar. Se anima la
**opacidad del pane** que contiene la capa saliente.

**Fuera de alcance a propósito**: arrastre del deslizador y ◀ ▶ (alta frecuencia,
el usuario está leyendo datos → sin animación).

## Target

- Solo cuando el cambio viene de Reproducir (`fromPlay`).
- La capa nueva se añade en el pane normal de inmediato; la anterior se mueve a
  un pane `saliente` (z-index 401, justo encima), que baja de opacidad
  `1 → 0` en **300 ms `ease-in-out`** (`cubic-bezier(0.77, 0, 0.175, 1)`) y se retira.
- Si llega otro paso antes de que termine, la capa saliente anterior se retira
  en el acto (nunca más de dos capas a la vez).
- Movimiento reducido: sin fundido (corte como ahora). *Es opacidad, pero en
  pantalla completa y repetida cada 0,6–2,5 s; mejor evitarla.*

```js
/* target — arranque.js, tras crear el pane 'warzones' */
	const outPane = map.createPane('saliente');
	outPane.style.zIndex = 401; // justo sobre los territorios (400)
	outPane.style.pointerEvents = 'none';
	salienteRenderer = L.canvas({ pane: 'saliente' });
```

```js
/* target — mapa.js, en showYear (esquema) */
		const fundir = state.playTimer && !menosMovimiento() && state.layer;
		if (fundir) retirarConFundido(state.layer, gj_anterior);
		else if (state.layer) map.removeLayer(state.layer);
```

## Repo conventions to follow

- Panes con z-index documentado: `arranque.js:33-35` (`warzones`, 450, con su
  renderer `L.svg`). Sigue el mismo patrón con `L.canvas` y comentario.
- `menosMovimiento()` viene del plan 002; si 002 no está hecho, usa
  `matchMedia('(prefers-reduced-motion: reduce)').matches` directamente.

## Steps

1. `arranque.js`: crea el pane `saliente` y `salienteRenderer` (declara
   `let salienteRenderer;` junto a `warRenderer`).
2. `mapa.js`: guarda el GeoJSON de la capa actual (`state.layerGj`) al crearla.
3. `mapa.js`: nueva función `retirarConFundido(oldLayer, oldGj)`:
   - quita `oldLayer` del mapa;
   - si existe `state.saliente`, retíralo ya (`map.removeLayer`);
   - crea `state.saliente = L.geoJSON(oldGj, { style: featureStyle, renderer: salienteRenderer, interactive: false }).addTo(map)`;
   - pane = `map.getPane('saliente')`; `pane.style.transition = 'none'; pane.style.opacity = 1;`
     fuerza reflow (`pane.offsetWidth`), luego
     `pane.style.transition = 'opacity 300ms cubic-bezier(0.77, 0, 0.175, 1)'; pane.style.opacity = 0;`
   - en `transitionend` (y con `setTimeout` de 400 ms como red), retira
     `state.saliente` si sigue siendo la misma capa.
4. `showYear`: usa `retirarConFundido` solo cuando `state.playTimer` está activo
   y no hay movimiento reducido; en otro caso, el `removeLayer` de siempre.
5. Sube `?v=`.

## Boundaries

- Do NOT animes nada al arrastrar el deslizador, con ◀ ▶, chips o marcas.
- Do NOT cambies etiquetas, batallas ni zonas de guerra (siguen cortando).
- Do NOT dupliques popups: la capa saliente es `interactive: false`.

## Verification

- **Mechanical**: `node --check web/js/mapa.js web/js/arranque.js`.
- **Feel check** (este plan hay que sentirlo en un **móvil real**, no solo en escritorio):
  - Reproducir a 4× desde 1400: las fronteras «se funden» en el nuevo mapa, sin
    parpadeo a blanco entre uno y otro.
  - A 4× (paso 600 ms) no se acumulan capas: en consola,
    `Object.keys(map._layers).length` se mantiene estable.
  - Pulsar ⏸ a mitad de fundido: la capa saliente desaparece en ≤ 400 ms.
  - DevTools → Performance a 4× en un móvil de gama media: sin frames > 50 ms
    atribuibles al pane saliente. **Si los hay, abandona el plan** (el corte seco
    es preferible a un fundido que da tirones).
  - Reduced-motion emulado: corte seco como antes.
- **Done when**: solo Reproducir funde, con máximo dos capas vivas.
