# 003 — Fichas (popups de Leaflet): entrada desde su punta con curva de salida

- **Status**: DONE (26-09-2026, sin commit)
- **Commit**: b02169b
- **Severity**: MEDIUM
- **Category**: Easing & duration / Physicality & origin
- **Estimated scope**: 1 fichero (`web/css/styles.css`), ~20 líneas

## Problem

Las fichas son la superficie de contenido principal (se abren al pulsar un
territorio, batalla, evento…; frecuencia ocasional-alta). Entran con el fundido
por defecto de Leaflet: `opacity` en **200 ms `linear`** y sin transformación, así
que «aparecen de la nada» en vez de salir del punto pulsado.

```css
/* web/lib/leaflet/leaflet.css:179-187 — current (librería: NO editar) */
.leaflet-fade-anim .leaflet-popup {
	opacity: 0;
	-webkit-transition: opacity 0.2s linear;
	   -moz-transition: opacity 0.2s linear;
	        transition: opacity 0.2s linear;
	}
.leaflet-fade-anim .leaflet-map-pane .leaflet-popup {
	opacity: 1;
	}
```

Leaflet coloca `.leaflet-popup` con `transform: translate3d(...)` en línea, así
que **no se puede usar `transform`** para la escala: se usa la propiedad
independiente `scale`, que se compone con el `transform` de Leaflet.

## Target

- Opacidad y escala en **150 ms** con `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
  (token ya definido en `:root` de `styles.css`).
- Escala de entrada `0.96` → `1`, con `transform-origin` en la punta
  (abajo al centro), donde está el punto pulsado.
- Movimiento reducido: solo el fundido, sin escala.

```css
/* target — web/css/styles.css, sección «---- Popup ----» */
.leaflet-fade-anim .leaflet-popup {
	transform-origin: 50% 100%; /* la ficha sale de su punta, el punto pulsado */
	transition:
		opacity 150ms var(--ease-out),
		scale 150ms var(--ease-out);
}
@starting-style {
	.leaflet-fade-anim .leaflet-map-pane .leaflet-popup {
		scale: 0.96;
	}
}
@media (prefers-reduced-motion: reduce) {
	@starting-style {
		.leaflet-fade-anim .leaflet-map-pane .leaflet-popup {
			scale: 1;
		}
	}
}
```

## Repo conventions to follow

- Mismo patrón que ya usa `.mark-pop` en `web/css/styles.css` (busca
  `@starting-style`): propiedad `scale`, `--ease-out`, bloque de movimiento
  reducido que deja solo la opacidad.

## Steps

1. En `web/css/styles.css`, justo antes de `.territory-popup h3`, añade el
   bloque «target» con un comentario de cabecera: «fichas de Leaflet: fundido
   150 ms con curva de salida y escala desde la punta (Leaflet usa transform en
   línea; por eso `scale` y no `transform`)».
2. Sube `?v=` del CSS en `web/mapa.html`.

## Boundaries

- Do NOT edites `web/lib/leaflet/leaflet.css` (librería vendorizada).
- Do NOT toques `.leaflet-popup-content-wrapper` ni la punta (`.leaflet-popup-tip`).
- Do NOT añadas animación de cierre propia: Leaflet ya funde la ficha al
  cerrarla (pone `opacity: 0` en línea y la retira a los 200 ms); con la nueva
  transición ese fundido pasa a 150 ms, que basta. Sin escala a la salida.
- Nota: Leaflet controla la opacidad con estilo en línea (`setOpacity` 0 → 1
  al abrir), por eso la transición de `opacity` funciona sin `@starting-style`;
  solo la escala lo necesita.

## Verification

- **Mechanical**: el CSS carga sin avisos en la consola.
- **Feel check**:
  - Pulsa un territorio: la ficha crece ligeramente desde la punta, no desde su
    centro. DevTools → Animations al 10 %: la punta queda fija en el punto.
  - Abre fichas de un territorio a otro rápido: ningún salto de posición (el
    `translate3d` de Leaflet sigue funcionando).
  - Arrastra el mapa con una ficha abierta: se mueve con el mapa sin retraso.
  - Con reduced-motion emulado: solo fundido.
  - Safari < 17.5 / navegadores sin `@starting-style`: aparece sin escala (degradación aceptable).
- **Done when**: la ficha entra en 150 ms con `--ease-out` desde la punta.
