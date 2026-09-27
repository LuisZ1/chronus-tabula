# 001 — Saltos de año discretos sin la espera de 250 ms

- **Status**: DONE (26-09-2026, sin commit)
- **Commit**: b02169b
- **Severity**: HIGH
- **Category**: Purpose & frequency (latencia en la respuesta)
- **Estimated scope**: 1 fichero (`web/js/tiempo.js`), ~6 líneas

## Problem

Todas las peticiones de año pasan por un debounce de 250 ms antes de pintar el
mapa, también las que son **una sola acción discreta**: pulsar ◀ ▶, un chip de
época, una marca de la barra, una fila del panel «Este año» o escribir un año.
El usuario pulsa ▶ y el mapa tarda un cuarto de segundo en cambiar, aunque el
año ya esté en caché. Las flechas se pulsan decenas de veces por sesión: es la
latencia que más se nota en la app.

El debounce solo tiene sentido para el **arrastre del deslizador**, que dispara
`input` decenas de veces por segundo.

```js
/* web/js/tiempo.js:405-450 — current */
let yearDebounce;

function requestYear(y, opts = {}) {
	...
	clearTimeout(yearDebounce);
	yearDebounce = setTimeout(
		() => {
			showYear(y);
			updateBattles();
			updateEvents();
			updateTerritorios();
			updateWarZones();
			updateYearPanel();
			writeHash();
		},
		opts.fromPlay ? 0 : 250
	);
}
```

```js
/* web/js/tiempo.js:485-487 — current: el único origen continuo */
	slider.addEventListener('input', () => {
		requestYear(curPosToYear(+slider.value));
		showSliderBubble(slider);
	});
```

## Target

- El debounce de 250 ms se aplica **solo** cuando la petición viene del
  deslizador (`opts.fromSlider === true`).
- Cualquier otra petición se pinta sin espera (`0` ms, igual que `fromPlay`).

```js
/* target — web/js/tiempo.js, dentro de requestYear */
	yearDebounce = setTimeout(
		() => { /* …igual que ahora… */ },
		opts.fromSlider ? 250 : 0
	);
```

```js
/* target — web/js/tiempo.js, listener del deslizador */
	slider.addEventListener('input', () => {
		requestYear(curPosToYear(+slider.value), { fromSlider: true });
		showSliderBubble(slider);
	});
```

## Repo conventions to follow

- `requestYear(y, opts)` ya recibe banderas de origen en `opts` (`force`,
  `fromPlay`); `fromSlider` sigue el mismo patrón.
- Comentarios en español, explicando el porqué (ver `tiempo.js:1-60`).

## Steps

1. En `web/js/tiempo.js`, en `requestYear`, cambia `opts.fromPlay ? 0 : 250`
   por `opts.fromSlider ? 250 : 0`. Añade encima un comentario: «solo el
   arrastre del deslizador espera 250 ms (dispara input sin parar); flechas,
   chips, marcas y la casilla responden al instante».
2. En `setupControls`, en el listener `input` de `#yearSlider`, pasa
   `{ fromSlider: true }` como segundo argumento de `requestYear`.
3. Sube `?v=22` → `?v=23` en los `<script>` de `web/mapa.html` (11 apariciones
   junto con el CSS).

## Boundaries

- Do NOT cambies `showYear`, la caché ni `stopPlay`.
- Do NOT quites el `clearTimeout(yearDebounce)`: sigue haciendo falta para
  cancelar un arrastre pendiente si luego se pulsa una flecha.
- Si el código no coincide con los extractos (cambios desde b02169b), STOP y
  avisa en vez de improvisar.

## Verification

- **Mechanical**: `node --check web/js/tiempo.js` sin errores.
- **Feel check** (`python api/servidor.py` o servidor estático en `web/`):
  - Pulsa ▶ varias veces seguidas: el mapa cambia en cada pulsación sin retardo
    perceptible con años ya visitados.
  - Arrastra el deslizador de lado a lado: no se descargan mapas intermedios en
    ráfaga (Network: solo aparece la petición del año donde paras).
  - Pulsa ▶ y en seguida arrastra: no se pinta un año viejo después del nuevo
    (`loadToken` lo cubre; compruébalo).
- **Done when**: solo el `input` del deslizador lleva `fromSlider`, y el resto
  de rutas llama a `showYear` en el mismo tick.
