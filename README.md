# Chronus Tabula

**Chronus Tabula** es una aplicación web para viajar por la historia sobre un mapa: eliges un año (de 3000 a. C. a 2026) y el mundo se pinta con las fronteras de esa época — reinos, imperios, califatos, virreinatos — junto a sus gobernantes, población, guerras en curso con sus frentes, batallas, eventos e inventos. Los años posteriores a 2010 (Ucrania, Gaza, Sudán…) reutilizan el último mapa de fronteras disponible (2010).

Es 100 % estática (HTML + JavaScript + [Leaflet](https://leafletjs.com/)), sin backend ni claves de API, y todo su conocimiento histórico vive en ficheros JSON legibles, **uno por país, conflicto, evento o territorio**, en [`datos/`](datos/) (la web descarga un único `historia.json` que se genera a partir de ellos). ¿Quieres añadir un reino, una guerra o un invento? Lee la [guía de contribución](CONTRIBUTING.md).

## Cómo ejecutarla

El proyecto tiene dos partes: **`web/`** (la aplicación, 100 % estática) y **`api/`** (el servidor local de administración, solo librería estándar de Python — nada que instalar). Un único comando arranca todo:

```bash
python api/servidor.py
# → aplicación:   http://localhost:9000/
# → panel admin:  http://localhost:9000/admin.html
```

Si solo quieres el mapa (sin panel ni ingestas), la web sigue siendo estática pura: `cd web && python -m http.server 8000` o cualquier servidor de estáticos.

## Despliegue

La web se publica automáticamente en **GitHub Pages**: cada push a `main` dispara la pipeline de [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que valida los datos de `datos/` (`python api/validar.py` — si falla, no se despliega), compila `web/data/historia.json` a partir de ellos (`python api/compilar.py`, el único «build») y publica la carpeta `web/`. El panel de administración y las ingestas (`api/`) son herramientas locales del editor y no se despliegan: en la web publicada, `admin.html` simplemente muestra su aviso de «arranca el servidor».

## Qué puedes hacer

| Función | Dónde |
|---|---|
| Elegir año (escala no lineal, más precisión donde más historia hay) | Barra inferior, campo de año (negativo = a. C.) o botones ◀ ▶ |
| Reproducir la historia como una animación (1×/2×/4×) | Botón ▶ de la barra |
| Saltar a un conflicto o evento concreto | Marcas bajo la barra: rombos = conflictos, ⭐💡 = eventos; las pastillas numeradas agrupan varios |
| Seguir la historia completa de un país (filtra barra y panel) | Buscador «Seguir un reino…» de la cabecera |
| Ver ficha de un territorio (gobernante, población, superficie, Wikipedia) | Clic en el territorio |
| Ver zonas en guerra (franjas rojas = frente, sombreado = ocupado) y sus fichas | Automático cuando hay conflicto activo; clic en la zona |
| Ver territorios menores invisibles a escala mundial (Ceuta, Canarias, Azores, Gibraltar…) con el color de su país y desde cuándo le pertenecen | Puntos de color; etiqueta al acercar el zoom; clic para la ficha |
| Consultar conflictos activos y datos de interés del año | Panel «Este año» (derecha) |
| Ver las entidades del año por superficie y volar a ellas | Panel «Entidades del año» (derecha) |
| Activar/desactivar capas (batallas, zonas, eventos, territorios menores, nombres, escudos, colores) | Panel «Capas» (izquierda) |
| Compartir una vista exacta | La URL guarda año, posición, zoom y país seguido (`#1492/40.00/-4.00/5/castilla`) |

## Arquitectura

```
web/                        LA APLICACIÓN (estática, desplegable en cualquier hosting)
  index.html                portada (landing): qué es la app y cómo se usa
  colaborar.html            cómo colaborar (enlaza a GitHub y CONTRIBUTING)
  mapa.html                 la aplicación: mapa, paneles y barra de tiempo
  admin.html                panel de administración (necesita la API en marcha)
  css/, i18n/, lib/         estilos, traducciones y librerías locales
  js/                       lógica por secciones: nucleo, datos, fichas, zonas,
                              capas, mapa, paneles, tiempo, arranque
  data/historia.json        GENERADO desde datos/ (no se edita ni se versiona):
                              el único JSON que descarga la web
  data/geojson/             53 mapas de fronteras world_*.geojson (historical-basemaps)
  data/years.json           índice de años con mapa
  data/land.geojson         contorno de continentes (Natural Earth), recorte costero

datos/                      ★ TODO el conocimiento curado, UN FICHERO POR ENTIDAD
  paises/<id>.json          ficha de cada país o imperio (nombres, gobernantes, población…)
  conflictos/<id>.json      cada guerra con sus zonas y batallas
  eventos/<año>-<nombre>.json  acontecimientos e inventos
  territorios/<nombre>.json enclaves e islas
  _meta.json                claves de primer nivel (la ayuda interna)

schema/                     EL CONTRATO DE CADA COLECCIÓN (JSON Schema): campos, tipos,
  pais.json, conflicto.json,  obligatorios y descripción; lo aplica validar.py y da
  evento.json, territorio.json  autocompletado en el editor (.vscode/settings.json)

api/                        EL SERVIDOR DE ADMINISTRACIÓN (Python, sin dependencias)
  servidor.py               sirve web/ + API REST (fuentes, ingestas, propuestas, export);
                              al arrancar compila datos/ → web/data/historia.json
  compilar.py               genera web/data/historia.json a partir de datos/
  dividir.py                importa un historia.json monolítico al árbol datos/
  limpiar_geojson.py        retira entidades duplicadas/anacrónicas conocidas de los mapas base
                              (parches documentados; --check en CI)
  formatear.py              formato canónico de datos/ (orden de claves, tabs, listas por año);
                              --check lo comprueba sin tocar nada (lo usa el CI)
  validar.py                validador: esquema (schema/), años, coordenadas, nombres en los
                              GeoJSON, referencias, fuentes y marcas de revisión
  fuentes/                  conectores de ingesta (owid_poblacion, wikidata_gobernantes…)
                              y comun.py (carga/escritura de datos/, canonizar, hash_revision)
  revisar.py, exportar.py   revisión y export por terminal (alternativa al panel)
  editorial.db              base editorial local con las propuestas (NO se sube al repo)

.github/                    CI (deploy.yml: formatear --check → validar → compilar → Pages),
                              CODEOWNERS y plantillas de pull request e issue
```

### Cómo fluyen los datos

1. Al elegir un año, la app carga el último `world_<año>.geojson` no posterior a ese año (un mapa retrata la situación de su fecha, que se mantiene hasta la siguiente instantánea: en 1942 se ve el mapa de 1938, no la Alemania dividida de 1945) y pinta los territorios (color estable por entidad: el mismo reino conserva su color en todos los años).
2. `historia.json` enriquece ese mapa: los popups buscan la entidad por su `NAME`/`SUBJECTO` y muestran gobernante y población del año; los conflictos activos pintan sus zonas (recortadas contra la costa real) y batallas; los eventos ponen sus pines.
3. Los escudos de armas y los extractos de las fichas se piden en vivo a las APIs gratuitas de Wikidata y Wikipedia, con caché en el navegador. Sin red, la app funciona igual pero sin escudos ni extractos.

### Fuentes

- Fronteras históricas: [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (precisión orientativa, especialmente en épocas antiguas).
- Contorno de continentes: [Natural Earth](https://www.naturalearthdata.com/) 1:50M.
- Escudos y extractos: APIs públicas de Wikidata / Wikipedia / Wikimedia Commons.
- Gobernantes, población, conflictos, zonas, batallas y eventos: datos curados a mano en `datos/` — estimaciones divulgativas, no investigación académica. Las correcciones son bienvenidas.

## Referencias de los datos

Cada país, conflicto y evento lleva un campo `fuentes` con sus referencias (`wikipedia-es:…`, `wikidata:Q…`, `owid:…` o `curado`), que la app muestra al pie de cada ficha. El contenido extraído de APIs externas cita siempre su origen y licencia.

## Calidad de los datos

Tres piezas mantienen `datos/` sano aunque lo edite mucha gente:

- **Formato canónico** (`python api/formatear.py`): cada ficha se escribe siempre igual (orden de claves fijo, listas cronológicas ordenadas por año, tabuladores, LF), así los diffs solo muestran cambios reales. `--check` solo comprueba.
- **Esquemas** (`schema/*.json`): el contrato de cada colección en JSON Schema, con la descripción de cada campo; `validar.py` lo aplica (sin dependencias) y el editor lo usa para autocompletar.
- **Marca de revisión** (`revision` en cada país): estado, fecha, autor y una huella de gobernantes/población/nombres por época. Si los datos cambian después de validarse, la huella deja de cuadrar y el validador avisa.

El despliegue (`.github/workflows/deploy.yml`) ejecuta `formatear.py --check` y `validar.py` en cada push a `main` y no publica si algo falla; después compila `historia.json` y sube `web/` a GitHub Pages. Todo está explicado para colaboradores en `web/colaborar.html` y en [CONTRIBUTING.md](CONTRIBUTING.md).

## Pipeline de fuentes externas

Además de la edición manual, el proyecto puede ingerir datos de fuentes abiertas con un flujo curado: los conectores de `api/fuentes/` consultan las APIs y generan **propuestas** en una base SQLite local; nada se publica sin revisión humana.

El panel está **protegido con usuario y contraseña**: la primera vez que lo abras te pedirá crear el administrador (la contraseña se guarda como hash PBKDF2 con sal en la base editorial local, nunca en claro ni en el repositorio) y después el login devuelve un token de sesión de 7 días renovables; toda la API lo exige y hay límite de intentos fallidos. Como capas adicionales, el servidor solo escucha en `127.0.0.1` y `editorial.db` está en `.gitignore`.

La forma cómoda es el **panel de administración** (`http://localhost:9000/admin.html` con `python api/servidor.py` en marcha): muestra las fuentes configuradas con su última ejecución, el mapeo país ↔ fuente (campos `owid` y QID de `wikidata` en la ficha de cada país, `datos/paises/`), lanza actualizaciones con un botón (con «modo demo» sin red), enseña cada propuesta con el dato ya mapeado a nuestro formato, y permite aprobar, rechazar y exportar con el validador integrado.

Las ingestas **guardan cada propuesta al momento** y recuerdan por qué país iban: si una se corta a medias (red, límite de peticiones, cierre del servidor), nada se pierde y la siguiente ejecución **continúa donde se quedó** sin repetir los países ya consultados — el panel lo indica con «a medias: X/Y países». El botón «↺ Empezar de cero» olvida esa pila.

Además, cada conector lleva un **registro permanente de qué países ha consultado**. El interruptor del panel decide qué hace con él:

- **Solo países nuevos desde la última ejecución** (por defecto): el conector se salta los países que ya consultó alguna vez y los que tienen esa sección (población, gobernantes, reseña, escudos) marcada como validada en `revision`. Así, si añades 5 países a `datos/`, la siguiente ejecución consulta solo esos 5.
- **Todos los países**: vuelve a consultar todo, para refrescar datos ya extraídos. Por terminal: `--todos`.

**«▶ Ejecutar todo en cola»** lanza los seis conectores en serie para dejarlos corriendo desatendidos durante horas o días: no hay límite práctico de tiempo (solo un tope de seguridad de 7 días por conector). Si algo se queda colgado o quieres parar, **«⏹ Detener»** para en cuanto termina el país en curso, guardando el progreso; la cola recuerda en qué conector estaba y el botón pasa a **«▶ Reanudar cola (3/6: …)»**, que continúa por ese conector y ese país, no por el primero. También si se cierra el servidor a medias.

Todo existe también por terminal:

```bash
python api/fuentes/owid_poblacion.py        # series de población (Our World in Data, CC BY)
python api/fuentes/wikidata_gobernantes.py  # jefes de Estado (Wikidata, CC0)
python api/fuentes/wikidata_batallas.py     # batallas con coordenadas y fecha (Wikidata, CC0)
python api/fuentes/wikidata_poblacion.py --todos   # cualquier conector: todos los países, no solo los nuevos
python api/revisar.py list                  # ver propuestas pendientes
python api/revisar.py aprobar 1-10          # aprobar / rechazar / aprobar-todas
python api/exportar.py                      # aplicar a datos/ + validar + recompilar historia.json
```

Las ingestas reales requieren internet abierto (ejecútalas en tu máquina); `--demo` prueba el circuito sin red.

## Contribuir

Todo lo que se ve en el mapa sale de los ficheros de `datos/` (uno por país, conflicto, evento o territorio), pensados para editarse sin tocar código; `web/data/historia.json` se genera a partir de ellos y no se edita a mano. La guía completa, con ejemplos copiables de cada tipo de dato y la checklist de merge request, está en **[CONTRIBUTING.md](CONTRIBUTING.md)**. En resumen:

1. Haz un fork y edita el fichero de la entidad en `datos/` (p. ej. `datos/paises/espana.json`; o `web/i18n/*.json` para traducciones).
2. Formatea y valida: `python api/formatear.py` y `python api/validar.py`
3. Prueba en local moviendo el deslizador por los años que tocan tus datos.
4. Abre el merge request explicando la fuente de tus datos.

## Licencias

Código de la aplicación: libre uso en el ámbito del proyecto. Fronteras de historical-basemaps: GPL-3.0 (código) y uso académico/educativo (datos). Natural Earth: dominio público. Contenidos de Wikipedia/Wikidata: CC BY-SA / CC0 según cada obra.
