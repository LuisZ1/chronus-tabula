# Chronus Tabula

**Chronus Tabula** es una aplicación web para viajar por la historia sobre un mapa: eliges un año (de 3000 a. C. a 2026) y el mundo se pinta con las fronteras de esa época — reinos, imperios, califatos, virreinatos — junto a sus gobernantes, población, guerras en curso con sus frentes, batallas, eventos e inventos. Los años posteriores a 2010 (Ucrania, Gaza, Sudán…) reutilizan el último mapa de fronteras disponible (2010).

Es 100 % estática (HTML + JavaScript + [Leaflet](https://leafletjs.com/)), sin backend ni claves de API, y todo su conocimiento histórico vive en **un único fichero editable**: [`data/historia.json`](data/historia.json). ¿Quieres añadir un reino, una guerra o un invento? Lee la [guía de contribución](CONTRIBUTING.md).

## Cómo ejecutarla

El proyecto tiene dos partes: **`web/`** (la aplicación, 100 % estática) y **`api/`** (el servidor local de administración, solo librería estándar de Python — nada que instalar). Un único comando arranca todo:

```bash
python api/servidor.py
# → aplicación:   http://localhost:9000/
# → panel admin:  http://localhost:9000/admin.html
```

Si solo quieres el mapa (sin panel ni ingestas), la web sigue siendo estática pura: `cd web && python -m http.server 8000` o cualquier servidor de estáticos.

## Despliegue

La web se publica automáticamente en **GitHub Pages**: cada push a `main` dispara la pipeline de [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que primero valida `historia.json` (`python api/validar.py` — si falla, no se despliega) y después publica la carpeta `web/` tal cual, sin build. El panel de administración y las ingestas (`api/`) son herramientas locales del editor y no se despliegan: en la web publicada, `admin.html` simplemente muestra su aviso de «arranca el servidor».

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
  index.html                página única: mapa, paneles y barra de tiempo
  admin.html                panel de administración (necesita la API en marcha)
  css/, js/, i18n/, lib/    estilos, lógica, traducciones y librerías locales
  data/historia.json        ★ TODO el conocimiento curado: países, gobernantes,
                              población, conflictos, zonas, batallas y eventos
  data/geojson/             53 mapas de fronteras world_*.geojson (historical-basemaps)
  data/years.json           índice de años con mapa
  data/land.geojson         contorno de continentes (Natural Earth), recorte costero

api/                        EL SERVIDOR DE ADMINISTRACIÓN (Python, sin dependencias)
  servidor.py               sirve web/ + API REST (fuentes, ingestas, propuestas, export)
  fuentes/                  conectores de ingesta (owid_poblacion, wikidata_gobernantes…)
  validar.py                validador de historia.json (ejecútalo antes de un MR)
  revisar.py, exportar.py   revisión y export por terminal (alternativa al panel)
  editorial.db              base editorial local con las propuestas (NO se sube al repo)
```

### Cómo fluyen los datos

1. Al elegir un año, la app carga el `world_<año>.geojson` más cercano y pinta los territorios (color estable por entidad: el mismo reino conserva su color en todos los años).
2. `historia.json` enriquece ese mapa: los popups buscan la entidad por su `NAME`/`SUBJECTO` y muestran gobernante y población del año; los conflictos activos pintan sus zonas (recortadas contra la costa real) y batallas; los eventos ponen sus pines.
3. Los escudos de armas y los extractos de las fichas se piden en vivo a las APIs gratuitas de Wikidata y Wikipedia, con caché en el navegador. Sin red, la app funciona igual pero sin escudos ni extractos.

### Fuentes

- Fronteras históricas: [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (precisión orientativa, especialmente en épocas antiguas).
- Contorno de continentes: [Natural Earth](https://www.naturalearthdata.com/) 1:50M.
- Escudos y extractos: APIs públicas de Wikidata / Wikipedia / Wikimedia Commons.
- Gobernantes, población, conflictos, zonas, batallas y eventos: datos curados a mano en `data/historia.json` — estimaciones divulgativas, no investigación académica. Las correcciones son bienvenidas.

## Referencias de los datos

Cada país, conflicto y evento lleva un campo `fuentes` con sus referencias (`wikipedia-es:…`, `wikidata:Q…`, `owid:…` o `curado`), que la app muestra al pie de cada ficha. El contenido extraído de APIs externas cita siempre su origen y licencia.

## Pipeline de fuentes externas

Además de la edición manual, el proyecto puede ingerir datos de fuentes abiertas con un flujo curado: los scripts de `scripts/fuentes/` consultan las APIs y generan **propuestas** en una base SQLite local; nada se publica sin revisión humana.

La forma cómoda es el **panel de administración** (`http://localhost:9000/admin.html` con `python api/servidor.py` en marcha): muestra las fuentes configuradas con su última ejecución, el mapeo país ↔ fuente (campos `owid` y QID de `wikidata` en `historia.json`), lanza actualizaciones con un botón (con «modo demo» sin red), enseña cada propuesta con el dato ya mapeado a nuestro formato, y permite aprobar, rechazar y exportar con el validador integrado.

Las ingestas **guardan cada propuesta al momento** y recuerdan por qué país iban: si una se corta a medias (red, límite de peticiones, cierre del servidor), nada se pierde y la siguiente ejecución **continúa donde se quedó** sin repetir los países ya consultados — el panel lo indica con «a medias: X/Y países». Al completarse la pila, la próxima ejecución vuelve a empezar desde el principio; el botón «↺ Empezar de cero» fuerza ese reinicio en cualquier momento.

Todo existe también por terminal:

```bash
python api/fuentes/owid_poblacion.py        # series de población (Our World in Data, CC BY)
python api/fuentes/wikidata_gobernantes.py  # jefes de Estado (Wikidata, CC0)
python api/fuentes/wikidata_batallas.py     # batallas con coordenadas y fecha (Wikidata, CC0)
python api/revisar.py list                  # ver propuestas pendientes
python api/revisar.py aprobar 1-10          # aprobar / rechazar / aprobar-todas
python api/exportar.py                      # aplicar a web/data/historia.json + validar
```

Las ingestas reales requieren internet abierto (ejecútalas en tu máquina); `--demo` prueba el circuito sin red.

## Contribuir

Todo lo que se ve en el mapa sale de `web/data/historia.json`, pensado para editarse sin tocar código. La guía completa, con ejemplos copiables de cada tipo de dato y la checklist de merge request, está en **[CONTRIBUTING.md](CONTRIBUTING.md)**. En resumen:

1. Haz un fork y edita `web/data/historia.json` (o `web/i18n/*.json` para traducciones).
2. Valida: `python api/validar.py`
3. Prueba en local moviendo el deslizador por los años que tocan tus datos.
4. Abre el merge request explicando la fuente de tus datos.

## Licencias

Código de la aplicación: libre uso en el ámbito del proyecto. Fronteras de historical-basemaps: GPL-3.0 (código) y uso académico/educativo (datos). Natural Earth: dominio público. Contenidos de Wikipedia/Wikidata: CC BY-SA / CC0 según cada obra.
