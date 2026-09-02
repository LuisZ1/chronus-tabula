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
HISTORIA = os.path.join(RAIZ, "web", "data", "historia.json")

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


def cargar_historia():
    with open(HISTORIA, encoding="utf-8") as f:
        return json.load(f)


def guardar_historia(d):
    with open(HISTORIA, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


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


def descargar_reintentos(url, timeout=180, intentos=4):
    """Como descargar(), pero si el servidor limita (HTTP 429/503) espera lo que
    pida su cabecera Retry-After (o 65 s) y reintenta."""
    import urllib.error
    for i in range(1, intentos + 1):
        try:
            return descargar(url, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < intentos:
                try:
                    espera = int(e.headers.get("Retry-After") or 65)
                except (TypeError, ValueError):
                    espera = 65
                espera = min(max(espera, 30), 180)
                print(f"  ⏳ el servidor limita las peticiones (HTTP {e.code}); esperando {espera}s (intento {i}/{intentos - 1})…", flush=True)
                time.sleep(espera)
                continue
            raise


def aviso_red(nombre, e):
    print(f"✘ No se pudo contactar con {nombre}: {e}")
    print("  Este script necesita internet abierto: ejecútalo en tu máquina.")
    print("  Para probar el circuito sin red usa:  --demo")
    sys.exit(2)
