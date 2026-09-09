# Guía de contribución a Chronus Tabula

¡Gracias por querer ampliar la historia! El 95 % de las contribuciones no tocan código: consisten en **editar un fichero JSON pequeño en `datos/`**: uno por país (`datos/paises/<id>.json`), conflicto, evento o territorio, pensados para leerse y ampliarse a mano. El `web/data/historia.json` que descarga la web se **genera** a partir de ellos (no lo edites). Esta guía te enseña cada formato con ejemplos copiables, cómo probar tus cambios y qué debe llevar tu merge request.

## Índice

1. [El flujo en 5 pasos](#el-flujo-en-5-pasos)
2. [Cómo están organizados los datos](#cómo-están-organizados-los-datos)
3. [Añadir o modificar un país](#añadir-o-modificar-un-país)
4. [Añadir un conflicto con sus zonas y batallas](#añadir-un-conflicto)
5. [Añadir un evento o invento](#añadir-un-evento-o-invento)
6. [Añadir un territorio menor](#añadir-un-territorio-menor)
7. [Trucos: nombres exactos, coordenadas y polígonos](#trucos)
8. [Las referencias son obligatorias](#las-referencias-son-obligatorias)
9. [Formato canónico, esquemas y marca de revisión](#formato-canónico-esquemas-y-marca-de-revisión)
10. [Validar y probar](#validar-y-probar)
11. [Checklist del merge request](#checklist-del-merge-request)
12. [Contribuciones que sí tocan código](#contribuciones-que-sí-tocan-código)

---

## El flujo en 5 pasos

```bash
# 1. Fork + clon del repositorio
git clone <tu-fork> && cd "mapa mundi anual"

# 2. Arranca la app en local
python api/servidor.py         # → http://localhost:9000 (mapa) y /admin.html (panel)

# 3. Edita (o crea) el fichero de la entidad en datos/ (p. ej. datos/paises/espana.json)

# 4. Formatea y valida
python api/formatear.py        # formato canónico (orden de claves, tabs, listas por año)
python api/validar.py          # estructura (schema/), fechas, coordenadas, nombres, fuentes

# 5. Prueba en el navegador, haz commit y abre tu merge request
```

## Cómo están organizados los datos

Cada entidad vive en su propio fichero dentro de `datos/`. Así cada cambio toca solo su fichero, el diff se lee de un vistazo y dos personas no chocan aunque trabajen a la vez.

```
datos/
  paises/<id>.json                 espana.json, rd-congo.json, sacroimperio.json…
  conflictos/<id>.json             guerra-de-los-cien-anos.json…
  eventos/<año>-<nombre>.json      1492-descubrimiento-de-america.json; a. C. → 480ac-batalla-de-salamina.json
  territorios/<nombre>.json        gibraltar.json, ceuta.json (uno por periodo si cambió de dueño)
  _meta.json                       claves de primer nivel que no son colecciones (la ayuda interna)
schema/
  pais.json, conflicto.json, evento.json, territorio.json   el contrato de cada colección (JSON Schema)
```

- **Nombre del fichero**: en `paises/` y `conflictos/` es el `id`; en `eventos/` es `<año>-<nombre en minúsculas y con guiones>`; en `territorios/` es el nombre. `formatear.py` te avisa si no cuadra.
- **Para añadir** un país, crea `datos/paises/<id>.json`; **para corregir** uno, edita el suyo. Nada más: no hay índices que mantener.
- **`web/data/historia.json` se genera**: `python api/compilar.py` (o arrancar `servidor.py`, o el despliegue) junta todo en ese único JSON, que es lo que descarga la web. No se edita a mano ni se versiona (está en `.gitignore`). El camino inverso existe: `python api/dividir.py fichero.json` reparte un JSON completo en `datos/`.

Vistos en conjunto, los datos tienen cuatro colecciones. Los años **negativos significan a. C.** (−480 = 480 a. C.) en todos los ficheros, y las coordenadas son siempre `[latitud, longitud]` en grados decimales.

```jsonc
{
  "_ayuda":      { ... },   // datos/_meta.json: esta documentación, resumida
  "paises":      [ ... ],   // entidades: nombres, gobernantes, población, escudos y banderas, reseña, revisión
  "conflictos":  [ ... ],   // guerras: periodo, bandos, zonas por fases, batallas
  "eventos":     [ ... ],   // hechos puntuales: tratados, descubrimientos, inventos
  "territorios": [ ... ]    // enclaves e islas que no se ven a escala mundial
}
```

Regla de oro: **casi todos los campos son opcionales**. Si a un país le faltan datos de población, su ficha simplemente no muestra esa fila. Empieza con poco y amplía después. La lista completa de campos, con su tipo y descripción, está en `schema/`.

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
  ],
  "escudos": [                             // (opcional) emblemas por época: ficheros de Wikimedia Commons
    { "archivo": "Great coat of arms of Sweden.svg" },              // sin fechas: el actual, de respaldo
    { "archivo": "Coat of arms of Sweden (1650).svg", "desde": 1600, "hasta": 1720 }
  ],
  "banderas": [                            // (opcional) igual que 'escudos'; el usuario elige ver uno u otro
    { "archivo": "Flag of Sweden.svg" }
  ]
}
```

- `nombres` es el campo clave: debe copiar **letra por letra** cómo aparece la entidad en los ficheros `web/data/geojson/world_*.geojson` (campos `NAME` o `SUBJECTO`). El mismo reino cambia de nombre entre siglos («Castilla» → «Castile» → «Castille»), así que la lista puede tener varios. [Cómo averiguarlos](#trucos).
- `relacionados` alimenta el filtro «Seguir un reino»: son los nombres de entidades predecesoras o aliadas cuya historia también pertenece a este país (España hereda «Corona de Castilla», «Califato de Córdoba»…). Se comparan con los `paises` de conflictos y eventos.
- Si dos gobernantes se solapan en un año (corregencias, guerras civiles), la ficha muestra ambos.
- `escudos` y `banderas` los rellenan los conectores de Wikidata (P94 y P41) con su vigencia; junto al nombre de cada país el mapa muestra el vigente en el año, y el usuario elige en el panel de capas si ver escudos o banderas (uno u otro). Si la ficha no trae el campo, el mapa consulta el actual en vivo.

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

Cuando la situación de un territorio es **disputada o no se resume en «parte de X»** (los territorios palestinos, por ejemplo), añade `estatus`: un texto descriptivo de su situación jurídica o administrativa («Administración militar egipcia (1948–1967)», «Autoridad Nacional Palestina en las áreas A y B…»). La ficha lo muestra en lugar de «Parte de», y `pais` pasa a aportar solo el color. Mantén el tono descriptivo y con fuentes (la terminología de la ONU es una buena referencia) y, si el territorio tiene extensión, dibújalo con `poligono` aunque los mapas base no lo distingan.

## Trucos

**`nombres` y `relacionados` no son lo mismo.** `nombres` solo admite los nombres EXACTOS con que la entidad aparece en los GeoJSON (`NAME` o `SUBJECTO`, normalmente en inglés): es lo que une la ficha con el polígono del mapa, y el validador avisa si pones uno que no existe en ningún mapa. Los alias en español, nombres oficiales o históricos («Myanmar», «Estados Unidos Mexicanos», «Alto Volta») van en `relacionados`: ahí los usa el filtro «Seguir un reino» y el buscador.

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

Para volúmenes grandes no hace falta teclear: `api/fuentes/` ingiere de APIs abiertas y deja **propuestas** en una base local que tú revisas y apruebas antes de exportar a `datos/` — o, más cómodo, desde el panel de administración en `http://localhost:9000/admin.html` (ver README). Las propuestas ya llegan con su fuente puesta. Por defecto cada conector consulta **solo los países nuevos** (los que nunca consultó y no tienen esa sección validada), así que si añades una ficha a `datos/paises/` con su `wikidata`/`owid`, la siguiente ejecución la rellena sin repasar el resto; «Todos los países» (o `--todos`) refresca todo. «Ejecutar todo en cola» encadena los conectores sin límite práctico de tiempo y se puede detener y reanudar por donde iba.

## Formato canónico, esquemas y marca de revisión

**Formato canónico.** Todo fichero de `datos/` se escribe igual: claves en un orden fijo (id, nombre, nombres… fuentes, revision), listas cronológicas (`gobernantes`, `poblacion`, `nombres_periodo`, `escudos`, `banderas`, `batallas`) ordenadas por año, sangría con **tabuladores**, saltos de línea LF y salto final. Así dos personas que editan la misma ficha producen el mismo texto y los diffs solo muestran cambios reales. No tienes que cuidarlo a mano:

```bash
python api/formatear.py            # reescribe los ficheros que no estén en formato canónico
python api/formatear.py --check    # solo comprueba (código 1 si hay alguno); es lo que ejecuta el CI
```

Lo define `canonizar()` en `api/fuentes/comun.py`; todo lo que escribe el pipeline (`exportar.py`, `dividir.py`) ya sale canónico. Las listas que sí conservan tu orden porque es significativo: `nombres`, `fuentes`, `zonas`, `paises`, `relacionados`.

**Esquemas.** `schema/pais.json`, `conflicto.json`, `evento.json` y `territorio.json` son el contrato de cada colección en [JSON Schema](https://json-schema.org/): campos, tipos, obligatorios, patrones (`Q123`, `#rrggbb`, fechas) y una descripción de cada uno. Sirven para tres cosas: son la **referencia** cuando dudes qué admite un campo; dan **autocompletado y subrayado de errores en el editor** (con VS Code funciona solo: `.vscode/settings.json` asocia cada carpeta de `datos/` a su esquema); y el **validador** los aplica (`validar.py` implementa el subconjunto de JSON Schema que usan, sin dependencias). Si necesitas un campo nuevo, añádelo primero al esquema (con su `description`) y a `ORDEN_CLAVES` en `comun.py`; una clave que no esté en el esquema se señala como aviso (probable errata).

**Marca de revisión.** Un país puede llevar un bloque `revision`:

```jsonc
"revision": {
  "estado": "validado",            // 'validado' (revisado por una persona) o 'borrador'
  "fecha": "2026-09-08",
  "por": "panel-admin",            // quién lo revisó (usuario, o el panel al exportar propuestas aprobadas)
  "hash": "4a883772fe25",          // huella de gobernantes + poblacion + nombres_periodo
  "secciones": ["poblacion", "resena"]
}
```

La estampa `exportar.py` (y el panel) al aplicar propuestas revisadas. La huella no depende del orden de escritura; si después alguien cambia gobernantes, población o nombres por época, deja de cuadrar y `validar.py` avisa: «revision.hash no cuadra». Es la señal para revisar la ficha de nuevo (y volver a exportar, que renueva la marca) o para quitar la marca. Las extracciones automáticas usan esta marca para saltarse lo ya validado. Si editas a mano esas secciones de un país validado, dilo en el pull request.

## Validar y probar

Antes de abrir el merge request:

```bash
python api/validar.py
```

El validador comprueba: JSON bien formado (señalando el fichero y la línea), la **estructura de cada ficha contra su esquema** de `schema/` (tipos, obligatorios, patrones, claves desconocidas), ids únicos, coherencia de años (`desde ≤ hasta`, batallas y zonas dentro de su conflicto), coordenadas y polígonos en rango, tipos de zona válidos, que los `nombres` de países existan en algún GeoJSON, que las **referencias entre fichas** resuelvan (`pais` de un territorio y `relacionados` de un país deben nombrar fichas de `paises`), que haya `fuentes` y que las marcas `revision` sigan cuadrando. Los ✘ bloquean; los ⚠ son avisos. Si todo va bien termina con `✔ datos válidos`. Antes, `python api/formatear.py --check` te dice si algún fichero no está en formato canónico (el CI ejecuta ambos y no publica si alguno falla).

Después, prueba visual: arranca el servidor, ve a los años que tocan tus datos y comprueba que las zonas caen donde deben, que la ficha se abre y que el filtro «Seguir un reino» encuentra tu entidad (si tocaste `paises`).

## Checklist del merge request

- [ ] `python api/formatear.py` aplicado (o `--check` en verde)
- [ ] `python api/validar.py` pasa sin errores
- [ ] Probado en el navegador en los años afectados
- [ ] Años en formato correcto (negativos = a. C.) y coordenadas `[lat, lng]`
- [ ] `nombres` copiados exactamente de los GeoJSON (si añadiste un país)
- [ ] Descripción del MR: qué añades/corriges y **con qué fuente** (Wikipedia, bibliografía…)
- [ ] Todos los datos nuevos llevan `fuentes`
- [ ] Si tocaste gobernantes/población/nombres por época de un país con `revision` validada, lo indicas en el MR
- [ ] Sin cambios de código no relacionados en el mismo MR

La plantilla del pull request (`.github/PULL_REQUEST_TEMPLATE.md`) recoge esta lista; `.github/CODEOWNERS` asigna revisores por carpeta.

## Contribuciones que sí tocan código

- **Traducciones**: copia `web/i18n/es.json` a `web/i18n/<código>.json`, traduce los valores (las claves no se tocan), añade el idioma a `supported` en `web/js/i18n.js` y una `<option>` al selector de `mapa.html`.
- **Interfaz o lógica**: el JavaScript vive en `web/js/`, dividido por secciones que comparten ámbito global (sin build; el orden de carga lo fija `mapa.html`):

  | Fichero | Qué contiene |
  |---|---|
  | `nucleo.js` | estado global, constantes, preferencias y utilidades |
  | `datos.js` | carga de `historia.json`, países, seguimiento y relevancia |
  | `fichas.js` | popups, fuentes y extractos de Wikipedia |
  | `zonas.js` | zonas de guerra y recorte costero |
  | `capas.js` | marcadores: batallas, eventos y territorios menores |
  | `mapa.js` | estilo, etiquetas y emblemas (escudo o bandera), análisis del año, carga y capas base |
  | `paneles.js` | leyenda, panel «Este año» y panel de capas |
  | `tiempo.js` | barra de tiempo, épocas del modo móvil, marcas y reproducción |
  | `arranque.js` | `init()` |

  Los estilos están en `web/css/styles.css`. La indentación del código es con **tabuladores** (hay un `.prettierrc` en la raíz: `prettier --write "web/js/*.js"` lo aplica solo). Para cambios grandes, abre antes un issue y lo hablamos.
- **Mapas base o de fronteras**: los GeoJSON provienen de [historical-basemaps](https://github.com/aourednik/historical-basemaps); si hay versiones nuevas, se regenera también `data/years.json` y se vuelve a pasar `python api/limpiar_geojson.py`, que retira entidades duplicadas o anacrónicas conocidas (el mismo polígono dos veces con dos atribuciones, como «Yemen» y «Yemen (UK)» en 1938). El validador avisa de geometrías repetidas: si aparece una nueva, añádela a `PARCHES` en ese script con su motivo.
