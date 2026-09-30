# Guía de contribución a Chronus Tabula

¡Gracias por querer ampliar la historia! El 95 % de las contribuciones no tocan código: consisten en **editar un fichero JSON pequeño en `datos/`**: uno por país (`datos/paises/<id>.json`), conflicto, evento o territorio, pensados para leerse y ampliarse a mano. El `web/data/historia.json` que descarga la web se **genera** a partir de ellos (no lo edites). Esta guía te enseña cada formato con ejemplos copiables, cómo probar tus cambios y qué debe llevar tu merge request.

> **Licencia de las contribuciones.** Chronus Tabula no es software libre: el código se ofrece bajo PolyForm Strict 1.0.0 y la base de datos tiene todos los derechos reservados ([LICENSE.md](LICENSE.md)). Puedes hacer un *fork* y modificarlo **solo para proponer cambios aquí**. Al enviar una contribución declaras que puedes aportarla y que los datos o textos de terceros que incluye respetan su licencia, y concedes al titular una licencia no exclusiva y perpetua para usarla en el proyecto (apartado 4 de [LICENSE.md](LICENSE.md)).

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
12. [Traducciones](#traducciones)
13. [Contribuciones que sí tocan código](#contribuciones-que-sí-tocan-código)

---

## El flujo en 5 pasos

```bash
# 1. Fork + clon del repositorio
git clone <tu-fork> && cd "mapa mundi anual"

# 2. Arranca la app en local
python api/servidor.py         # → http://localhost:9000 (mapa) y /admin.html (panel)

# 3. Edita (o crea) la ficha: con el asistente del panel (/admin.html → «Asistente de
#    edición de fichas», sin tocar JSON; valida, formatea y guarda por ti) o a mano en
#    el fichero de datos/ (p. ej. datos/paises/espana.json)

# 4. Formatea y valida
python api/formatear.py        # formato canónico (orden de claves, tabs, listas por año)
python api/validar.py          # estructura (schema/), fechas, coordenadas, nombres, fuentes

# 5. Prueba en el navegador, haz commit y abre tu merge request
```

### Editar con el asistente (sin tocar JSON)

En el panel de administración (`http://localhost:9000/admin.html`, tras `python api/servidor.py`), el **asistente de edición de fichas** guía en tres pasos: eliges la colección y la ficha (o creas una nueva), la editas en un formulario generado a partir de `schema/` (listas de gobernantes, población, batallas, fuentes…; coordenadas eligiéndolas en un mapa) y revisas el resultado —errores, avisos y el *diff* exacto del fichero— antes de guardar. Al guardar, el servidor valida la ficha, la escribe en `datos/` en formato canónico y recompila el mapa; si alguien cambió el fichero mientras lo editabas, no lo pisa. Luego solo queda `git diff`, commit y merge request. En países y conflictos el `id` no se cambia desde el asistente (da nombre al fichero); los polígonos de zonas y territorios se editan como JSON.

Para empezar: `python api/servidor.py` y abre `http://localhost:9000/admin.html#editor` (la primera vez el panel te pide crear un usuario y contraseña locales). Los campos con `*` son obligatorios; lo que no sepas, déjalo en blanco.

**Ejemplo 1: corregir la fecha de un reinado.** Felipe II figura en España de 1556 a 1598.

1. **Países**, busca `españa` y ábrela.
2. Despliega **Gobernantes**, localiza la fila de *Felipe II* y cambia **Hasta**.
3. En **Fuentes**, **+ Añadir** y escribe en **Identificador** de dónde sale el dato (p. ej. `wikipedia-es:Felipe II de España`).
4. **Revisar cambios →**: el diff muestra solo esa línea y la fuente nueva. **💾 Guardar en datos/**.

Si el año de fin queda antes que el de inicio, no deja guardar y lo explica: *'desde' (1556) es posterior a 'hasta' (1550)*. Si el país estaba revisado («validado»), su marca de revisión pasa a «borrador» para que otra persona lo compruebe.

**Ejemplo 2: añadir un acontecimiento** (la Universidad de Salamanca, 1218).

1. **Eventos** → **+ Nuevo evento**.
2. **Nombre**: `Fundación de la Universidad de Salamanca`; **Año**: `1218`.
3. **Coordenadas** → **Elegir en el mapa** y pincha sobre Salamanca (≈ 40,96, −5,66).
4. **Países**: `Reino de León`; una **Descripción** de una frase; **Artículo de Wikipedia**: `Universidad de Salamanca`.
5. **Fuentes** → **+ Añadir**: **Identificador** `wikipedia-es:Universidad de Salamanca`, **Licencia** `CC BY-SA`.
6. Revisa y guarda: se crea `datos/eventos/1218-fundacion-de-la-universidad-de-salamanca.json` y el ⭐ aparece en el mapa de 1218.

**Ejemplo 3: añadir una batalla a un conflicto** (la Montaña Blanca, 1620, en la Guerra de los Treinta Años).

1. **Conflictos**, busca `treinta` y ábrelo.
2. **Batallas** → **+ Añadir**: **Nombre** `Batalla de la Montaña Blanca`, **Año** `1620`, coordenadas junto a Praga (≈ 50,08, 14,32) con **Elegir en el mapa**.
3. Añade la fuente en **Fuentes** del conflicto, revisa y guarda. El orden no importa: las batallas se ordenan por año al guardar.

Después, lo de siempre: `git diff`, commit y pull request.

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
  "relacionados": ["Reino de Suecia"],     // (opcional) alias en español que no son otra ficha
  "vinculos": [                            // (opcional) relación con OTRAS fichas, por su id
    { "id": "vikingos", "tipo": "predecesor" }  // la otra ficha existía antes y dio paso a esta
  ],
  "gobernantes": [                         // (opcional) reinados; se muestra el del año elegido
    { "desde": 1611, "hasta": 1632, "nombre": "Gustavo II Adolfo", "titulo": "Rey de Suecia" },
    { "desde": 1973, "nombre": "Carlos XVI Gustavo", "titulo": "Rey de Suecia" }  // sin "hasta": sigue en el cargo
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
- **Se escribe en español.** Las fichas solo llevan el texto en español; las traducciones van aparte, en `datos/i18n/` (ver [Traducciones](#traducciones)).
- `vinculos` une la ficha con otras por su `id`, con un `tipo`:
  - `predecesor` / `sucesor`: **continuidad política**. Esta ficha hereda el Estado, la dinastía o las instituciones de la otra (Corona de Castilla → España, Qing → República Popular China), directamente o a través de Estados de la misma línea que no tienen ficha.
  - `parte_de` / `incluye`: una formaba parte de la otra (Perú, parte de España de 1542 a 1824).
  - `antecesor_territorial` / `sucesor_territorial`: la otra gobernó antes (parte de) este territorio, pero **hubo ruptura**: conquista, o un Estado nuevo que no la continúa (Califato de Córdoba o Reino visigodo → España, Imperio azteca → México).
  
  El criterio es institucional y comprobable, no de identidad: la pregunta es si el Estado continúa, no a quién «pertenece» una época. `desde`/`hasta` son opcionales y acotan cuándo vale. Los vínculos son **recíprocos**: si España tiene a Castilla como `predecesor`, Castilla tiene a España como `sucesor`. El asistente del panel escribe el inverso solo; a mano, añádelo tú (el validador avisa si falta).
- Al **seguir un reino** en el mapa se resaltan él, sus predecesores y lo que incluye, en cadena (España → Corona de Castilla → Reino de León → Reino de Asturias), y la barra de tiempo muestra las guerras y acontecimientos de todos ellos. Los antecesores territoriales solo se suman si se activa «Seguir antecesores territoriales» en el panel de capas.
- `relacionados` queda para alias en español que no son otra ficha («Reino de Suecia», «Alto Volta»). Se comparan con los `paises` de conflictos y eventos y los usa el buscador. Si un nombre de `relacionados` es otra ficha, el validador te pedirá convertirlo en vínculo (`python api/vincular.py` lo hace de golpe, deduciendo el tipo por los años de los mapas; revisa el diff).
- Si dos gobernantes se solapan en un año (corregencias, guerras civiles), la ficha muestra ambos.
- Un gobernante que **sigue en el cargo** no lleva `hasta` (o lo lleva vacío): la ficha lo muestra desde `desde` hasta el año en curso, sin tener que actualizarlo cada año. No escribas `hasta` igual a `desde` ni un año futuro (2100) para decir «en el cargo»: con el primero desaparece al año siguiente y el segundo el validador lo avisa. Cuando deje el cargo, pon su año de salida.
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

Formatos de `id` (el validador rechaza cualquier otro):

- `wikipedia-<idioma>:<Título del artículo>`: `wikipedia-es:Imperio otomano`, `wikipedia-en:Battle of Hastings`.
- `wikidata:Q…`: un elemento de Wikidata.
- `libro:<clave>`, `articulo:<clave>`, `mapa:<clave>`, `datos:<clave>`, `web:<clave>`: una obra del **registro de referencias**, `datos/referencias.json`, donde cada libro, artículo, mapa, base de datos o web se describe una sola vez:

  ```jsonc
  "libro:jenkins-inglaterra": {
    "tipo": "libro", "titulo": "Breve historia de Inglaterra", "autor": "Simon Jenkins",
    "traductor": "José C. Vales", "editorial": "…", "anio": 2020, "isbn": "…",
    "licencia": "referencia (obra con derechos: solo se cita)"
  }
  ```

  La ficha solo cita la clave y, si hace falta, las páginas: `{"id": "libro:jenkins-inglaterra", "paginas": "112-118"}`. Si la obra no está en el registro, añádela (campos: `tipo`, `titulo`, `autor`, `traductor`, `editorial`, `coleccion`, `anio`, `edicion`, `isbn`, `url`, `licencia`, `uso`, `datos`, `nota`).
- `curado`: elaboración propia contrastada (explica la bibliografía en el MR).

La app muestra las fuentes al pie de cada ficha, y la página **Fuentes y referencias** (`web/fuentes.html`) las agrupa todas por tipo de fuente y por tipo de dato. La genera `python api/compilar.py` en `web/data/fuentes.json` (cifras y obras) y `web/data/fuentes-listas.json` (todos los artículos de Wikipedia y elementos de Wikidata citados). Las fuentes de las correcciones de fronteras (`api/correcciones/`) también cuentan.

La `url` de Wikipedia debe llevar al **título exacto del artículo**, no a uno deducido del nombre de la ficha (es «Kanato_ávaro», no «Canato_ávaro»; «Dinastía_Ming», no «Imperio_Ming_(China)»), y nunca a una página de desambiguación. Antes del merge request, pasa `python api/comprobar_enlaces.py`: consulta la API de Wikipedia (necesita conexión) y lista los enlaces que no existen o que son desambiguaciones en `datos/` y `api/correcciones/`.

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

El validador comprueba: JSON bien formado (señalando el fichero y la línea), la **estructura de cada ficha contra su esquema** de `schema/` (tipos, obligatorios, patrones, claves desconocidas), ids únicos, coherencia de años (`desde ≤ hasta`, batallas y zonas dentro de su conflicto), coordenadas y polígonos en rango, tipos de zona válidos, que los `nombres` de países existan en algún GeoJSON, que las **referencias entre fichas** resuelvan (el `pais` de un territorio debe nombrar una ficha de `paises`; los `vinculos` deben apuntar a ids existentes y tener su inverso), que haya `fuentes` y que las marcas `revision` sigan cuadrando. Los ✘ bloquean; los ⚠ son avisos. Si todo va bien termina con `✔ datos válidos`. Antes, `python api/formatear.py --check` te dice si algún fichero no está en formato canónico (el CI ejecuta ambos y no publica si alguno falla).

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
- [ ] Si cambiaste textos en español, `python api/traducciones.py --estado` (las traducciones afectadas quedan desactualizadas: dilo en el MR)
- [ ] Sin cambios de código no relacionados en el mismo MR
- [ ] Acepto que mi contribución se incorpore según el apartado 4 de [LICENSE.md](LICENSE.md)

La plantilla del pull request (`.github/PULL_REQUEST_TEMPLATE.md`) recoge esta lista; `.github/CODEOWNERS` asigna revisores por carpeta.

## Traducciones

El español es el idioma **fuente**: las fichas de `datos/` se escriben en español y no llevan traducciones. Cada idioma tiene un catálogo, `datos/i18n/<idioma>.json`, con una línea por texto:

```jsonc
"paises/egipto.nombre":                           {"t": "Egypt", "src": "5f1c2a9b"},
"paises/egipto.nombres_periodo.-3100.nombre":     {"t": "Ancient Egypt", "src": "…"},
"conflictos/wwi.batallas.batalla-del-somme.nombre": {"t": "Battle of the Somme", "src": "…"},
"eventos/1492-descubrimiento-de-america.descripcion": {"t": "…", "src": "…"},
"txt:Faraón":                                      {"t": "Pharaoh"},
"txt:Isabel II@espana":                            {"t": "Isabella II"},
"mapa:Kingdom of Castile":                         {"t": "Kingdom of Castile"}
```

- `<colección>/<id>.<campo>`: un campo de una ficha (nombre, reseña, descripción, bajas, estatus; en las guerras también sus batallas y zonas, por su `id`; en los países, sus nombres por época, por su año `desde`). `src` es la huella del texto español: si alguien lo cambia, la traducción queda **desactualizada** y `validar.py` avisa.
- `txt:<texto>`: textos cortos que se repiten (nombres, cargos y títulos de gobernantes; bandos de las guerras y países de los acontecimientos). Se traducen una vez para todas las fichas; `txt:<texto>@<id de la ficha>` precisa la traducción en una ficha concreta.
- `mapa:<nombre>`: los nombres de los mapas base, que vienen en inglés. Por eso `es.json` solo lleva claves `mapa:` (y `en.json`, solo las que difieren del original).

`python api/compilar.py` genera un JSON por idioma: `web/data/historia.json` (español) y `web/data/historia.<idioma>.json`, con los textos ya traducidos (lo que falta se queda en español). La web descarga el del idioma elegido.

```bash
python api/traducciones.py --estado                  # cobertura de cada idioma
python api/traducciones.py --pendientes en --salida pendientes.json   # lo que falta o está desactualizado
# … rellenar "t" en pendientes.json …
python api/traducciones.py --importar en pendientes.json
python api/traducciones.py --limpiar en              # retira claves que ya no corresponden a nada
```

**No cambies los `id`** de batallas, zonas, acontecimientos o territorios al corregir su nombre: son la clave de sus traducciones.

### La interfaz: el mapa y las páginas

Los textos de la interfaz (los de la aplicación del mapa y los de la portada, `colaborar.html`, `fuentes.html` y `aviso-legal.html`) van en un catálogo por idioma, `web/i18n/<idioma>.json`, con el mismo árbol en todos: primero la página y dentro la sección y el texto.

```json
{
	"comun": { "abrirMapa": "Abrir el mapa", "enlaces": { "fuentes": "Fuentes", "colaborar": "Colaborar" } },
	"mapa": { "ui": { "loading": "Cargando…" }, "popup": { "ruler": "Gobernante" } },
	"index": {
		"meta": { "titulo": "…", "descripcion": "…" },
		"menu": { "leer": "Cómo se lee", "clase": "En clase" },
		"portada": { "titulo": "El mundo en", "abrir": "Abrir {a} en el mapa" }
	},
	"colaborar": { "formas": { "avisar": { "boton": "Abrir un aviso" } } }
}
```

- `comun` reúne lo que comparten las páginas (menú, pie, «Abrir el mapa»); `mapa`, la aplicación; `index`, `colaborar`, `fuentes` y `legal`, cada página.
- `es.json` es la referencia. Para traducir, copia su árbol y cambia solo los valores: las claves no se tocan, y lo que va entre llaves (`{a}`, `{n}`) o las etiquetas (`<b>`, `<a href>`, `<span class="ui">`) se dejan tal cual.
- En las páginas, el español está escrito en el propio HTML (así funcionan sin JavaScript y los buscadores las leen) y cada elemento lleva su clave: `data-i18n="index.portada.lema"` para el contenido y `data-i18n-alt`, `-title`, `-aria` o `-placeholder` para atributos. `web/js/idioma.js` aplica el idioma elegido, pinta su bandera en la barra superior y lo comparte con el mapa. Los nombres propios que no se traducen (Wikipedia, Leaflet…) llevan `translate="no"`, y lo que rellena un script, `data-i18n-no`.
- Los textos que escriben los scripts se piden por su clave: `window.idioma.t('fuentes.obras.citadoVeces', {n: 3})` en las páginas e `i18n.t('ui.loading')` en el mapa (sin el prefijo `mapa.`). Esos textos, y toda la rama `mapa`, se escriben directamente en `es.json`.

```bash
python api/traducir_interfaz.py --sincronizar          # clave a los textos nuevos del HTML y es.json al día
python api/traducir_interfaz.py --estado               # cobertura: al día, desactualizados, sin traducir
python api/traducir_interfaz.py --pendientes en --salida pendientes.json   # el árbol de lo que falta
python api/traducir_interfaz.py --importar en pendientes.json              # una vez traducido
python api/traducir_interfaz.py --confirmar en         # si has editado en.json a mano
```

Al añadir o cambiar un texto en una página, ejecuta `--sincronizar`: le pone una clave (`<página>.<sección>.<primeras palabras>`; cámbiala por otra más clara si quieres, en el HTML) y copia el español a `es.json`. Para saber qué traducciones se han quedado viejas, `api/i18n/huellas.<idioma>.json` guarda la huella del español del que salió cada una; no hace falta tocarlo, lo escriben `--importar` y `--confirmar`.

Los textos del registro de obras (`uso`, `nota`, `licencia` de `datos/referencias.json`) se traducen en `datos/i18n/<idioma>.json` como las fichas, y `compilar.py` genera `web/data/fuentes.<idioma>.json`.

**Añadir un idioma**: para los datos, `python api/traducciones.py --nuevo fr` y tradúcelo con `--pendientes fr` / `--importar fr`; para la interfaz, `python api/traducir_interfaz.py --nuevo fr` y lo mismo con `--pendientes fr` / `--importar fr`. Después, añade el idioma a `supported` en `web/js/i18n.js` y una `<option>` al selector de `mapa.html`, y en las páginas a `IDIOMAS` de `web/js/idioma.js` con una opción y su bandera en el menú de idioma.

## Contribuciones que sí tocan código

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
  | `tiempo.js` | barra de tiempo, escala del modo móvil, marcas y reproducción |
  | `arranque.js` | `init()` |
  | `admin-editor.js` | asistente de edición de fichas del panel (su servidor: `api/editor.py`) |

  Los estilos están en `web/css/styles.css` (mapa) y `web/css/portada.css` (portada y colaborar); los tokens comunes —tipografía Montserrat, colores, radios, sombras, botones— están en `web/css/marca.css`, que cargan las cuatro páginas (mapa, portada, colaborar y panel) antes de su hoja propia: cambia allí un color o un tamaño y se aplica a todo. La indentación del código es con **tabuladores** (hay un `.prettierrc` en la raíz: `prettier --write "web/js/*.js"` lo aplica solo). Para cambios grandes, abre antes un issue y lo hablamos.
- **Mapas base o de fronteras**: los GeoJSON provienen de [historical-basemaps](https://github.com/aourednik/historical-basemaps); si hay versiones nuevas, se regenera también `data/years.json` y se vuelve a pasar `python api/limpiar_geojson.py`, que retira entidades duplicadas o anacrónicas conocidas (el mismo polígono dos veces con dos atribuciones, como «Yemen» y «Yemen (UK)» en 1938). El validador avisa de geometrías repetidas: si aparece una nueva, añádela a `PARCHES` en ese script con su motivo. Después, `python api/rellenar_geojson.py` (necesita `pip install shapely`) rellena la tierra **sin atribuir** de algunos mapas con pueblos de mapas vecinos, recortados al hueco y marcados con la propiedad `RELLENO` (mapa de origen y motivo); lo que no se rellena, el mapa lo muestra rayado como «sin datos». Para rellenar otro mapa, añade sus entradas a `RELLENOS`, en orden de prioridad y con un motivo histórico. El último mapa del proyecto original es de 2010: `python api/derivar_mapas.py` genera a partir de él los posteriores (hoy, 2011 con Sudán del Sur, con geometría de Natural Earth guardada en `api/geo/`) y los añade a `data/years.json`.
- **Corregir fronteras y rótulos de los mapas base**: nunca a mano. Las correcciones se describen en `api/correcciones/<NN>-<epoca>.json`, con operaciones `renombrar`, `asignar`, `quitar`, `recortar` y `sustituir`, cada una con su motivo y su fuente. Las geometrías que usan van en `api/geo/correcciones/`. Las aplica `python api/corregir_mapas.py` (necesita shapely), que siempre parte del mapa original: la primera vez que corrige un mapa, lo guarda en `api/geo/originales/`. También puede crear mapas intermedios nuevos (`"world_NUEVO.geojson<world_BASE.geojson"`) y regenera `data/years.json`. Las features tocadas llevan `CORREGIDO` o `DERIVADO` con la base y el motivo. `--check` informa, sin escribir, de los km² de cada operación, la tierra perdida y los solapes. `--solo <fichero>` aplica solo ese fichero. Es idempotente: si nada cambia, no reescribe. El formato completo está en `api/correcciones/README.md`. **Orden de la canalización**: `corregir_mapas.py` → `limpiar_geojson.py` → `rellenar_geojson.py` → `derivar_mapas.py` → `colorear.py`. Cada vez que el primero reescribe un mapa, hay que volver a pasar los otros cuatro. `colorear.py` reparte las 26 tintas del mapa (13 colores en dos tonos) para que dos territorios vecinos (que se tocan o quedan a menos de ~8 km) no compartan color: parte del color por hash del nombre, que es estable entre años, y solo guarda en `web/data/colores.json` las excepciones de cada mapa; con `--informe` lista los choques y con `--check` falla si el fichero no está al día.
