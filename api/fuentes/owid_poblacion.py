#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de población histórica desde Our World in Data (HYDE/Gapminder/ONU).

Uso (desde la raíz del repositorio):

    python api/fuentes/owid_poblacion.py           # descarga real
    python api/fuentes/owid_poblacion.py --demo    # datos de muestra, sin red

Genera una propuesta 'poblacion' por cada país de historia.json que tenga el
campo "owid" (nombre de la entidad en OWID). Cada propuesta sustituye la serie
poblacion[] del país por una muestra razonable de la serie completa, con su
fuente. Revisa con api/revisar.py y aplica con api/exportar.py.

Fuente: https://ourworldindata.org/grapher/population  (CC BY)
"""
import csv
import io
import sys

import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import aviso_red, cargar_historia, conectar, descargar, proponer, HOY  # noqa: E402

URLS = [
    # CSV del grapher de OWID (Entity,Code,Year,population)
    "https://ourworldindata.org/grapher/population.csv?csvType=full&useColumnShortNames=true",
    "https://ourworldindata.org/grapher/population.csv",
]

DEMO = """Entity,Code,Year,population
Spain,ESP,1500,6800000
Spain,ESP,1600,8240000
Spain,ESP,1700,7500000
Spain,ESP,1800,11500000
Spain,ESP,1900,18566000
Spain,ESP,1950,28070000
Spain,ESP,2010,46577000
France,FRA,1500,15000000
France,FRA,1800,29355000
France,FRA,1900,40598000
France,FRA,2010,64613000
"""


def muestrear(serie):
    """Reduce la serie a puntos legibles: cada 100 años hasta 1700,
    cada 50 hasta 1900, cada 10 después (más el último disponible)."""
    out = []
    for anio, valor in sorted(serie.items()):
        paso = 100 if anio < 1700 else 50 if anio < 1900 else 10
        if anio % paso == 0:
            out.append({"anio": anio, "valor": valor})
    ultimo = max(serie)
    if out and out[-1]["anio"] != ultimo:
        out.append({"anio": ultimo, "valor": serie[ultimo]})
    return out


def main():
    demo = "--demo" in sys.argv
    if demo:
        texto = DEMO
    else:
        texto = None
        for url in URLS:
            try:
                texto = descargar(url, timeout=180)
                break
            except Exception as e:  # noqa: BLE001
                ultimo_error = e
        if texto is None:
            aviso_red("Our World in Data", ultimo_error)

    historia = cargar_historia()
    con_owid = {p["id"]: p["owid"] for p in historia["paises"] if p.get("owid")}
    por_entidad = {}
    por_codigo = {}  # también indexamos por código ISO3 (columna 'Code' del CSV)
    lector = csv.DictReader(io.StringIO(texto))
    # normalizar cabeceras: sin BOM, sin espacios, tolerante a mayúsculas
    lector.fieldnames = [ (c or "").lstrip("\ufeff").strip() for c in (lector.fieldnames or []) ]
    columnas = {c.lower(): c for c in lector.fieldnames}
    col_ent = columnas.get("entity") or columnas.get("country")
    col_code = columnas.get("code") or columnas.get("iso_code") or columnas.get("iso3")
    col_anio = columnas.get("year")
    col_pob = next((orig for low, orig in columnas.items() if "population" in low or low == "pop"), None)
    if not (col_ent and col_anio and col_pob):
        print("✘ No reconozco el formato del CSV de OWID.")
        print(f"  Columnas recibidas: {lector.fieldnames}")
        print(f"  Primeros 200 caracteres: {texto[:200]!r}")
        return 1
    for fila in lector:
        try:
            entidad, anio, valor = fila[col_ent], int(fila[col_anio]), int(float(fila[col_pob]))
        except (KeyError, TypeError, ValueError):
            continue
        por_entidad.setdefault(entidad, {})[anio] = valor
        if col_code:
            cod = (fila.get(col_code) or "").strip()
            if cod:
                por_codigo.setdefault(cod, {})[anio] = valor
    if not por_entidad:
        print("✘ El CSV se descargó pero no se pudo leer ninguna fila; ¿cambió el formato de OWID?")
        print(f"  Primeros 200 caracteres: {texto[:200]!r}")
        return 1

    con = conectar()
    nuevas = 0
    for pais_id, entidad in con_owid.items():
        # el campo 'owid' de la ficha puede ser el nombre de la entidad (Spain) o
        # su código ISO3 (ESP): probamos ambos
        serie = (por_entidad.get(entidad) or por_codigo.get(entidad)
                 or por_codigo.get((entidad or "").upper()))
        if not serie:
            print(f"  ⚠ OWID no tiene entidad ni código '{entidad}' (país {pais_id})")
            continue
        puntos = muestrear(serie)
        if not puntos:
            continue
        payload = {
            "poblacion": puntos,
            "fuente": {"id": "owid:population", "url": "https://ourworldindata.org/grapher/population",
                       "licencia": "CC BY (HYDE, Gapminder, ONU)", "consultado": HOY},
        }
        resumen = f"población {entidad}: {len(puntos)} puntos ({puntos[0]['anio']}–{puntos[-1]['anio']})"
        if proponer(con, "poblacion", pais_id, resumen, payload, "owid:population"):
            nuevas += 1
            print(f"  + {pais_id}: {resumen}", flush=True)
            con.commit()  # cada propuesta queda guardada al momento
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s) en api/editorial.db — revisa con: python api/revisar.py list")
    return 0


if __name__ == "__main__":
    sys.exit(main())
