# Procedencia de las láminas de la portada

Las 21 imágenes de esta carpeta son capturas de la propia aplicación (`web/mapa.html`), sin retoque ni generación por IA. Se usan en el primer pantallazo de `index.html` (la barra de escala cambia de una a otra) y en «Láminas para abrir en clase».

- Fecha: 2026-09-28.
- Método: Chromium sin interfaz (Playwright) abre `mapa.html#AÑO/LAT/LNG/ZOOM`. Antes de capturar se ocultan la interfaz, los marcadores (batallas, acontecimientos, territorios) y las teselas del mapa base. Quedan las fronteras, los rótulos y el mar (`--mar`).
- Paleta: las tintas del mapa mural (`TINTAS_MAPA` en `js/nucleo.js`, `--t-*` en `css/marca.css`).
- Años: −500 (ficheros `*-ac500`), 1000, 1492, 1650, 1815, 1914 y 2010.
- Variantes:
  - `ancho-*`: 2000×1125, capturada a 1600×900 con dpr 1,25, vista `44.00/14.00/4`.
  - `medio-*`: 1200×675, reducida desde `ancho`.
  - `movil-*`: 780×1100, vista `42.00/12.00/3.3`.
- Formato: WebP.
- Datos: fronteras de [historical-basemaps](https://github.com/aourednik/historical-basemaps) (véase el README: GPL-3.0 para el código, uso académico y educativo para los datos). Nombres de `datos/paises/`, con las fuentes citadas en cada ficha.

Las tres de −500 (`*-ac500`) se regeneraron el 2026-09-28 tras rellenar con `api/rellenar_geojson.py` la tierra sin atribuir del mapa de 500 a. C.; lo que sigue sin datos sale rayado, como en el mapa.

Las 21 se regeneraron de nuevo el 2026-09-28, con la interfaz en español, tras aplicar las correcciones de fronteras de `api/correcciones/` (consultas c01-c07) y los nombres por época nuevos de las fichas.

Las 21 se regeneraron el 2026-09-29 tras aplicar la tanda 1 de Euratlas (`api/correcciones/21-` a `24-` y `31-`): cambian las de 1492 (principado de Moldavia), 1650 (Hungría real de los Habsburgo) y −500 (rótulos de las fichas nuevas de pueblos, como «Pueblos germánicos»); las de 1000, 1815, 1914 y 2010 salen idénticas.

Si cambian la paleta o las fronteras, conviene regenerarlas con la misma receta: `python3 api/laminas.py` con la web servida en `http://127.0.0.1:9100/` (`cd web && python3 -m http.server 9100`).
