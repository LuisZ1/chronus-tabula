# Planes de mejora de la interfaz

Revisión del 26-09-2026 sobre el commit `b02169b`, hecha con las skills de
`.claude/skills/`. Cada plan es autocontenido: lo puede ejecutar cualquier
agente sin contexto de esta conversación («ejecuta plans/001-…»).

## Planes

| # | Plan | Severidad | Estado | Depende de |
| --- | --- | --- | --- | --- |
| 001 | [Saltos de año sin la espera de 250 ms](001-saltos-de-ano-sin-espera.md) | HIGH | DONE | — |
| 002 | [Cámara del mapa con movimiento reducido](002-camara-del-mapa-con-movimiento-reducido.md) | MEDIUM | DONE | — |
| 003 | [Fichas de Leaflet desde su punta](003-fichas-leaflet-desde-su-punta.md) | MEDIUM | DONE | — |
| 005 | [Navegador: arrastre a un frame](005-navegador-arrastre-a-un-frame.md) | MEDIUM | DONE | — |
| 004 | [Fundido de fronteras al reproducir](004-fundido-de-fronteras-al-reproducir.md) | LOW | DONE | 002 (usa `menosMovimiento()`) |

**Ejecución (26-09-2026)**: los cinco aplicados sobre el código actual (con el deslizador móvil ya sin épocas; los números de línea de los planes eran de `b02169b`). Comprobado en navegador: ◀ ▶ y marcas pintan en ~80 ms frente a ~320 ms del deslizador (001); con movimiento reducido la cámara salta sin vuelo y el zoom no se anima (002); las fichas entran en 150 ms desde la punta (003); el navegador no deja rAF pendiente al soltar (005); al reproducir, la capa anterior se funde en ~300 ms y se retira, sin acumular capas (004). **Pendiente**: sentir el 004 en un móvil real y descartarlo si da tirones. Versión de caché `?v=24`.

**Orden recomendado**: 001 → 002 → 003 → 005 → 004. El 001 es la mejora que más
se nota con menos código. El 004 es el único que hay que validar en un móvil
real antes de darlo por bueno; si da tirones, se descarta.

Cada plan sube el `?v=` de `web/mapa.html`; si se ejecutan varios seguidos,
basta con subirlo una vez al final.

---

## Resumen de la revisión, skill por skill

### find-animation-opportunities + mobile-native
Aplicadas en `b02169b` (ver el mensaje del commit). Quedan fuera, a propósito:
los paneles plegables (ver «Candidatos no planificados») y el fundido de
fronteras (plan 004).

### review-animations — sobre el propio diff `b02169b`

| Before | After | Why |
| --- | --- | --- |
| `.mark-pop { transform-origin: bottom left }` | `transform-origin: 8% 100%` | El popover está desplazado `translateX(-8%)`: la marca que lo abre queda ~8 % a la derecha del borde, no en la esquina. Diferencia pequeña, pero el origen debe ser el disparador |
| `#loading` entra solo con fundido | añadir `translate: 0 -4px` → `0` en la entrada | Entrada de solo opacidad sin transformación inicial; con 4 px basta para que «llegue» |
| Press `:active` 160 ms en ambos sentidos | aceptable | El estándar pide asimetría en pulsaciones *deliberadas* (mantener pulsado); una pulsación simple puede ser simétrica |

**Veredicto: Approve.** Sin regresiones que rompan la sensación: curvas de
salida, duraciones < 300 ms, solo `transform`/`opacity`/`scale`, `:hover` con
control de puntero y movimiento reducido en la única entrada con escala. Las
dos filas de arriba son pulido LOW.

### improve-animations — auditoría (8 categorías)

| # | Sev. | Categoría | Dónde | Hallazgo | Plan |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Frecuencia / respuesta | `tiempo.js:449` | ◀ ▶, chips, marcas y casilla esperan 250 ms de debounce pensado solo para el deslizador | 001 |
| 2 | MEDIUM | Accesibilidad | `paneles.js:49,150,176` · `tiempo.js:236` · `arranque.js:24` | `flyTo`/`fitBounds`/zoom animados sin `prefers-reduced-motion`: el mayor movimiento de la app | 002 |
| 3 | MEDIUM | Curva y origen | `lib/leaflet/leaflet.css:179` | Fichas con `opacity 0.2s linear`, sin origen | 003 |
| 4 | MEDIUM | Rendimiento | `tiempo.js:141-156` | `pointermove` reconstruye todas las marcas por evento | 005 |
| 5 | LOW | Cohesión | `portada.css:119` | `.btn { transition: transform 0.08s ease, filter 0.15s ease }`: `filter` no se usa nunca y `:active` es `translateY(1px)`, distinto de la app (`scale(0.97)`, `--ease-out`) | sin plan: 3 líneas, ver abajo |
| 6 | LOW | Rendimiento / feel | `styles.css` `.spinner` | 0,8 s por vuelta; un spinner algo más rápido (0,6 s) hace la espera más corta a la vista | sin plan |

Oportunidades aditivas (sin corregir nada existente):

- **Reproducir** → plan 004.
- **Portada**: el cursor de la tira de épocas (`.tira .cursor`, «1492») es
  estático. Es la única pantalla de marketing y se ve una vez: tiene
  presupuesto de «explicación». Un recorrido lento del cursor (≈ 1,2 s,
  `--ease-in-out`) de la Antigüedad a 1492 al cargar explicaría la barra de
  tiempo sin texto. Con movimiento reducido, estático.

### emil-design-eng — pulido de la interfaz

| Before | After | Why |
| --- | --- | --- |
| Pastillas de marcas en móvil: 18 px de alto (`.tm-mob`, `styles.css:1007`) | 24 px de alto; filas en `top: 0` y `top: 28px`; `#timeMarksM` a 56 px | Blanco táctil muy por debajo de ~44 px; con dos filas pegadas es fácil tocar la de al lado |
| `.btn:active { transform: translateY(1px) }` + `transition: …0.08s ease, filter…` (portada) | `transform: scale(0.97)`; `transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1)` | Misma respuesta al pulsar en la portada y en el mapa; quita `filter` (no se anima nada con él) |
| `.tm-war:hover` / `.tm-event:hover` escalan de golpe | `transition: transform 125ms ease` en `.tmark` | Hover en escritorio: cambio de estado con `ease` corto en vez de salto |
| `#followClear` aparece/desaparece de golpe (`hidden`) | sin cambio | Frecuencia baja y es un control, no contenido: no merece animación |

### apple-design — fluidez, materiales, fundamentos

- **Respuesta** (§1): el hallazgo principal es el debounce del plan 001. El
  deslizador sí da respuesta continua (burbuja + etiqueta «Mostrando» al
  instante). Bien.
- **Manipulación directa** (§2): el navegador de zoom ya hace lo correcto
  (captura del puntero, respeta el punto de agarre). Solo le falta el ritmo de
  frame (plan 005).
- **Materiales** (§12): los paneles flotantes son blancos al 92–94 % y opacos.
  Probar `background: rgba(255,255,255,0.78); backdrop-filter: blur(14px) saturate(160%)`
  en `#topbar`, `#timebar`, `#layersPanel` y los paneles derechos, con
  `@media (prefers-reduced-transparency: reduce)` volviendo al blanco sólido.
  El mapa se intuiría detrás sin perder legibilidad. Es una decisión estética:
  la dejo como propuesta.
- **Flexibilidad** (§16): por debajo de 900 px **se ocultan «Este año» y la
  leyenda** (`styles.css`, `@media (max-width: 900px) { #rightPanels { display: none } }`).
  En móvil se pierde la mitad de la información. Es la mayor carencia de
  diseño que he visto. Lo natural sería una hoja inferior arrastrable (curva
  `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, cierre por velocidad
  > 0,11 px/ms, rubber-banding en el tope). No la planifico porque es una
  decisión de producto con varias formas posibles: buen caso para `/prototype`
  (ver abajo).
- **Wayfinding** (§16): en móvil los botones de zoom de Leaflet quedan bajo la
  barra superior (se ve en la captura a 390 px). Pasarlos a `bottomright` en
  móvil, o bajar su `top`, lo resuelve.

### Skills que no aplican aquí

| Skill | Motivo |
| --- | --- |
| `animate` | Es para *construir* animaciones; sus reglas (orden de decisiones, curvas, duraciones) están incorporadas en los planes. Úsala al ejecutarlos |
| `animation-vocabulary` | Glosario para poner nombre a efectos; no revisa código |
| `ask-sonner` | La web no usa Sonner ni React. El aviso de error (`alertBox`, `mapa.js`) reutiliza `#loading`; si algún día hay más avisos, merecería un componente de aviso propio, no una librería React |
| `pick-ui-library` | Su lista es de librerías React/npm; la web es HTML + JS sin empaquetador. Nada que adoptar sin cambiar de stack. Además solo se ejecuta si se invoca explícitamente |
| `prototype` | Solo se ejecuta si se invoca explícitamente. Encaja con la hoja inferior de móvil: `/prototype hoja inferior con «Este año» y la leyenda en móvil` |
| `animate-expo` | React Native / Expo |
| `write-swift` | Swift |

## Candidatos no planificados

- **Paneles plegables** (capas, leyenda, «Este año»): hoy `display: none`. Se
  puede animar con `grid-template-rows: 0fr → 1fr` + opacidad, 200 ms
  `--ease-out`, pero en `#layersPanel` las filas son hijos directos del panel y
  habría que envolverlas en un contenedor (cambio de marcado). Frecuencia baja
  y beneficio pequeño: lo dejo fuera salvo que lo quieras.
