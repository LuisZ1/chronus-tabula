# 005 — Navegador de zoom: arrastre a ritmo de frame

- **Status**: DONE (26-09-2026, sin commit)
- **Commit**: b02169b
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 fichero (`web/js/tiempo.js`), ~15 líneas

## Problem

El navegador de escritorio sigue al puntero 1:1 y respeta el punto de agarre
(bien hecho: `setPointerCapture`, `grabDX`). Pero **cada `pointermove`** llama a
`applyView()`, que reconstruye todas las marcas de la barra desde cero
(`box.innerHTML = ''` y cientos de `createElement`) además de mover la ventana.
Con un ratón de 1000 Hz eso son muchas reconstrucciones de DOM por frame: la
ventana va a tirones justo mientras el usuario la está manipulando.

```js
/* web/js/tiempo.js:99-106 — current */
function applyView() {
	navRender();
	if (historia) buildTimeMarks();
	const slider = document.getElementById('yearSlider');
	if (slider) slider.value = curYearToPos(state.requestedYear);
	actualizarPasoFlechas();
}
```

```js
/* web/js/tiempo.js:141-156 — current: pointermove */
	nav.addEventListener('pointermove', e => {
		if (!mode) return;
		...
		viewLo = Math.round(RANGO_MIN + loF * RANGO_SPAN);
		viewHi = Math.round(RANGO_MIN + hiF * RANGO_SPAN);
		applyView();
	});
```

## Target

- La ventana del navegador y las etiquetas de los extremos (`navRender`) se
  actualizan **en el siguiente frame** (`requestAnimationFrame`), una vez por
  frame como máximo.
- Las marcas (`buildTimeMarks`) se reconstruyen como mucho una vez por frame
  también, dentro del mismo rAF.
- En `pointerup` se hace una pasada final síncrona para que el estado final sea
  exacto.

```js
/* target — tiempo.js */
let viewRaf = 0;
function applyViewPronto() {
	if (viewRaf) return;
	viewRaf = requestAnimationFrame(() => {
		viewRaf = 0;
		applyView();
	});
}
```

## Repo conventions to follow

- Funciones en español con comentario de propósito encima (ver `applyView`).
- No se añaden dependencias.

## Steps

1. En `web/js/tiempo.js`, debajo de `applyView`, añade `viewRaf` y
   `applyViewPronto()` (arriba), con el comentario «arrastre: como mucho una
   reconstrucción por frame».
2. En el listener `pointermove` de `setupNavigator`, cambia `applyView()` por
   `applyViewPronto()`.
3. En el listener de `pointerup`/`pointercancel`, antes de `mode = null`:
   `if (viewRaf) { cancelAnimationFrame(viewRaf); viewRaf = 0; } applyView();`
   (solo si `mode` no era `null`).
4. Deja `pointerdown` y `dblclick` con `applyView()` directo (son un evento).
5. Sube `?v=`.

## Boundaries

- Do NOT cambies la lógica de `loF/hiF`, `MINW` ni `grabDX`.
- Do NOT toques el modo móvil (el navegador está oculto ≤ 720 px).

## Verification

- **Mechanical**: `node --check web/js/tiempo.js`.
- **Feel check**:
  - Arrastra un tirador rápido de un extremo a otro: la ventana va pegada al
    puntero sin tirones; las marcas se reagrupan en vivo.
  - DevTools → Performance durante el arrastre: sin tareas largas (> 50 ms)
    repetidas; `buildTimeMarks` aparece ≤ 1 vez por frame.
  - Al soltar, los extremos (`#edgeLo`, `#edgeHi`) muestran el tramo exacto.
- **Done when**: `pointermove` no llama a `applyView` directamente.
