# Correcciones de los mapas base

`api/corregir_mapas.py` aplica los ficheros `*.json` de esta carpeta a los mapas `web/data/geojson/world_*.geojson`, en orden alfabético de fichero y, dentro de cada uno, en el orden en que aparecen. Parte siempre del **original** de cada mapa. La primera vez que corrige un mapa, guarda una copia exacta del mapa tal como estaba en `api/geo/originales/`, y esa copia hay que subirla al repositorio con el resto. El script es idempotente: cada mapa corregido lleva una huella de su original, sus operaciones y los ficheros que usa, y si la huella no cambia, el mapa no se reescribe.

## Ficheros y reparto

| Fichero | Mapas (año del fichero `world_*.geojson`) | Geometrías |
|---|---|---|
| `10-antiguedad.json` | años ≤ 500 | `api/geo/correcciones/antiguedad-*.geojson` |
| `20-medieval.json` | 501 a 1500 | `api/geo/correcciones/medieval-*.geojson` |
| `30-moderna.json` | 1501 a 1815 | `api/geo/correcciones/moderna-*.geojson` |
| `40-contemporanea.json` | ≥ 1816 | `api/geo/correcciones/contemporanea-*.geojson` |

Cada época edita solo su fichero y sus geometrías. `00-ejemplo.json` está vacío y sirve de plantilla. `world_2011` no se corrige, porque lo genera `api/derivar_mapas.py` a partir de `world_2010`: se corrige `world_2010` y el cambio pasa a 2011.

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
5. `python3 api/compilar.py` y `python3 api/validar.py`; vistas previas con `api/vista_previa.py`

Cada paso es idempotente. Si el paso 1 reescribe un mapa, hay que volver a pasar los pasos 2 a 4. Los rellenos que ya estaban en el original no se repiten. Si un mapa deja de tener correcciones, el paso 1 restaura su original. Un mapa nuevo que ya no se define hay que borrarlo a mano.

## Reglas

- No edites a mano `web/data/years.json` ni los mapas corregidos, porque se regeneran. Tampoco edites `api/geo/originales/`, salvo para poner allí un mapa nuevo de historical-basemaps.
- Pon `BORDERPRECISION: 1` en `props` cuando la frontera sea una reconstrucción aproximada.
- No inventes. Si no hay fuente, no hay operación: anótalo en la propuesta.
- Si cambias la semántica de `corregir_mapas.py`, sube `VERSION` en el script (o usa `--forzar`), porque la huella no incluye el código.
