#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Utilidades comunes del pipeline de ingesta de Chronus Tabula.

La base editorial (api/editorial.db, SQLite, NO se sube al repositorio)
guarda *propuestas* de cambio generadas por los scripts de api/fuentes/.
Nada llega a historia.json sin aprobarse con api/revisar.py y exportarse
con api/exportar.py.
"""
import json
import os
import sqlite3
import sys
import time
from datetime import date

# Windows usa cp1252 en consolas y tuberías, incapaz de imprimir ✔ ⚠ ✘:
# forzamos UTF-8 en la salida de todos los scripts del pipeline.
for _flujo in (sys.stdout, sys.stderr):
    if _flujo and hasattr(_flujo, "reconfigure"):
        try:
            _flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Ruta de la base editorial; configurable con la variable de entorno CHRONUS_DB
# (útil si el repositorio vive en una carpeta sincronizada/de red donde SQLite
# no puede bloquear ficheros).
DB = os.environ.get("CHRONUS_DB") or os.path.join(RAIZ, "api", "editorial.db")
# FUENTE de los datos: un fichero por entidad en datos/ (paises/<id>.json,
# conflictos/<id>.json, eventos/<año>-<nombre>.json, territorios/<nombre>.json)
# más datos/_meta.json con las claves de primer nivel que no son colecciones.
DATOS = os.environ.get("CHRONUS_DATOS") or os.path.join(RAIZ, "datos")
# ARTEFACTO para la web: un único JSON que se genera a partir de datos/ (no se
# edita a mano ni se versiona; lo compilan servidor.py al arrancar, exportar.py
# al aplicar propuestas, api/compilar.py y el despliegue en CI).
HISTORIA = os.path.join(RAIZ, "web", "data", "historia.json")
COLECCIONES = ("paises", "conflictos", "eventos", "territorios")

HOY = date.today().isoformat()


def conectar():
    try:
        con = sqlite3.connect(DB)
        con.execute("PRAGMA journal_mode=MEMORY")
    except sqlite3.OperationalError as e:
        print(f"✘ No puedo abrir la base editorial en {DB}: {e}")
        print("  Si el repositorio está en una unidad de red o sincronizada, define otra ruta local:")
        print("     Windows:  set CHRONUS_DB=%TEMP%\\chronus.db")
        print("     Linux/Mac: export CHRONUS_DB=/tmp/chronus.db")
        raise SystemExit(2)
    con.execute("""
        CREATE TABLE IF NOT EXISTS propuestas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,          -- 'poblacion' | 'gobernante' | ...
            pais TEXT NOT NULL,          -- id del país en historia.json
            resumen TEXT NOT NULL,       -- una línea legible para el revisor
            payload TEXT NOT NULL,       -- JSON con el dato a fusionar
            fuente TEXT NOT NULL,        -- id de la fuente (owid:…, wikidata:…)
            estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|aprobada|rechazada|exportada
            creado TEXT NOT NULL
        )""")
    con.execute("""CREATE INDEX IF NOT EXISTS idx_estado ON propuestas(estado)""")
    return con


def _slug(texto):
    """'Batalla de las Termópilas' -> 'batalla-de-las-termopilas' (para nombres de fichero)."""
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "sin-nombre"


def _nombre_fichero(coleccion, reg):
    """Nombre de fichero de una entidad. Países y conflictos usan su 'id'; eventos y
    territorios no tienen id, así que se deriva del año y el nombre."""
    if coleccion in ("paises", "conflictos"):
        return (reg.get("id") or _slug(reg.get("nombre"))) + ".json"
    if coleccion == "eventos":
        a = reg.get("anio")
        pref = (f"{abs(a)}ac" if isinstance(a, int) and a < 0 else str(a)) if a is not None else "sin-anio"
        return f"{pref}-{_slug(reg.get('nombre'))}.json"
    return _slug(reg.get("nombre")) + ".json"  # territorios


def _orden(coleccion):
    """Clave de orden DETERMINISTA de cada colección al compilar: así el JSON de la
    web es siempre igual para los mismos datos, independientemente del orden en
    disco (el color de cada país se calcula por hash del nombre, no por posición)."""
    def entero(v):
        return v if isinstance(v, int) else 0
    if coleccion in ("paises", "conflictos"):
        return lambda r: r.get("id") or ""
    if coleccion == "eventos":
        return lambda r: (entero(r.get("anio")), r.get("nombre") or "")
    return lambda r: (entero(r.get("desde")), r.get("nombre") or "")


def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        rel = os.path.relpath(ruta, RAIZ)
        raise ValueError(f"{rel}: línea {e.lineno}, columna {e.colno}: {e.msg}") from e


def _escribir_json(ruta, obj):
    """Escribe el JSON con tabs y LF; devuelve True solo si el contenido cambió
    (así no se tocan ficheros —ni sus diffs— que no varían)."""
    txt = json.dumps(obj, ensure_ascii=False, indent="\t") + "\n"
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8", newline="") as f:
            if f.read() == txt:
                return False
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)
    return True


def cargar_historia():
    """Lee el árbol datos/ y devuelve el dict completo ({_meta…, paises, conflictos,
    eventos, territorios}). Si aún no existe datos/ (copia antigua del repositorio),
    cae al historia.json monolítico. Un fichero corrupto se señala por su ruta."""
    if not os.path.isdir(DATOS):
        return _leer_json(HISTORIA)
    d = {}
    meta = os.path.join(DATOS, "_meta.json")
    if os.path.exists(meta):
        d.update(_leer_json(meta))
    for col in COLECCIONES:
        carpeta = os.path.join(DATOS, col)
        regs = []
        if os.path.isdir(carpeta):
            for fn in sorted(os.listdir(carpeta)):
                if fn.endswith(".json") and not fn.startswith("_"):
                    regs.append(_leer_json(os.path.join(carpeta, fn)))
        regs.sort(key=_orden(col))
        d[col] = regs
    return d


def guardar_historia(d):
    """Escribe cada entidad en su fichero de datos/ (solo los que cambian), retira
    los ficheros de entidades que ya no están, y recompila web/data/historia.json."""
    os.makedirs(DATOS, exist_ok=True)
    meta = {k: v for k, v in d.items() if k not in COLECCIONES}
    _escribir_json(os.path.join(DATOS, "_meta.json"), meta)
    for col in COLECCIONES:
        carpeta = os.path.join(DATOS, col)
        os.makedirs(carpeta, exist_ok=True)
        esperados = set()
        for reg in d.get(col, []):
            fn = _nombre_fichero(col, reg)
            base, i = fn[:-5], 2
            while fn in esperados:  # dos entidades con el mismo nombre: sufijo
                fn, i = f"{base}-{i}.json", i + 1
            esperados.add(fn)
            _escribir_json(os.path.join(carpeta, fn), reg)
        for fn in os.listdir(carpeta):
            if fn.endswith(".json") and not fn.startswith("_") and fn not in esperados:
                os.remove(os.path.join(carpeta, fn))
    compilar_web(d)


def compilar_web(d=None):
    """Genera web/data/historia.json (el artefacto que descarga la web) a partir del
    árbol datos/, con las colecciones en orden canónico. Devuelve la ruta."""
    if d is None:
        d = cargar_historia()
    os.makedirs(os.path.dirname(HISTORIA), exist_ok=True)
    salida = {k: v for k, v in d.items() if k not in COLECCIONES}
    for col in COLECCIONES:
        salida[col] = sorted(d.get(col, []), key=_orden(col))
    with open(HISTORIA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(salida, f, ensure_ascii=False, indent="\t")
        f.write("\n")
    return HISTORIA


def proponer(con, tipo, pais, resumen, payload, fuente):
    """Inserta una propuesta si no existe otra igual pendiente/aprobada."""
    cur = con.execute(
        "SELECT id FROM propuestas WHERE tipo=? AND pais=? AND resumen=? AND estado IN ('pendiente','aprobada')",
        (tipo, pais, resumen))
    if cur.fetchone():
        return False
    con.execute(
        "INSERT INTO propuestas (tipo, pais, resumen, payload, fuente, creado) VALUES (?,?,?,?,?,?)",
        (tipo, pais, resumen, json.dumps(payload, ensure_ascii=False), fuente, HOY))
    return True


def init_progreso(con):
    """Tabla de progreso de las pilas de llamadas: qué unidades (países) ya
    consultó cada conector en la ejecución en curso. Si una ingesta se corta a
    medias, la siguiente reanuda saltando lo hecho; al completarse la pila se
    borra y la próxima ejecución empieza desde el principio."""
    con.execute("""CREATE TABLE IF NOT EXISTS progreso (
        fuente TEXT NOT NULL,
        clave  TEXT NOT NULL,
        fecha  TEXT NOT NULL,
        PRIMARY KEY (fuente, clave))""")


def progreso_hechas(con, fuente):
    """Claves (ids de país) ya consultadas por este conector en la pila actual."""
    init_progreso(con)
    return {r[0] for r in con.execute("SELECT clave FROM progreso WHERE fuente=?", (fuente,))}


def progreso_marcar(con, fuente, clave):
    """Apunta (y persiste al momento) que esta clave ya se consultó."""
    init_progreso(con)
    con.execute("INSERT OR REPLACE INTO progreso (fuente, clave, fecha) VALUES (?,?,?)",
                (fuente, clave, HOY))
    con.commit()


def progreso_borrar(con, fuente):
    """Olvida el progreso guardado: la próxima ejecución empieza desde cero."""
    init_progreso(con)
    con.execute("DELETE FROM progreso WHERE fuente=?", (fuente,))
    con.commit()


def descargar(url, timeout=60):
    """GET simple con la biblioteca estándar (sin dependencias)."""
    import urllib.request
    req = urllib.request.Request(url, headers={
        "User-Agent": "ChronusTabula/1.0 (pipeline de datos; ver CONTRIBUTING.md)",
        "Accept": "application/sparql-results+json, text/csv, application/json, */*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        # utf-8-sig elimina el BOM que algunos CSV (p. ej. OWID) traen al principio
        return r.read().decode("utf-8-sig", errors="replace")


def _segundos_espera(e, intento):
    """Cuánto esperar tras un 429/503, tomando el MENOR tiempo razonable que
    indique el servidor (mejor probar pronto que esperar de más):
      - la cabecera Retry-After (segundos o fecha HTTP), y
      - el ritmo declarado en el propio mensaje de error («N req / min|sec|hour»),
    y se queda con el mínimo. Sin pistas, 60 s. Se añade 1 s de margen (así, con
    «1 req/min», reintenta a los 61 s) y un backoff suave si el intento se repite."""
    import re
    import datetime
    from email.utils import parsedate_to_datetime
    cand = []
    ra = e.headers.get("Retry-After") if getattr(e, "headers", None) else None
    if ra:
        try:
            cand.append(float(int(ra)))                       # Retry-After en segundos
        except (TypeError, ValueError):
            try:                                              # …o como fecha HTTP
                dt = parsedate_to_datetime(ra)
                cand.append(max(0.0, (dt - datetime.datetime.now(dt.tzinfo)).total_seconds()))
            except Exception:
                pass
    try:
        cuerpo = e.read().decode("utf-8", "replace")
    except Exception:
        cuerpo = str(e)
    m = re.search(r"(\d+)\s*req\w*\s*/?\s*(sec|second|segundo|min|minute|minuto|hour|hora)", cuerpo, re.I)
    if m:
        n = max(1, int(m.group(1)))
        u = m.group(2).lower()
        base = 1 if u.startswith(("sec", "seg")) else 3600 if u.startswith(("hour", "hora")) else 60
        cand.append(base / n)                                 # intervalo entre llamadas permitidas
    espera = min(cand) if cand else 60.0
    espera = (espera + 1) * (1 + 0.4 * (intento - 1))         # +1 s de margen + backoff suave
    return max(5.0, min(espera, 900.0))


def descargar_reintentos(url, timeout=180, intentos=6):
    """Como descargar(), pero si el servidor limita (HTTP 429/503) espera el
    tiempo REAL que indica —cabecera Retry-After o el ritmo del propio mensaje
    (p. ej. «1 req/min» → 61 s), lo que sea menor— y reintenta, con varios
    intentos y backoff suave. Así aguanta un WDQS lento o con incidencia sin
    esperar de más ni tumbar la ejecución."""
    import urllib.error
    for i in range(1, intentos + 1):
        try:
            return descargar(url, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < intentos:
                espera = _segundos_espera(e, i)
                print(f"  ⏳ límite del servidor (HTTP {e.code}); esperando {espera:.0f}s "
                      f"(intento {i}/{intentos - 1})…", flush=True)
                time.sleep(espera)
                continue
            raise


def es_error_de_pais(e):
    """True si el error es específico de ESTA petición/país y conviene saltarlo y
    seguir: un HTTP 4xx (petición mala, sin artículo…) salvo 429. Un 429/5xx o un
    fallo de red es del servidor: mejor parar y reanudar la pila más tarde."""
    import urllib.error
    return isinstance(e, urllib.error.HTTPError) and 400 <= e.code < 500 and e.code != 429


def aviso_red(nombre, e):
    print(f"✘ No se pudo contactar con {nombre}: {e}")
    print("  Este script necesita internet abierto: ejecútalo en tu máquina.")
    print("  Para probar el circuito sin red usa:  --demo")
    sys.exit(2)
