# Libros de texto como fuente: los 50 países y su estado

Objetivo: contrastar y ampliar `web/data/historia.json` con libros de texto de historia
(edad objetivo ~15-16 años), uno **internacional** y uno **nacional** por país.

**Reglas del corpus**

- Solo fuentes **legales**: licencias abiertas (CC), libros oficiales gratuitos de cada
  ministerio de educación, o dominio público (Proyecto Gutenberg / Archive.org).
  Los manuales comerciales (Santillana, Oxford…) que aparecen en Google con
  `filetype:pdf` suelen ser copias piratas y **no se usan**.
- Los ficheros viven en **`libros/`**, que está en `.gitignore`: el material ajeno no
  se sube al repositorio jamás. Lo que sí se versiona es esta lista y las fichas de
  extracción (`docs/libros/fichas/`).
- Desde el entorno de trabajo de Claude solo es alcanzable GitHub, así que los libros
  marcados 🔗 se descargan **a mano** desde el enlace oficial y se sueltan en `libros/`
  (PDF o TXT); después se analizan y se generan sus fichas.
- Todo dato que pase de una ficha a `historia.json` lleva su campo `fuentes`.

**Base internacional (cubre a todos los países)**

| Libro | Licencia | Estado |
|---|---|---|
| OpenStax — *World History, Volume 1 (to 1500)* | CC BY-NC-SA 4.0 | ✔ descargado (`libros/openstax-world-history-vol1.txt`) |
| OpenStax — *World History, Volume 2 (from 1400)* | CC BY-NC-SA 4.0 | ✔ descargado (`libros/openstax-world-history-vol2.txt`) |
| H. G. Wells — *A Short History of the World* (1922) | Dominio público (Gutenberg #35461) | ✔ descargado (complementario; historiografía de época, contrastar) |

**Los 50 países** (por relevancia actual: economía, población y peso geopolítico).
Estados: ✔ descargado · 🔗 fuente legal localizada, descarga manual · 🕮 dominio público
candidato · ⏳ sin fuente legal localizada aún.

| # | País | Libro nacional candidato | Estado |
|---|---|---|---|
| 1 | Estados Unidos | OpenStax *U.S. History* (CC BY 4.0) | ✔ `libros/openstax-us-history.txt` |
| 2 | China | Sin edición abierta del manual PEP; alternativa 🕮 Hirth, *The Ancient History of China* (1908) | ⏳/🕮 |
| 3 | India | NCERT *Themes in World History* + *Themes in Indian History* — ncert.nic.in (oficial gratuito) | 🔗 |
| 4 | Alemania | 🕮 Menzel, *The History of Germany* (trad., Gutenberg) | 🕮 |
| 5 | Japón | 🕮 Murdoch, *A History of Japan* (Archive.org) | 🕮 |
| 6 | Reino Unido | 🕮 Cheyney, *A Short History of England* (Gutenberg) | 🕮 |
| 7 | Francia | 🕮 Lavisse, *Histoire de France (cours moyen)* (Gutenberg) | 🕮 |
| 8 | Italia | ⏳ (candidato: manuales CC de it.wikibooks) | ⏳ |
| 9 | Brasil | 🕮 João Ribeiro, *História do Brasil (curso médio)* (dominio público) | 🕮 |
| 10 | Canadá | *Canadian History: Pre-Confederation* — BCcampus Open Textbook (CC BY) | 🔗 |
| 11 | Rusia | 🕮 Kliuchevski, *A History of Russia* (trad., Archive.org) | 🕮 |
| 12 | Corea del Sur | ⏳ | ⏳ |
| 13 | España | 🕮 Altamira, *Historia de España y de la civilización española* (dominio público) | 🕮 |
| 14 | Australia | 🕮 Ernest Scott, *A Short History of Australia* (Gutenberg #12251) | 🕮 |
| 15 | México | CONALITEG/SEP — libros de texto gratuitos de Historia (oficial) | 🔗 |
| 16 | Indonesia | BSE Kemdikbud — *Sejarah Indonesia* (oficial gratuito) | 🔗 |
| 17 | Países Bajos | 🕮 Motley, *The Rise of the Dutch Republic* (Gutenberg) | 🕮 |
| 18 | Arabia Saudí | iEN (ien.edu.sa) — manuales oficiales gratuitos | 🔗 |
| 19 | Turquía | MEB/EBA — *Tarih* (oficial gratuito) | 🔗 |
| 20 | Suiza | ⏳ | ⏳ |
| 21 | Polonia | ZPE (zpe.gov.pl) — e-materiały de historia (oficial, CC) | 🔗 |
| 22 | Taiwán | ⏳ | ⏳ |
| 23 | Bélgica | ⏳ | ⏳ |
| 24 | Suecia | 🕮 Svanström/otros en Archive.org | 🕮 |
| 25 | Argentina | educ.ar (recursos oficiales) · 🕮 V. F. López, *Manual de historia argentina* | 🔗/🕮 |
| 26 | Irlanda | 🕮 P. W. Joyce, *A Concise History of Ireland* (Gutenberg) | 🕮 |
| 27 | Israel | ⏳ | ⏳ |
| 28 | Noruega | 🕮 Gjerset, *History of the Norwegian People* (Archive.org) | 🕮 |
| 29 | Austria | ⏳ | ⏳ |
| 30 | Emiratos Árabes Unidos | ⏳ | ⏳ |
| 31 | Egipto | Egyptian Knowledge Bank / MoE — manuales oficiales | 🔗 |
| 32 | Nigeria | ⏳ | ⏳ |
| 33 | Sudáfrica | 🕮 Theal, *South Africa* (Story of the Nations, Gutenberg) | 🕮 |
| 34 | Irán | chap.sch.ir — manuales oficiales gratuitos | 🔗 |
| 35 | Pakistán | PCTB (Punjab Textbook Board) — PDF oficiales | 🔗 |
| 36 | Bangladés | NCTB — manuales oficiales gratuitos | 🔗 |
| 37 | Vietnam | ⏳ | ⏳ |
| 38 | Tailandia | ⏳ | ⏳ |
| 39 | Filipinas | DepEd LRMDS — módulos oficiales | 🔗 |
| 40 | Malasia | Textbooks digitales KPM (oficial) | 🔗 |
| 41 | Singapur | ⏳ | ⏳ |
| 42 | Dinamarca | 🕮 en Archive.org | 🕮 |
| 43 | Finlandia | ⏳ | ⏳ |
| 44 | Grecia | ebooks.edu.gr — manuales oficiales del ministerio (gratuitos) | 🔗 |
| 45 | Portugal | 🕮 Stephens, *Portugal* (Story of the Nations, Gutenberg) | 🕮 |
| 46 | Chile | 🕮 Barros Arana, *Compendio de historia de Chile* (dominio público) | 🕮 |
| 47 | Colombia | 🕮 Henao y Arrubla, *Historia de Colombia* (dominio público) | 🕮 |
| 48 | Perú | 🕮 en Archive.org (dominio público) | 🕮 |
| 49 | Ucrania | lib.imzo.gov.ua — manuales oficiales gratuitos | 🔗 |
| 50 | Nueva Zelanda | 🕮 Reeves, *The Long White Cloud* (Gutenberg) | 🕮 |

**Cómo avanzar la lista**: descarga el PDF/TXT desde la fuente oficial al directorio
`libros/` (con un nombre tipo `pais-titulo.pdf`) y pide a Claude «analiza los libros
nuevos de libros/»: extraerá el texto, lo contrastará con `historia.json` y dejará su
ficha en `docs/libros/fichas/`.

---

## Lote «libros de texto - parte 1» (34 PDF aportados por el usuario, 2026-09-07)

Material aportado legítimamente por el usuario, en `libros/libros de texto - parte 1/`
(fuera del control de versiones). Se extrajo el **texto** con `pdftotext` y se analizó
extrayendo **solo hechos** (fechas, gobernantes, batallas, eventos) — nunca prosa literal.
Los 7 tomos de Juan de Mariana (~3.800 pp., h. 1600) quedan diferidos para una pasada
final de bajo coste. Fichas resultantes en `docs/libros/fichas/`:

| Ficha | Libros base | Candidatos |
|---|---|---|
| `grecia.md` | *Historia Antigua II: Grecia* (Univ. Cantabria) + *Breve historia de Grecia* | 44 |
| `china.md` | *Breve historia de la China milenaria*; *Breve historia de la RPC 1949-2019* | 58 |
| `roma.md` | *El Imperio Romano 31 a.C.–235 d.C.*; Herodiano | 39 |
| `inglaterra.md` | *Pequeña historia de Inglaterra* (Chesterton); *Breve historia de Inglaterra* (Jenkins) | 64 |
| `japon.md` | *Historia de Japón* (Walker) | 51 |
| `otomano.md` | *Breve historia del Imperio otomano*; *El Imperio otomano 1451-1807* | 62 |
| `universal.md` | Wells; *Toda la historia del mundo*; Santillana; cronología universal | 35 |
| `edad-media.md` | *Historia de la Edad Media* (tomo I); Montanelli | 31 |
| `espana.md` | *Historia de España* (síntesis); cronología España 2012-2013 | 41 |

**Total: 428 candidatos** para revisar e incorporar a `historia.json` en el paso de
consolidación (listas de emperadores romanos, sultanes otomanos, monarcas ingleses y
españoles, dinastías chinas, shogunes japoneses, Mesopotamia antigua, reinos medievales,
etc.). La incorporación la hace un único proceso en serie, con dedup contra el corpus
existente y validación, para no romper `historia.json`.
