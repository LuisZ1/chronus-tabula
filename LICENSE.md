# Licencia de Chronus Tabula

© 2026 Luis Zumárraga. Todos los derechos reservados, salvo lo que se indica a continuación.

Chronus Tabula es un proyecto de **código y datos visibles, pero no libres**. Se puede consultar, usar con fines no comerciales y mejorar mediante contribuciones al repositorio oficial. **No** se puede copiar ni redistribuir la aplicación, sus datos o su estructura, ni comercializarlos, ni crear a partir de ellos otra aplicación o base de datos, sin permiso escrito del titular.

Este documento tiene cinco partes: el software (1), la base de datos (2), los contenidos de terceros, que conservan su propia licencia (3), las contribuciones (4) y la ausencia de garantía (5). El resumen para visitantes está en [web/aviso-legal.html](web/aviso-legal.html).

## 1. Software: PolyForm Strict 1.0.0

El código y el diseño propios del proyecto se ofrecen bajo la licencia **PolyForm Strict 1.0.0**, cuyo texto íntegro, en inglés, está en [LICENSE-POLYFORM-STRICT.md](LICENSE-POLYFORM-STRICT.md). Incluye:

- las páginas y estilos de `web/` (HTML, CSS, JavaScript e imágenes propias, como las láminas de `web/img/`);
- los scripts de `api/`, los esquemas de `schema/` y la configuración del repositorio;
- la documentación (`README.md`, `CONTRIBUTING.md`, `DESIGN.md`, `PRODUCT.md`, `docs/`, `plans/`).

En resumen, y sin que este resumen sustituya al texto de la licencia:

- **Se permite** usar el software con cualquier fin **no comercial**: estudio personal, investigación, docencia, uso por centros educativos y organismos públicos.
- **No se permite** distribuirlo ni crear obras derivadas de él (modificaciones, adaptaciones, otras aplicaciones basadas en su código o en su diseño), ni usarlo con fines comerciales.

**Permiso adicional para contribuir.** Además de lo que concede PolyForm Strict, se permite hacer una copia (*fork*) del repositorio en GitHub y modificarla **con el único fin de proponer cambios al repositorio oficial** mediante *pull request*. Ese permiso no autoriza a publicar, distribuir ni desplegar la copia modificada para otro uso.

## 2. Base de datos: todos los derechos reservados

La base de datos del proyecto es obra del titular. Incluye los ficheros de `datos/`, el compilado `web/data/historia.json` y los parches de fronteras propios. Protegidos son en particular la selección y la organización de los contenidos, el formato y la estructura de las fichas, los vínculos entre entidades, los nombres por época, las reseñas y descripciones propias y la curación de fechas y fuentes.

Está protegida por el derecho de autor sobre las compilaciones y por el derecho *sui generis* del fabricante de bases de datos: artículos 12 y 133 a 137 del texto refundido de la Ley de Propiedad Intelectual (Real Decreto Legislativo 1/1996) y Directiva 96/9/CE.

**Se permite, sin pedir permiso:**

- consultar los datos en la web y usarlos en clase: proyectar el mapa, compartir enlaces a momentos concretos o tomar capturas con fines educativos, citando «Chronus Tabula»;
- citar datos concretos (una fecha, un gobernante, una cifra) con atribución, dentro de los usos que permite la ley.

**No se permite sin permiso escrito del titular:**

- extraer o reutilizar la totalidad o una parte sustancial de la base de datos, ni hacerlo de forma repetida con partes no sustanciales;
- redistribuir los ficheros de datos, completos o en parte, en su formato o en otro;
- usar la estructura, el formato o los datos ya organizados de la base para crear otra aplicación, base de datos, API o producto, sea comercial o no;
- cualquier uso comercial de los datos, incluida su ingesta automatizada para alimentar o entrenar servicios o modelos comerciales.

Los hechos históricos en sí (que una batalla ocurrió en tal año) no son propiedad de nadie. Esta licencia no impide investigarlos en las fuentes originales; protege el trabajo de reunirlos, verificarlos y organizarlos.

## 3. Contenidos de terceros: conservan su licencia

Estas partes no son del titular y **se rigen por su propia licencia, no por esta**. Quien quiera reutilizarlas debe acudir a su fuente y cumplir sus condiciones:

| Contenido | Dónde | Licencia |
|---|---|---|
| Mapas de fronteras de [historical-basemaps](https://github.com/aourednik/historical-basemaps), incluidas las versiones corregidas o rellenadas por este proyecto | `web/data/geojson/` | GPL-3.0 |
| Textos procedentes de Wikipedia (reseñas y extractos, marcados con su fuente) | `datos/`, fichas del mapa | CC BY-SA 4.0 |
| Datos de Wikidata | `datos/` | CC0 1.0 |
| Población de Our World in Data | `datos/` | CC BY 4.0 |
| Escudos y banderas | Wikimedia Commons, enlazados, no copiados | la de cada fichero |
| Leaflet 1.9.4 | `web/lib/leaflet/` | BSD-2-Clause |
| polygon-clipping | `web/lib/polygon-clipping/` | MIT |
| Tipografía Archivo | `web/lib/fuentes/` | SIL Open Font License 1.1 |
| Fuente de banderas (Twemoji Country Flags) | `web/lib/banderas/` | MIT (código) y CC BY 4.0 (gráficos) |
| Teselas del mapa base (Esri, OpenStreetMap) | servidas por terceros | sus condiciones de uso |

## 4. Contribuciones

Quien envía una contribución (un *pull request*, un aviso con datos o un cambio hecho con el asistente del panel) declara que:

- es autor de lo que aporta o tiene derecho a aportarlo;
- los datos o textos de terceros que incluye respetan su licencia y van con su fuente.

Además, concede al titular una licencia **mundial, gratuita, no exclusiva, perpetua e irrevocable, con facultad de sublicenciar**, para usar, reproducir, modificar, distribuir y comunicar públicamente la contribución, dentro del proyecto y bajo las licencias que el titular decida. El contribuyente conserva sus derechos sobre su aportación y su nombre figura en el historial del repositorio.

## 5. Sin garantía

Los datos son **orientativos** y pueden contener errores, omisiones o simplificaciones. Muchas fronteras históricas son aproximadas, difusas o discutidas. El proyecto se ofrece «tal cual», sin garantía de ningún tipo, y en la medida en que la ley lo permita el titular no responde de los daños que pudieran derivarse de su uso. Antes de usar un dato en un trabajo académico, contrástalo con las fuentes que cita.

## Permisos y contacto

Para pedir un permiso que esta licencia no concede (uso comercial, reutilización de datos, integración en otro proyecto) o para avisar de un posible uso indebido, abre un *issue* en [github.com/LuisZ1/chronus-tabula](https://github.com/LuisZ1/chronus-tabula/issues) o escribe al titular a través de su perfil de GitHub.
