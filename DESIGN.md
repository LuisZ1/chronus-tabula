---
name: Chronus Tabula
description: Mapa histórico interactivo con la voz del mapa mural del aula.
colors:
  papel: "#ffffff"
  papel-2: "#f2f5f7"
  tinta: "#14202b"
  tinta-2: "#56626e"
  linea: "#c5cfd7"
  oceano: "#1b4a73"
  oceano-hondo: "#143a5b"
  oceano-texto-2: "#c9d9e8"
  mar: "#cfe2ef"
  rojo: "#b8291c"
  t-rosa: "#eaa39b"
  t-amarillo: "#f1d06e"
  t-verde: "#a9d18e"
  t-naranja: "#f2b27a"
  t-violeta: "#bda6d8"
  t-celeste: "#9cc7e0"
  t-ocre: "#d8b48a"
  t-salvia: "#b3d3c1"
  ok: "#1d6b3f"
  mal: "#b3261e"
  aviso: "#7d5300"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 1.8rem + 7vw, 7.5rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.01em"
  h2:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.5rem + 3vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 0.95
  rotulo:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.12em"
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1rem + 0.5vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "0.875rem"
rounded:
  chip: "2px"
  pill: "3px"
  control: "4px"
  tarjeta: "4px"
  panel: "6px"
spacing:
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.oceano}"
    textColor: "{colors.papel}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.oceano-hondo}"
  button-secondary:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 20px"
  chip:
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.chip}"
    padding: "4px 7px 3px"
  cartela:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    padding: "26px 30px 28px"
---

# Design System: Chronus Tabula

## Overview

**Creative North Star: "El mapa mural del aula"**

Chronus Tabula habla como una lámina cartográfica escolar impresa: papel blanco frío, tinta en filetes finos, un azul océano que ocupa superficies enteras y tintas políticas planas. La portada es la propia lámina, a sangre, con su cartela, su leyenda y su escala; el mapa y el panel heredan tipografía, color y componentes en modo de trabajo, sin decoración.

La prueba es siempre el mapa real: capturas de la aplicación, recuentos reales y enlaces que abren un momento exacto. Nada de ilustración que imite el producto.

**Key Characteristics:**

- Archivo condensada (62 %) en mayúsculas para títulos, años y rótulos; Archivo normal para leer.
- Filetes de 1,5 px en tinta como estructura; doble filete para marcos y cartelas.
- Azul océano como única superficie de acento a sección completa.
- Tintas políticas planas y rojo de batalla, compartidas entre el mapa y la portada.
- Esquinas casi rectas (2–6 px), sin cristal ni desenfoque.

## Colors

### Primary

- **Océano** (`oceano`): botones principales, secciones de acento («Tres gestos», cierre) y foco. Con blanco llega a 9,2:1. Sobre océano, el texto secundario usa `oceano-texto-2` (6,4:1).

### Secondary

- **Rojo de batalla** (`rojo`): batallas, zonas de guerra rayadas y el marcador de la barra de escala. Marca eventos, nunca decora (6,2:1 sobre papel).

### Tertiary

- **Tintas políticas** (`t-rosa` … `t-salvia`): el relleno de los estados en el mapa (`TINTAS_MAPA` en `js/nucleo.js` las amplía a 16 con variantes más hondas) y las muestras de leyenda. El amarillo (`t-amarillo`) también colorea la selección de texto, los números de los pasos sobre océano y el estado «Copiado».

### Neutral

- **Papel** (`papel`) y **papel en sombra** (`papel-2`): fondo y secciones alternas.
- **Tinta** (`tinta`, 16,5:1) para texto y filetes; **tinta-2** (6,2:1) para texto secundario; **línea** (`linea`) para separadores de 1 px.
- **Mar** (`mar`): el agua del mapa y el fondo de las láminas antes de cargar.

### Named Rules

**The One Ocean Rule.** El océano es la única superficie de color a sección completa; las tintas políticas nunca pintan fondos de sección.

**The Red Means War Rule.** El rojo se reserva para batallas, guerra y el marcador de año; no se usa para errores de interfaz (para eso, `mal`).

## Typography

**Display Font:** Archivo variable (autoalojada en `web/lib/fuentes/`, SIL OFL), anchura 62–125 %, peso 100–900.
**Body Font:** Archivo a anchura normal.
**Label/Mono Font:** monoespaciada del sistema, solo para código, rutas y enlaces.

**Character:** Condensada y firme como la rotulación de una lámina; legible proyectada.

### Hierarchy

- **Display** (800, condensada 62 %, `clamp(3.5rem … 7.5rem)`, interlineado 0,86): el año de la cartela y los titulares de lámina.
- **Headline** (800, condensada, mayúsculas, `clamp(2.25rem … 3.75rem)`): títulos de sección.
- **Rótulo** (800, condensada, mayúsculas, 0,8125rem, espaciado 0,12em): títulos de leyenda y de escala; en el mapa, 11px al 78 %.
- **Lead** (400, `clamp(1.125rem … 1.375rem)`, 1,5): entradillas.
- **Body** (400, 1,0625rem, 1,55): texto corrido, 65–75 caracteres por línea.

### Named Rules

**The Condensed Voice Rule.** Lo que en un mapa impreso iría rotulado (títulos, años, nombres, leyendas) va condensado en mayúsculas; lo que se lee en frases va en anchura normal.

## Layout

Contenedor de 1200 px con margen lateral `clamp(16px, 4vw, 40px)` y secciones separadas por `clamp(64px … 128px)` y un filete inferior. Las secciones de lectura usan dos columnas 5/7 (texto a la izquierda, leyenda o colofón a la derecha), que pasan a una sola por debajo de 1000 px.

La lámina de la portada ocupa la pantalla bajo una cabecera de 56 px. Lleva un marco de doble filete a 14 px del borde, la cartela arriba a la izquierda, la escala a todo el ancho abajo y la leyenda encima de la escala. En móvil (≤760 px) se apilan cartela y escala; la leyenda se remite a «Cómo se lee» y la navegación pasa a una fila desplazable.

## Elevation & Depth

Casi plano. La profundidad la dan los filetes, no las sombras. Solo las piezas que flotan sobre el mapa (cartela, paneles del mapa) llevan una sombra suave y difusa; no hay sombras duras desplazadas ni cristal.

### Named Rules

**The Paper Not Glass Rule.** Las superficies sobre el mapa son papel casi opaco (96–97 %) sin desenfoque.

## Shapes

Esquinas de impresión: 2 px en chips y rótulos del mapa, 4 px en botones y tarjetas, 6 px en paneles. Nada redondeado del todo, salvo los puntos de los territorios pequeños.

## Components

### Buttons

Rectángulos impresos de 44 px de alto con filete de tinta, peso 700 al 85 % de anchura. El principal es océano sobre blanco y pasa a océano hondo al pasar el ratón. Al pulsar se escala a 0,97. Sobre océano, el botón se invierte a blanco y pasa a amarillo al pasar el ratón.

### Chips

Etiqueta impresa: borde de 1 px del color del texto, condensada en mayúsculas de 0,75rem, esquina de 2 px.

### Cards / Containers

Tarjetas con filete de tinta y esquina de 4 px, solo donde el contenido difiere de verdad (formas de colaborar, ejemplos del asistente). Nunca tarjetas anidadas, y sin icono decorativo encabezando.

### Inputs / Fields

Campos en papel en sombra con borde de línea y foco océano de 2 px.

### Navigation

Cabecera blanca de 56 px con el logotipo en mayúsculas condensadas y los enlaces en condensada 700. El botón «Abrir el mapa» va siempre visible.

### Cartela

Recuadro blanco con doble filete (filete de 1,5 px más filete interior a 4 px). Contiene «El mundo en», el año en display y una frase. Es el título de la lámina.

### Barra de escala

El control de años: una barra de tramos alternos negros y blancos, como la escala gráfica de un mapa. El marcador es un rectángulo rojo de 18×30 px y debajo van los años como botones. Al cambiar de año, la captura cambia con un fundido de 420 ms y el año de la cartela rueda (salida 120 ms, entrada 200 ms). Al cargar, un único empujón 1492 → 1650 → 1492 enseña el gesto. Con «reducir movimiento» no hay empujón ni fundido.

### Leyenda

Leyenda con muestras de 34×16 px (60×24 px en la versión grande), bordeadas en tinta. Los estados son tres tintas, la guerra es rayado rojo y los rótulos son réplicas de los del mapa.

## Do's and Don'ts

### Do:

- **Do** enseñar el mapa real (capturas con su `PROCEDENCIA.md`) en lugar de describirlo.
- **Do** usar filetes de tinta para estructurar y el doble filete para marcos y cartelas.
- **Do** dar a cada momento su enlace `mapa.html#año/lat/lng/zoom`, con botón de copiar.
- **Do** mantener zonas táctiles de 44 px y contraste mínimo de 4,5:1, pensando en el proyector.

### Don't:

- **Don't** poner antetítulos sobre los títulos.
- **Don't** usar emojis ni caracteres Unicode como iconos: los iconos son SVG de trazo 1,6.
- **Don't** usar texto degradado, cristal, sombras duras desplazadas ni bordes laterales de color de más de 1 px.
- **Don't** organizar una página como rejilla de tarjetas iguales de icono + título + texto.
- **Don't** nombrar al público («para profesores y alumnos»); lo transmiten los ejemplos y el rigor.
