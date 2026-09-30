# Correcciones de los mapas base

`api/corregir_mapas.py` aplica los ficheros `*.json` de esta carpeta a los mapas `web/data/geojson/world_*.geojson`, en orden alfabético de fichero y, dentro de cada uno, en el orden en que aparecen. Parte siempre del **original** de cada mapa. La primera vez que corrige un mapa, guarda una copia exacta del mapa tal como estaba en `api/geo/originales/`, y esa copia hay que subirla al repositorio con el resto. El script es idempotente: cada mapa corregido lleva una huella de su original, sus operaciones y los ficheros que usa, y si la huella no cambia, el mapa no se reescribe.

## Ficheros y reparto

| Fichero | Mapas (año del fichero `world_*.geojson`) | Geometrías |
|---|---|---|
| `10-antiguedad.json` | años ≤ 500 | `api/geo/correcciones/antiguedad-*.geojson` |
| `15-roma.json` | años ≤ 500: frontera de Roma y de sus vecinos, y sus mapas intermedios (-264 a 476); se aplica después de `10-antiguedad.json` | `api/geo/correcciones/roma-*.geojson` (de momento ninguna: regiones en línea) |
| `20-medieval.json` | 501 a 1500 | `api/geo/correcciones/medieval-*.geojson` |
| `21-euratlas-pueblos.json` | 200 a 600: pueblos de Germania Magna y la Europa oriental sobre tierra sin datos (propuesta Euratlas siglos I-VI) | `api/geo/correcciones/euratlas-pueblos-zonas.geojson` |
| `22-euratlas-britania.json` | 560, 600, 700 y 720: reinos de Britania e Irlanda (propuesta Euratlas siglo VII) | `api/geo/correcciones/medieval-euratlas-britania.geojson` |
| `23-euratlas-650.json` | crea `world_650` desde `world_600`: califato rashidun (propuesta Euratlas siglo VII) | regiones en línea |
| `24-euratlas-moldavia.json` | 1453, 1492 y 1500: principado de Moldavia (propuesta Euratlas siglos XVI-XVII) | `api/geo/correcciones/euratlas-moldavia-region.geojson` |
| `25-euratlas-culturas.json` | -1 a 118 (`world_bc1`, 14, 46, 100, 106, 117 y 118): culturas de la Edad del Hierro renombradas a los pueblos del siglo I (Lugii, Goths, Germanic tribes, Balts, Zarubintsy culture); solo `renombrar` con `patron` (propuesta Euratlas siglos I-VI, B) | ninguna |
| `26-euratlas-magiares.json` | 900 y 950: conquista húngara de la cuenca de los Cárpatos y pechenegos en Etelköz; en 950 repite las operaciones porque `20-medieval.json` crea `world_950` antes (propuesta Euratlas siglos IX-X, A) | regiones en línea (contornos de `world_1000` y `world_400` originales) |
| `27-euratlas-dacia.json` | 271 a 363: carpos, taifalos, godos y tervingios en la Dacia sin datos; se aplica después de `21-euratlas-pueblos.json` (propuesta Euratlas siglos I-VI, C) | regiones en línea |
| `28-euratlas-leon.json` | 1050, 1100 y 1150: «Kingdom of León and Castile» (uniones de 1037-1065 y 1072-1157), Calatrava y Almería en 1150 (propuesta Euratlas siglo XII) | regiones en línea |
| `29-euratlas-bajas-antiguedad.json` | crea `world_85` desde `world_46`: Agri Decumates flavios y Britania de Agrícola hasta el istmo Forth-Clyde; repite a mano los rellenos de `world_46` (Celts, Germanic tribes, Sarmates, Arabs) porque `RELLENOS` no incluye el 85 (propuesta Euratlas siglos I-VI, D) | regiones en línea |
| `30-moderna.json` | 1501 a 1815 | `api/geo/correcciones/moderna-*.geojson` |
| `31-euratlas-hungria.json` | 1580, 1600 y 1650: Hungría real de los Habsburgo (propuesta Euratlas siglos XVI-XVII); se aplica después de `30-moderna.json` | `api/geo/correcciones/euratlas-hungria-frontera.geojson` |
| `32-euratlas-principados.json` | 1500, 1530, 1580, 1600 y 1650: Valaquia, Moldova y Transilvania (reino húngaro oriental en 1530) como principados vasallos otomanos, y Pocutia polaca; se aplica después de `31-euratlas-hungria.json` (propuesta Euratlas siglos XVI-XVII, C) | regiones en línea |
| `34-euratlas-bajas-medieval.json` | 800, 900, 950 y 1300: Panonia occidental franca y resto ávaro tributario (800), Asturias y León hasta el Duero (900 y 950) y beylik de Osmán (1300); se aplica después de `20-medieval.json` y `26-euratlas-magiares.json` (propuesta Euratlas siglos IX-X, B y C, y bajas del resumen) | regiones en línea |
| `35-euratlas-bajas-moderna.json` | 1492 y 1500: la Pale («Lordship of Ireland») y la Irlanda gaélica; 2000 y 2010: «Byelarus» → «Belarus» (2011 y 2020 lo heredan; 1994 no, porque `40-contemporanea.json` crea 1990 desde él con «Byelarus»). Cruza épocas a propósito (bajas del resumen Euratlas) | regiones en línea |
| `40-contemporanea.json` | ≥ 1816 | `api/geo/correcciones/contemporanea-*.geojson` |

Cada época edita solo su fichero y sus geometrías. `00-ejemplo.json` está vacío y sirve de plantilla. `world_2011` y `world_2020` se crean en `40-contemporanea.json` a partir de `world_2010` (Sudán del Sur, con la geometría de Natural Earth y la tierra sobrante de la silueta de Sudán repartida entre sus vecinos: `api/geo/correcciones/sudan-del-sur-vecinos.geojson`).

## Formato

```json
{"tema": "Edad Moderna: fronteras (consulta c06)",
 "mapas": {
   "world_1600.geojson": [op, ...],
   "world_1520.geojson<world_1500.geojson": [op, ...]
 }}
```

- Una clave `"world_NUEVO.geojson<world_BASE.geojson"` crea un mapa nuevo copiando el estado de la base en ese punto de la secuencia y aplicándole las operaciones. `years.json` se actualiza solo.
- Toda operación lleva `"motivo"`, redactado en español con palabras propias, y `"fuente"` (una URL o una referencia) cuando la haya.
- Las features tocadas reciben `CORREGIDO: {base, motivo, fuente}` en los mapas existentes, o `DERIVADO: {...}` en los mapas nuevos. Las vecinas que ceden territorio reciben «cede territorio a «X»: motivo».

### Operaciones

| op | Campos | Qué hace |
|---|---|---|
| `renombrar` | `de`, `props` | Une todas las features con `NAME == de` en una sola y le aplica `props`. Si el NAME nuevo ya existe, se funde con él. Es el formato de los specs del cartógrafo A. |
| `renombrar` | `patron`, `poner` | Cambia propiedades (NAME, SUBJECTO, ABBREVN, PARTOF…) de cada feature que case con `patron`, sin tocar la geometría. Cada entrada de `carto-B-renombres.json` se convierte en una op de este tipo por cada mapa de su lista `mapas`. |
| `asignar` | `region`, `desde` (lista de NAME o `"*"`), `libre` (bool), `props` | La parte de `region` que pertenece a las entidades de `desde` (y también a la tierra sin datos, si `libre` es true) pasa a `props.NAME`, que se crea si no existe (con BORDERPRECISION 1 por defecto). Con `"NAME": null`, esa parte pasa a «sin datos». |
| `quitar` | `de`, `a` (NAME o null) | La entidad se une a `a` o pasa a «sin datos». |
| `recortar` | `de` | Quita a la entidad todo lo que solapa con otras entidades con nombre. |
| `sustituir` | `geometria`, `nombres`, `modo`, `resto`, `props` | Toma de `geometria` (un fichero de `api/geo/correcciones/`) las features cuyo NAME esté en `nombres`. Si las features tienen la propiedad `MAPA`, solo usa las de este mapa. Las recorta a la tierra del mapa y quita a las vecinas, incluida la tierra sin datos, lo que solapa. Con `modo: "sustituir"` (el valor por defecto), esa es la geometría completa de la entidad y lo que deja pasa a `resto` (NAME o null = sin datos). Con `modo: "añadir"`, las piezas se suman a lo que la entidad ya tenía. |

Regiones (`region`):

- `{"caja": [lon1, lat1, lon2, lat2]}`
- `{"pol": [[lon, lat], ...]}`: el orden es **lon, lat**, al revés que en las zonas de `datos/`.
- `{"feat": NAME}`: la entidad en el estado actual de este mapa. Con `"mapa": "world_X.geojson"`, la entidad en el **original** de ese mapa.
- `{"archivo": "api/geo/…geojson", "nombre": NAME}`
- `{"y": [R, ...]}` (unión), `{"n": [R, ...]}` (intersección) y `{"menos": [R, R, ...]}` (la primera menos las demás).

### Cómo pasar las propuestas

- **Cartógrafo A** (`revisiones/propuestas/herramientas-carto-A/specs/*.json`): copia las listas de operaciones tal cual, sin `salida_geojson`, en el orden de `todo_all.sh`. Se ha comprobado que la herramienta reproduce exactamente `cartoA/despues/` (los 32 mapas, 4 de ellos nuevos) cuando se aplican los 17 specs en ese orden. Después hay que pasar los rellenos de `rellenos.py`, que van a `RELLENOS` de `api/rellenar_geojson.py`.
- **Cartógrafo B** (`revisiones/propuestas/carto-B-*.geojson`, piezas con NAME destino, DE, MAPA, MOTIVO y FUENTE): copia el fichero a `api/geo/correcciones/<epoca>-<tema>.geojson` y usa `{"op": "sustituir", "modo": "añadir", "geometria": "...", "nombres": [NAME destino...], "motivo": "..."}` en cada mapa. El filtro por `MAPA` ya elige las piezas de ese año, y el MOTIVO y la FUENTE de cada pieza pasan a `CORREGIDO`.

## Comandos

```sh
python3 api/corregir_mapas.py --solo 30-moderna.json --check   # informe (km² por op, tierra perdida, solapes) sin escribir
python3 api/corregir_mapas.py --solo 30-moderna.json           # escribe solo los mapas de tu fichero (+ years.json)
python3 api/corregir_mapas.py --check                          # todo; código 1 si hay algo pendiente
python3 api/corregir_mapas.py --informe                        # recalcula e informa aunque todo esté al día
python3 api/corregir_mapas.py --forzar                         # reescribe aunque la huella coincida (tras cambiar el script)
```

`--solo` aplica todas las operaciones que afectan a los mapas de ese fichero, así que el resultado es el mismo que en la ejecución completa. Si otro fichero toca los mismos mapas, avisa. La salida debe terminar con «tierra perdida 0 km², añadida 0 km²; solapes … 0» en cada mapa y sin ⚠. Un ⚠ indica un NAME que no existe o un fichero sin piezas para ese mapa.

## Canalización (en este orden)

1. `python3 api/corregir_mapas.py`: originales + correcciones → `web/data/geojson/`
2. `python3 api/limpiar_geojson.py`: PARCHES (duplicados y anacronismos)
3. `python3 api/rellenar_geojson.py`: RELLENOS (tierra sin datos con pueblos de mapas vecinos)
4. `python3 api/derivar_mapas.py`: mapas posteriores a 2010
5. `python3 api/colorear.py`: colores de cada mapa para que dos vecinas no coincidan (`web/data/colores.json`)
6. `python3 api/compilar.py` y `python3 api/validar.py`; vistas previas con `api/vista_previa.py`

Al final del paso 1, cada mapa pasa dos limpiezas automáticas, que salen en el informe:

- `∪` **fundir_sin_datos**: los trozos sin datos que ha creado o tocado una corrección se unen a la tierra sin datos vecina.
- `·` **asignar_astillas**: en las features sin datos tocadas por una corrección, y solo en los polígonos que no están tal cual en el original:
  - los de área ~0 (menos de 0,01 km², medida también en el plano lon/lat, donde un triángulo de vértices alineados tiene área 0 aunque la proyección lo abra) se descartan;
  - los de menos de 50 km² (`MIN_KM2`, el umbral por debajo del cual ninguna operación mueve nada) pasan a la entidad con nombre con la que comparten más contorno, si comparten al menos el 20 % del suyo.

  Son las astillas de medio píxel que deja un recorte cuyos vértices no casan con los de la vecina, y que la web dibujaba como rayas grises dentro de los Sajones, el Reino franco o los ávaros. Las islas y la tierra sin datos del original no se tocan. El informe da cuántas se asignan, a quién, cuántas se descartan y la tierra perdida (área plana), que debe ser 0.
- Al escribir, las geometrías tocadas se ajustan con `set_precision` (shapely ≥ 2.0) a la rejilla de 1e-4°, la de los 4 decimales con que se escriben. Así el redondeo no deja espigas de anchura nula (un vértice que sale y vuelve al mismo punto), que la web también dibujaba como líneas dentro de una entidad. Las features que no toca ninguna corrección se escriben tal cual.

Cada paso es idempotente. Si el paso 1 reescribe un mapa, hay que volver a pasar los pasos 2 a 5. Los rellenos que ya estaban en el original no se repiten. Si un mapa deja de tener correcciones, el paso 1 restaura su original. Un mapa nuevo que ya no se define hay que borrarlo a mano.

## Reglas

- No edites a mano `web/data/years.json` ni los mapas corregidos, porque se regeneran. Tampoco edites `api/geo/originales/`, salvo para poner allí un mapa nuevo de historical-basemaps.
- Pon `BORDERPRECISION: 1` en `props` cuando la frontera sea una reconstrucción aproximada.
- No inventes. Si no hay fuente, no hay operación: anótalo en la propuesta.
- Si cambias la semántica de `corregir_mapas.py`, sube `VERSION` en el script (o usa `--forzar`), porque la huella no incluye el código. `VERSION` 2 (2026-09-29): astillas sin datos y rejilla de escritura.
