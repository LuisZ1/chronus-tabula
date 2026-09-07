# Ficha de contraste — HISTORIA UNIVERSAL (manuales de síntesis mundial)

**Fuentes analizadas** (en `libros/`, material del usuario, no redistribuible):
- `Breve Historia Del Mundo PDF.txt` — H. G. Wells, *Breve historia del mundo* (síntesis; resúmenes por capítulos; llega hasta la Reforma).
- `toda_la_historia_del_mundo.txt` — J.-C. Barreau y G. Bigot, *Toda la historia del mundo* (síntesis narrativa, de la prehistoria a hoy; fuerte en India, Persia, Mesopotamia y Sudeste Asiático).
- `historia del mundo - santillana.txt` — manual escolar (predomina s. XVIII–XX: revoluciones, Balcanes, guerras mundiales, Guerra Fría, descolonización).
- `cronologia-historia-del-mundo.txt` — cronología universal muy densa en fechas (de 4000 a.C. al año 2000).

Analizado el 2026-09-07 contra `historia.json` (69 países, 98 conflictos, 77 eventos).
**Solo hechos** (fechas, nombres, lugares): nada de texto literal del libro.

## Ya cubierto en historia.json
El corpus ya es muy rico: Egipto, Grecia, Roma, Cartago, islam (Omeya, Abasí, Almohade…), dinastías chinas (Han, Tang, Song, Ming, Qing), mongoles/Horda de Oro/Timúrida, mogol, vikingos, Reconquista, otomanos, safávidas/sasánidas, aztecas/mayas/incas/Teotihuacan, Malí/Songhai/Zimbabue, guerras médicas, púnicas, cruzadas, Alejandro, guerras mundiales, Guerra Fría, guerras yugoslavas, etc. **No se repropone nada de eso.** Los candidatos de abajo son huecos globales que NO figuran en `cobertura.txt`: Mesopotamia antigua, hititas, India maurya, estados helenísticos (partos/seléucidas/ptolemaicos), Imperio jemer, y varios conflictos/eventos concretos del s. XX y de la Antigüedad.

## Candidatos — países / gobernantes que faltan

| ✔ | Tipo | Candidato | Años | lat,lng aprox. | Respaldo (libro) |
|---|---|---|---|---|---|
| ☐ | país/civilización | **Sumeria** (ciudades-estado: Uruk, Ur, Kish, Lagash) | ~3000–2000 a.C. | 31.3,45.7 (Uruk) | Wells cap. XV; *Toda la historia* (Sumeria hacia 2600 a.C.); cronología (4º milenio) |
| ☐ | país/imperio | **Imperio acadio** — Sargón de Acad | ~2334–2150 a.C. | 33.1,44.1 (Acad, aprox.) | *Toda la historia* (Sargón, dinastías mesopotámicas) |
| ☐ | país/imperio | **Babilonia** (Imperio paleobabilónico y neobabilónico) | ~1894–539 a.C. | 32.5,44.4 | *Toda la historia* (Hamurabi ~1730; Nabucodonosor 587 a.C.); Wells cap. XX |
| ☐ | gobernante | └ a Babilonia: **Hamurabi** | ~1792–1750 a.C. | 32.5,44.4 | *Toda la historia* ("hacia 1730 reinó Hamurabi") |
| ☐ | gobernante | └ a Babilonia: **Nabucodonosor II** | 605–562 a.C. | 32.5,44.4 | *Toda la historia* (destruye Judá / deporta judíos 587 a.C.) |
| ☐ | país/imperio | **Asiria** (Imperio asirio, cap. Nínive) | ~911–609 a.C. | 36.4,43.1 (Nínive) | Wells cap. XVIII; *Toda la historia* (Nínive, reyes asirios) |
| ☐ | gobernante | └ a Asiria: **Tiglat-Pileser III / Sargón II / Asurbanipal** | ss. VIII–VII a.C. | 36.4,43.1 | Wells cap. XVIII; *Toda la historia* |
| ☐ | país/imperio | **Imperio hitita** (cap. Hattusa) | ~1600–1178 a.C. | 40.0,34.6 | Cronología (fundación 1600 a.C.); *Toda la historia* (hititas) |
| ☐ | país/imperio | **Imperio maurya** (India, cap. Pataliputra) | 322–185 a.C. | 25.6,85.1 | *Toda la historia* (reyes indios del Ganges/Dekkán); Wells caps. XXVIII–XXIX |
| ☐ | gobernante | └ a Maurya: **Asóka** | 273–232 a.C. | 25.6,85.1 | Wells cap. XXIX; *Toda la historia* (rey budista Asóka, cap. Taxila) |
| ☐ | país/imperio | **Imperio parto** (Partia, Persia) | 247 a.C.–224 d.C. | 33.1,44.6 (Ctesifonte) | *Toda la historia* ("Irán resurgirá con el Imperio parto") |
| ☐ | país/imperio | **Imperio seléucida** (cap. Antioquía) | 312–63 a.C. | 36.2,36.15 | *Toda la historia* (los diádocos; seléucida en Siria) |
| ☐ | país/dinastía | **Egipto ptolemaico** (dinastía de los Ptolomeos) | 305–30 a.C. | 31.2,29.9 (Alejandría) | *Toda la historia* (Ptolomeos, general de Alejandro) |
| ☐ | país/imperio | **Imperio jemer** (Angkor, Camboya) | ~802–1431 | 13.4,103.9 (Angkor) | *Toda la historia* (cultura india → templos de Angkor) |
| ☐ | país/dinastía | **Dinastía Sui** (China, reunificación previa a Tang) | 581–618 | 34.3,108.9 (Chang'an) | Wells cap. XLII (Suy y Tang) |
| ☐ | gobernante | └ a `china`/`han`: **Qin Shi Huang** (1er emperador) | 246–210 a.C. | 34.4,109.3 (Xianyang) | *Toda la historia* (Tsin Che Huang Ti unifica China) |
| ☐ | gobernante | └ a `egipto`: **Ramsés II** | ~1279–1213 a.C. | 25.7,32.6 (Tebas) | *Toda la historia* (Ramsés II, momia) |

## Candidatos — conflictos que faltan

| ✔ | Tipo | Candidato | Años | Zona/lugar (lat,lng) | Respaldo |
|---|---|---|---|---|---|
|   | └ batalla | **Batalla del Hidaspes** (Alejandro vs. rey Poros) — añadir a `alejandro` | 326 a.C. | Punyab, cerca del Indo (32.9,73.7) | *Toda la historia* (vence a Poros con elefantes) |
| ☐ | conflicto | **Guerra árabe-israelí de 1948** | 1948–1949 | Palestina/Israel (31.5,34.8) | Cronología (fundación de Israel 1948) |
| ☐ | conflicto | **Guerra de los Seis Días** (Israel vs Egipto, Jordania, Siria) | 1967 | Sinaí/Golán/Cisjordania (31.4,34.5) | Cronología (1967) |
| ☐ | conflicto | **Guerra de Yom Kippur / árabe-israelí de 1973** | 1973 | Sinaí y Golán (30.6,32.8) | Cronología ("nueva guerra árabe-israelí" 1973) |
| ☐ | conflicto | **Guerras indo-pakistaníes** | 1947, 1965, 1971 | Cachemira / subcontinente (33.8,74.8) | Cronología (guerra India–Pakistán 1965) |
| ☐ | conflicto | **Guerras de los Balcanes** | 1912–1913 | Península balcánica (41.0,22.0) | Santillana (Liga Balcánica vs Imperio otomano) |
| ☐ | conflicto | **Primera guerra ítalo-etíope** (batalla de Adwa) | 1895–1896 | Adwa, Etiopía (14.2,38.9) | *Toda la historia* (tropas etíopes derrotan a Italia, 1896) |
|   | └ batalla | **Batalla de Adwa** | 1896 | Adwa (14.2,38.9) | *Toda la historia* |
| ☐ | conflicto | **Guerra de las Malvinas** (Reino Unido vs Argentina) | 1982 | Islas Malvinas (-51.7,-59.2) | Cronología (1982) |
| ☐ | conflicto | **Revolución mexicana** | 1910–1917 | México (19.4,-99.1) | Cronología; Santillana (La Revolución mexicana) |

## Candidatos — eventos

| ✔ | Tipo | Candidato | Año | lat,lng | Respaldo |
|---|---|---|---|---|---|
| ☐ | evento | **Código de Hamurabi** (primer gran corpus legal) | ~1750 a.C. | 32.5,44.4 | *Toda la historia* (código de leyes en tablillas) |
| ☐ | evento | **Cautiverio de Babilonia** (deportación de los judíos) | 587 a.C. | 32.5,44.4 | *Toda la historia* (Nabucodonosor expulsa a los judíos) |
| ☐ | evento | **Nacimiento del budismo** (Siddharta Gautama, el Buda) | ~528 a.C. | 24.7,84.9 (Bodh Gaya) | Wells cap. XXVIII; *Toda la historia* (Buda, primera "revolución") |
| ☐ | evento | **Confucio y el confucianismo** | ~500 a.C. | 35.6,116.9 (Qufu) | Wells cap. XXX; *Toda la historia* (Confucio 555–479 a.C.) |
| ☐ | evento | **La Gran Muralla China** (unificación bajo Qin) | ~220 a.C. | 40.4,116.6 | *Toda la historia* (Gran Muralla; unificación Qin) |
| ☐ | evento | **Apertura de la Ruta de la Seda** | ~130 a.C. | 40.0,80.0 (Asia central) | *Toda la historia* (ruta de la seda une Egipto, India y China) |
| ☐ | evento | **Biblioteca y Museo de Alejandría** | s. III a.C. | 31.2,29.9 | Wells cap. XXVII |
| ☐ | evento | **Erupción del Vesubio: destrucción de Pompeya** | 79 d.C. | 40.75,14.49 | Cronología (Vesubio; Pompeya y Herculano) |
| ☐ | evento | **Templos de Borobudur** (budismo en Java) | s. IX | -7.6,110.2 | *Toda la historia* (templos de Borobudur, Indonesia) |
| ☐ | evento | **Construcción de Angkor Wat** | s. XII | 13.41,103.87 | *Toda la historia* (templos de Angkor) |

## Notas y dudas
- **Discrepancias de fechas de Asóka:** `Toda la historia` da 273–237 a.C. en un pasaje y 273–232 a.C. en otro; la cronología usa 273–232. Fijar con fuente moderna (reinado maurya ~268–232 a.C.).
- **Reyes asirios en `Toda la historia`:** el libro mezcla "Sargón, de 669 a 630 a.C." (fechas que corresponden más bien a Asurbanipal); conviene separar a **Sargón II** (722–705 a.C.) del legendario **Sargón de Acad** (~2334 a.C.), que son personajes distintos. Verificar antes de mapear.
- **Buda:** las fuentes dan 560/480 a.C. (`Toda la historia`); la datación académica moderna tiende a ~480–400 a.C. para el nirvana. Fecha del "nacimiento del budismo" es aproximada.
- **Confucio:** el libro da 555–479 a.C.; lo habitual es 551–479 a.C.
- **Solapamientos a comprobar contra `cobertura.txt`:** `egipto` ya existe como país (Ptolomeos y Ramsés II se proponen como *gobernantes* de esa entidad, no como país nuevo); `siria` existe como país (el **seléucida** se propone como imperio helenístico distinto, capital Antioquía — decidir si se modela aparte o como periodo de `siria`); `persia`/`sasanida` existen (el **parto** es el imperio iranio intermedio, 247 a.C.–224 d.C., no cubierto); `tang` existe (la **Sui** es la dinastía inmediatamente anterior). `etiopia` existe como país, pero la **guerra ítalo-etíope de 1896 / Adwa** no figura como conflicto.
- **`unificacion-qin` ya está** como conflicto; Qin Shi Huang se propone solo como *gobernante* y la Gran Muralla como *evento*, para no duplicar.
- **Descartados por falta de respaldo en estos 4 libros** (aunque serían huecos reales): Imperio gupta, Sultanato de Delhi, reinos coreanos (Silla/Goryeo/Joseon), Imperio de Ghana, Reino de Aksum, olmecas/toltecas — apenas se mencionan o no aparecen con datos mapeables aquí; buscar en manuales específicos.
- India antigua: `Toda la historia` documenta colonización del valle del Ganges y del Dekkán por "reyes indios" sin nombrar dinastías; el Maurya se sostiene por Asóka + Taxila. Confirmar límites del imperio con atlas.

> **Estado (2026-09-07)**: candidatos consolidados en `historia.json` (fusión serial con dedup y validación). Los países sin correspondencia en los mapas GeoJSON quedaron diferidos.
