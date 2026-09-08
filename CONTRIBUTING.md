# Guía de contribución a Chronus Tabula

¡Gracias por querer ampliar la historia! El 95 % de las contribuciones no tocan código: consisten en **editar un fichero JSON pequeño en `datos/`**: uno por país (`datos/paises/<id>.json`), conflicto, evento o territorio, pensados para leerse y ampliarse a mano. El `web/data/historia.json` que descarga la web se **genera** a partir de ellos (no lo edites). Esta guía te enseña cada formato con ejemplos copiables, cómo probar tus cambios y qué debe llevar tu merge request.

## Índice

1. [El flujo en 5 pasos](#el-flujo-en-5-pasos)
2. [Cómo están organizados los datos](#cómo-están-organizados-los-datos)
3. [Añadir o modificar un país](#añadir-o-modificar-un-país)
4. [Añadir un conflicto con sus zonas y batallas](#añadir-un-conflicto)
5. [Añadir un evento o invento](#añadir-un-evento-o-invento)
6. [Trucos: nombres exactos, coordenadas y polígonos](#trucos)
7. [Validar y probar](#validar-y-probar)
8. [Checklist del merge request](#checklist-del-merge-request)
9. [Contribuciones que sí tocan código](#contribuciones-que-sí-tocan-código)

---

## El flujo en 5 pasos

```bash
# 1. Fork + clon del repositorio
git clone <tu-fork> && cd "mapa mundi anual"

# 2. Arranca la app en local
python api/servidor.py         # → http://localhost:9000 (mapa) y /admin.html (panel)

# 3. Edita el fichero de la entidad en datos/ (p. ej. datos/paises/espana.json)

# 4. Valida el fichero
python api/validar.py

# 5. Prueba en el navegador, haz commit y abre tu merge request
```

## Cómo están organizados los datos

Cada entidad vive en su propio fichero dentro de `datos/`: `paises/<id>.json`, `conflictos/<id>.json`, `eventos/<año>-<nombre>.json` y `territorios/<nombre>.json` (más `_meta.json` con la ayuda interna). Para añadir un país, crea `datos/paises/<id>.json`; para corregir uno, edita el suyo. Así cada cambio toca solo su fichero, el diff se lee de un vistazo y dos personas no chocan aunque trabajen a la vez. `python api/compilar.py` (o arrancar `servidor.py`) junta todo en `web/data/historia.json`, que es lo que descarga la web.

Vistos en conjunto, los datos tienen cuatro bloques. Los años **negativos significan a. C.** (−480 = 480 a. C.) en todo el fichero, y las coordenadas son siempre `[latitud, longitud]` en grados decimales.

```jsonc
{
  "_ayuda":     { ... },   // esta misma documentación, resumida dentro del fichero
  "paises":     [ ... ],   // entidades: nombres, gobernantes, población, linaje
  "conflictos": [ ... ],   // guerras: periodo, países, zonas por fases, batallas
  "eventos":    [ ... ]    // hechos puntuales: tratados, descubrimientos, inventos
}
```

Regla de oro: **casi todos los campos son opcionales**. Si a un país le faltan datos de población, su ficha simplemente no muestra esa fila. Empieza con poco y amplía después.

## Añadir o modificar un país

Cada entrada de `paises` enlaza una entidad histórica con los territorios del mapa y le da su ficha:

```jsonc
{
  "id": "suecia",                          // único, minúsculas, sin espacios
  "nombre": "Suecia",                      // título del popup, en español
  "nombres": ["Sweden", "Sweden–Norway"],  // ★ nombres EXACTOS en los mapas GeoJSON
  "wiki": "Suecia",                        // (opcional) artículo de es.wikipedia si difiere de "nombre"
  "relacionados": ["Reino de Suecia"],     // (opcional) linaje/alias para el filtro histórico
  "gobernantes": [                         // (opcional) reinados; se muestra el del año elegido
    { "desde": 1611, "hasta": 1632, "nombre": "Gustavo II Adolfo", "titulo": "Rey de Suecia" }
  ],
  "poblacion": [                           // (opcional) estimaciones; se muestra la más cercana
    { "anio": 1600, "valor": 1300000 }
  ]
}
```

- `nombres` es el campo clave: debe copiar **letra por letra** cómo aparece la entidad en los ficheros `web/data/geojson/world_*.geojson` (campos `NAME` o `SUBJECTO`). El mismo reino cambia de nombre entre siglos («Castilla» → «Castile» → «Castille»), así que la lista puede tener varios. [Cómo averiguarlos](#trucos).
- `relacionados` alimenta el filtro «Seguir un reino»: son los nombres de entidades predecesoras o aliadas cuya historia también pertenece a este país (España hereda «Corona de Castilla», «Califato de Córdoba»…). Se comparan con los `paises` de conflictos y eventos.
- Si dos gobernantes se solapan en un año (corregencias, guerras civiles), la ficha muestra ambos.

## Añadir un conflicto

Un conflicto se pinta en el mapa mientras el año elegido está entre `inicio` y `fin`: sus **zonas** (teatros de operaciones) se sombrean y sus **batallas** aparecen como marcadores ⚔️.

```jsonc
{
  "id": "gran-guerra-del-norte",
  "nombre": "Gran Guerra del Norte",
  "inicio": 1700, "fin": 1721,
  "paises": ["Suecia", "Rusia", "Polonia", "Dinamarca"],  // usados por el filtro por país
  "bajas": "~350.000 muertos",                             // texto libre
  "descripcion": "Rusia arrebata a Suecia la hegemonía del Báltico.",
  "wiki": "Gran Guerra del Norte",                         // artículo de es.wikipedia

  "zonas": [
    {
      "nombre": "Báltico oriental",
      "tipo": "frente",              // "frente" = franjas rojas · "ocupado" = sombreado suave
      "desde": 1700, "hasta": 1710,  // (opcional) fase; sin ellos, dura todo el conflicto
      "poligono": [ [59.5, 24], [59, 30.5], [56.5, 30], [56.5, 24] ]   // [lat, lng], 4-12 vértices
    },
    {
      "nombre": "Campaña de Ucrania (Poltava)",
      "tipo": "frente", "desde": 1708, "hasta": 1709,
      "poligono": [ [51, 31], [50.5, 35.5], [48.5, 35], [48.8, 31] ]
    }
  ],

  "batallas": [
    {
      "nombre": "Batalla de Poltava",
      "anio": 1709,                  // (opcional "hasta": 1710 si duró varios años, p. ej. un asedio)
      "lat": 49.6, "lng": 34.5,
      "bajas": "~9.000 suecos muertos y 3.000 prisioneros",   // (opcional)
      "descripcion": "Pedro I aplasta al ejército de Carlos XII.",  // (opcional)
      "wiki": "Batalla de Poltava"                                  // (opcional)
    }
  ]
}
```

Detalles que conviene saber:

- **Las zonas se recortan solas contra la costa real**: dibuja el polígono «gordo» sin miedo a pisar el mar — la app lo ajusta al contorno de los continentes. Si el teatro es naval o aéreo (Trafalgar, el Pacífico), añade `"mar": true` y no se recortará.
- **Fases**: en guerras largas, da a cada zona su `desde`/`hasta` para que el mapa cuente la película (en la 2GM, 1939 muestra Polonia; 1944, Normandía). Procura que no queden años del conflicto sin ninguna zona.
- **Bandos por color**: una zona `"ocupado"` admite `"color": "#2f5fa8"` para distinguir bandos (en la independencia de EE. UU., rojo = británicos, azul = patriotas).
- Las batallas se muestran **solo en su año** (`anio`, o el rango `anio`–`hasta` si duró varios); el lector puede ampliar el margen con el selector «Margen de años» del panel de capas.

## Añadir un evento o invento

Los `eventos` son hechos puntuales — tratados, descubrimientos, fundaciones, inventos — que aparecen como ⭐ (o 💡 si son inventos) cuando el año elegido cae en su rango:

```jsonc
{
  "nombre": "Canal de Suez",
  "anio": 1869,                      // año del hecho (se muestra ese año exacto...)
  "hasta": 1869,                     // (opcional) ...o durante un rango (p. ej. la Peste Negra 1347-1353)
  "lat": 30.7, "lng": 32.35,
  "categoria": "invento",            // (opcional) "invento" → icono 💡; sin categoría → ⭐
  "paises": ["Egipto", "Francia"],   // (opcional) para el filtro por país
  "descripcion": "Se inaugura el canal que une el Mediterráneo y el mar Rojo.",
  "wiki": "Canal de Suez"            // (opcional) artículo de es.wikipedia
}
```

**Convención de ubicación**: si el lugar exacto de un invento es difuso, se pone el pin en la **capital del territorio** donde surgió (el papel en Luoyang, la pólvora en Chang'an) y se menciona en la descripción.

## Añadir un territorio menor

Los `territorios` son enclaves e islas demasiado pequeños para apreciarse en el mapa mundial (Ceuta, Melilla, Canarias, Azores, Gibraltar…). Se pintan como un **punto del color de su país**, con etiqueta al acercar el zoom y su propia ficha:

```jsonc
{
  "nombre": "Melilla",
  "pais": "España",                 // debe coincidir con un país de 'paises' (nombre, nombres o relacionados) para heredar su color
  "lat": 35.29, "lng": -2.94,
  "desde": 1497,                    // año de incorporación
  "hasta": 1580,                    // (opcional) año en que dejó de pertenecer; sin él, hasta hoy
  "descripcion": "Tomada en 1497 por Pedro de Estopiñán para la Corona de Castilla.",
  "wiki": "Melilla"                 // (opcional) artículo de es.wikipedia
}
```

Si un lugar **cambió de dueño**, se crean varias entradas con las mismas coordenadas y periodos consecutivos (Gibraltar castellano 1462-1704 y británico desde 1704; Ceuta portuguesa 1415-1580 y española desde 1580): el mapa muestra en cada año la que corresponde, con el color del dueño de entonces.

## Trucos

**Averiguar el nombre exacto de una entidad en el mapa.** Abre la app, ve al año que te interesa y haz clic en el territorio: la ficha muestra «Nombre en el dato original» y «Soberanía» — esos son los valores que van en `nombres`. Alternativa por terminal:

```bash
python -c "import json; d=json.load(open('web/data/geojson/world_1700.geojson')); print(sorted({f['properties']['NAME'] for f in d['features']}))"
```

**Sacar coordenadas.** Clic derecho en Google Maps u OpenStreetMap → copia `lat, lng`. Dos decimales bastan.

**Dibujar un polígono de zona.** Con 4-12 vértices sobra: piensa en el rectángulo/trapecio que envuelve el teatro de operaciones, apunta sus esquinas en sentido horario y no te preocupes por el mar (se recorta solo). Puedes ayudarte de [geojson.io](https://geojson.io) — ojo: allí verás `[lng, lat]`, y en nuestros ficheros va **`[lat, lng]`** (invertido).

**Cifras de bajas y población.** Son campos de texto libre y estimaciones divulgativas: usa `~`, rangos («~4-8 millones») y, si las fuentes discrepan, dilo («según Josefo…»). Cita tu fuente en el merge request.

## Las referencias son obligatorias

Todo dato nuevo debe llevar `fuentes` — el validador avisa si falta y el MR no se aceptará sin ellas:

```jsonc
"fuentes": [
  { "id": "wikipedia-es:Gran Guerra del Norte", "url": "https://es.wikipedia.org/wiki/Gran_Guerra_del_Norte", "licencia": "CC BY-SA" },
  { "id": "wikidata:Q151616", "licencia": "CC0", "consultado": "2026-09-01" }
]
```

Formatos de `id`: `wikipedia-es:<artículo>`, `wikidata:Q…`, `owid:<dataset>`, `curado` (elaboración propia contrastada, explica la bibliografía en el MR). La app muestra las fuentes al pie de cada ficha.

## Añadir datos con el pipeline (opcional)

Para volúmenes grandes no hace falta teclear: `api/fuentes/` ingiere de APIs abiertas y deja **propuestas** en una base local que tú revisas y apruebas antes de exportar a `datos/` — o, más cómodo, desde el panel de administración en `http://localhost:9000/admin.html` (ver README). Las propuestas ya llegan con su fuente puesta.

## Validar y probar

Antes de abrir el merge request:

```bash
python api/validar.py
```

El validador comprueba: JSON bien formado, ids únicos, campos obligatorios, coherencia de años (`desde ≤ hasta`, batallas y zonas dentro de su conflicto), coordenadas en rango, tipos de zona válidos y que los `nombres` de países existan en algún GeoJSON. Si todo va bien termina con `✔ datos válidos`.

Después, prueba visual: arranca el servidor, ve a los años que tocan tus datos y comprueba que las zonas caen donde deben, que la ficha se abre y que el filtro «Seguir un reino» encuentra tu entidad (si tocaste `paises`).

## Checklist del merge request

- [ ] `python api/validar.py` pasa sin errores
- [ ] Probado en el navegador en los años afectados
- [ ] Años en formato correcto (negativos = a. C.) y coordenadas `[lat, lng]`
- [ ] `nombres` copiados exactamente de los GeoJSON (si añadiste un país)
- [ ] Descripción del MR: qué añades/corriges y **con qué fuente** (Wikipedia, bibliografía…)
- [ ] Todos los datos nuevos llevan `fuentes`
- [ ] Sin cambios de código no relacionados en el mismo MR

## Contribuciones que sí tocan código

- **Traducciones**: copia `web/i18n/es.json` a `web/i18n/<código>.json`, traduce los valores (las claves no se tocan), añade el idioma a `supported` en `web/js/i18n.js` y una `<option>` al selector de `index.html`.
- **Interfaz o lógica**: el JavaScript vive en `web/js/`, dividido por secciones que comparten ámbito global (sin build; el orden de carga lo fija `index.html`):

  | Fichero | Qué contiene |
  |---|---|
  | `nucleo.js` | estado global, constantes, preferencias y utilidades |
  | `datos.js` | carga de `historia.json`, países, seguimiento y relevancia |
  | `fichas.js` | popups, fuentes y extractos de Wikipedia |
  | `zonas.js` | zonas de guerra y recorte costero |
  | `capas.js` | marcadores: batallas, eventos y territorios menores |
  | `mapa.js` | estilo, etiquetas y escudos, análisis del año, carga y capas base |
  | `paneles.js` | leyenda, panel «Este año» y panel de capas |
  | `tiempo.js` | barra de tiempo, épocas del modo móvil, marcas y reproducción |
  | `arranque.js` | `init()` |

  Los estilos están en `web/css/styles.css`. La indentación del código es con **tabuladores** (hay un `.prettierrc` en la raíz: `prettier --write "web/js/*.js"` lo aplica solo). Para cambios grandes, abre antes un issue y lo hablamos.
- **Mapas base o de fronteras**: los GeoJSON provienen de [historical-basemaps](https://github.com/aourednik/historical-basemaps); si hay versiones nuevas, se regenera también `data/years.json`.
