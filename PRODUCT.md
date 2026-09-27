# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Público académico amplio, por igual: alumnos y profesores desde Secundaria y Bachillerato hasta la universidad (Historia, Geografía, Relaciones Internacionales), y curiosos de la historia. Escenas reales: un profesor que prepara una sesión y proyecta el mapa en el aula; un alumno que lo consulta en el móvil o el ordenador para estudiar o hacer un trabajo; alguien que busca «cómo era el mundo en tal año».

## Product Purpose

Chronus Tabula es un mapa histórico interactivo: eliges un año, de 3000 a. C. a hoy, y ves qué entidades políticas existían, hasta dónde llegaban, quién gobernaba, qué batallas se libraban y qué ocurría. En la portada, el éxito es doble: que el visitante entienda en segundos qué es y abra el mapa, y que un docente vea cómo encaja en una clase (enlaces a momentos concretos, capas, fuentes).

## Positioning

Un mapa que cambia con el año con datos curados y citados uno a uno: fronteras de mapas históricos abiertos (historical-basemaps), nombres de la época (Congo Belga, Zaire, RD del Congo según el año), gobernantes, población, batallas y zonas de guerra, acontecimientos e inventos, territorios pequeños y escudos o banderas por periodo. Todo es texto abierto, un fichero por entidad, validado automáticamente y editable por cualquiera.

## Operating Context

- Aula con proyector, ordenador personal y móvil; la misma URL funciona en todos.
- La dirección guarda año, posición y zoom (`mapa.html#1492/38.00/-4.00/5`): un enlace se comparte y abre exactamente el mismo momento.
- Interfaz en español e inglés.
- Colaboración: repositorio abierto en GitHub; servidor local (`python api/servidor.py`) con panel de administración y asistente de edición de fichas; los cambios llegan por pull request.

## Capabilities and Constraints

- Web estática publicada en GitHub Pages; HTML, CSS y JavaScript sin dependencias ni compilación, Leaflet para el mapa. El panel de administración y las ingestas son solo locales.
- Superficies: portada (`web/index.html`), colaborar (`web/colaborar.html`), mapa (`web/mapa.html`), panel (`web/admin.html`).
- Sistema visual común en `web/css/marca.css`, que cargan las cuatro páginas.
- La barra de tiempo del mapa reparte el espacio de forma no lineal (1500–hoy ocupa la mitad) y tiene 53 mapas de fronteras; entre dos fechas se muestra el último mapa disponible.
- Las fronteras son aproximadas y a menudo difusas o disputadas: la web no debe prometer precisión que no tiene.

## Brand Commitments

- Nombre: Chronus Tabula.
- El público académico no se nombra literalmente en la web («para profesores y alumnos»); lo transmiten el tono, los ejemplos y el rigor.
- Español primero; interfaz también en inglés.
- La identidad visual está abierta a una propuesta nueva (confirmado: 2026-09-28), tipografía incluida.

## Evidence on Hand

- Datos reales (a 28-09-2026): 262 países y entidades, 160 conflictos, 384 zonas de guerra, 939 batallas, 183 acontecimientos, 35 territorios, 53 mapas de fronteras.
- Capturas reales del mapa generadas desde la propia app (`web/img/lamina/`, con su procedencia en `PROCEDENCIA.md`).
- Fuentes: Wikipedia y Wikidata (CC BY-SA / CC0), Our World in Data (CC BY), historical-basemaps.
- No hay testimonios, centros usuarios, cifras de uso ni prensa: no se inventan.

## Product Principles

1. Demostrar, no describir: el mapa cambiando con el año es la mejor explicación.
2. Rigor visible: cada dato con su fuente, y la incertidumbre de las fronteras dicha con honestidad.
3. Un enlace, un momento: todo lo que se ve se puede compartir y proyectar tal cual.
4. Abierto de verdad: cualquiera puede corregir o ampliar, sin tocar código.

## Accessibility & Inclusion

Uso en aula y en móvil: legible proyectado (tamaños y contraste generosos), manejable con el dedo (zonas táctiles de 44 px) y con teclado, y respetando «reducir movimiento».
