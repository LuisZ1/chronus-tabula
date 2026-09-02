#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta masiva de batallas desde Wikidata, con coordenadas y fecha.

    python api/fuentes/wikidata_batallas.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_batallas.py --demo    # datos de muestra, sin red

Para cada país con campo "wikidata" (más su linaje opcional "wikidata_hist":
lista de QIDs de entidades predecesoras, p. ej. la Corona de Castilla para
España), consulta TODAS las batallas de Wikidata en las que participó
(P710) que tengan coordenadas (P625) y fecha (P585/P580), y propone cada una
dentro del conflicto de historia.json cuyo periodo y países encajen.
Las batallas sin conflicto donde encajar se listan para revisión manual.
Fuente: Wikidata (CC0).
"""
import json
import re
import sys
import unicodedata
import urllib.parse

import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, proponer,  # noqa: E402
                   progreso_borrar, progreso_hechas, progreso_marcar, HOY)

FID = "wikidata_batallas"
ENDPOINT = "https://query.wikidata.org/sparql"

# Una sola consulta por país: todos los QID de su linaje juntos (VALUES),
# para convivir con los límites de peticiones del endpoint de Wikidata.
SPARQL = """
SELECT DISTINCT ?b ?bLabel ?coord ?f1 ?f2 WHERE {
  VALUES ?pais { %s }
  ?b wdt:P31/wdt:P279* wd:Q178561 .
  ?b wdt:P710 ?pais .
  ?b wdt:P625 ?coord .
  OPTIONAL { ?b wdt:P585 ?f1 }
  OPTIONAL { ?b wdt:P580 ?f2 }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 2000
"""

DEMO = {"espana": [
    {"qid": "Q815355", "nombre": "Batalla de Talavera", "lat": 39.96, "lng": -4.83, "anio": 1809},
    {"qid": "Q733959", "nombre": "Batalla de Bailén", "lat": 38.10, "lng": -3.78, "anio": 1808},  # ya existe: debe deduplicarse
]}


def norm(t):
    t = unicodedata.normalize("NFD", str(t).lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def anio_de(fecha):
    if not fecha:
        return None
    neg = fecha.startswith("-")
    try:
        a = int((fecha[1:] if neg else fecha).split("-")[0])
    except ValueError:
        return None
    return -a if neg else a


def coord_de(punto):
    m = re.match(r"Point\(([-0-9.]+) ([-0-9.]+)\)", punto or "")
    return (float(m.group(2)), float(m.group(1))) if m else (None, None)


def consultar(qids):
    valores = " ".join(f"wd:{q}" for q in qids)
    url = ENDPOINT + "?format=json&query=" + urllib.parse.quote(SPARQL % valores)
    datos = json.loads(descargar_reintentos(url, timeout=300))
    filas = []
    for b in datos["results"]["bindings"]:
        lat, lng = coord_de(b.get("coord", {}).get("value"))
        anio = anio_de(b.get("f1", {}).get("value")) or anio_de(b.get("f2", {}).get("value"))
        nombre = b["bLabel"]["value"]
        if lat is None or anio is None or nombre.startswith("Q"):
            continue
        filas.append({"qid": b["b"]["value"].rsplit("/", 1)[-1],
                      "nombre": nombre, "lat": round(lat, 2), "lng": round(lng, 2), "anio": anio})
    return filas


def claves_pais(p):
    return {norm(x) for x in [p.get("nombre", ""), *(p.get("relacionados") or [])] if x}


MARGEN_GEO = 6.0  # grados alrededor del teatro de operaciones del conflicto


def envolvente(c):
    """Caja geográfica del conflicto: sus zonas y sus batallas ya curadas.
    None si el conflicto no tiene ninguna referencia geográfica."""
    lats, lngs = [], []
    for z in c.get("zonas", []):
        for pt in z.get("poligono", []):
            if isinstance(pt, list) and len(pt) == 2:
                lats.append(pt[0]); lngs.append(pt[1])
    for b in c.get("batallas", []):
        if isinstance(b.get("lat"), (int, float)) and isinstance(b.get("lng"), (int, float)):
            lats.append(b["lat"]); lngs.append(b["lng"])
    if not lats:
        return None
    return min(lats), max(lats), min(lngs), max(lngs)


def encaja_geo(batalla, c):
    """¿Cae la batalla dentro (o cerca, ± MARGEN_GEO) del teatro del conflicto?
    Evita asignar por año+país batallas de otro continente (p. ej. la batalla de
    los Fuertes de la Barrera, en Cantón, a las guerras indias de EE. UU.)."""
    env = envolvente(c)
    if env is None:
        return True  # sin referencia geográfica no se puede filtrar
    la1, la2, ln1, ln2 = env
    return (la1 - MARGEN_GEO <= batalla["lat"] <= la2 + MARGEN_GEO
            and ln1 - MARGEN_GEO <= batalla["lng"] <= ln2 + MARGEN_GEO)


def conflicto_para(batalla, pais, conflictos, claves):
    """El conflicto más ajustado cuyo periodo contiene el año, cuyos países casan
    y en cuyo teatro de operaciones cae la batalla."""
    mejor = None
    for c in conflictos:
        if not (c["inicio"] <= batalla["anio"] <= c["fin"]):
            continue
        cp = " · ".join(c.get("paises", []))
        ncp = norm(cp)
        if not any(re.search(r"(^|[^a-z0-9])" + re.escape(k) + r"($|[^a-z0-9])", ncp) for k in claves):
            continue
        if not encaja_geo(batalla, c):
            continue
        if mejor is None or (c["fin"] - c["inicio"]) < (mejor["fin"] - mejor["inicio"]):
            mejor = c
    return mejor


def ya_existe(batalla, conflicto):
    nb = norm(batalla["nombre"])
    for b in conflicto.get("batallas", []):
        if norm(b.get("nombre", "")) == nb:
            return True
        if b.get("anio") == batalla["anio"] and abs(b.get("lat", 99) - batalla["lat"]) < 0.3 \
                and abs(b.get("lng", 999) - batalla["lng"]) < 0.3:
            return True
    return False


def main():
    demo = "--demo" in sys.argv
    historia = cargar_historia()
    conflictos = historia.get("conflictos", [])
    paises = [p for p in historia["paises"]
              if p.get("wikidata") or p.get("wikidata_hist")]
    con = conectar()
    # reanudación: si la ejecución anterior se cortó a medias, saltar lo ya consultado
    hechas = set() if demo else progreso_hechas(con, FID)
    if hechas:
        print(f"↻ Reanudando la ejecución anterior: se saltan {len(hechas)} país(es) ya consultados "
              f"({', '.join(sorted(hechas)[:8])}{'…' if len(hechas) > 8 else ''})", flush=True)
    nuevas = huerfanas = 0
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        qids = [q for q in [p.get("wikidata"), *(p.get("wikidata_hist") or [])] if q]
        print(f"→ ({idx}/{len(paises)}) consultando {p['id']}…", flush=True)
        if demo:
            filas = DEMO.get(p["id"], [])
        else:
            try:
                filas = consultar(qids)
                print(f"  · {p['id']}: {len(filas)} batalla(s) con coordenadas y fecha en Wikidata", flush=True)
            except Exception as e:  # noqa: BLE001
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo ya propuesto queda guardado y la próxima "
                      "ejecución continuará desde este país (o pulsa «Empezar de cero» en el panel).", flush=True)
                aviso_red(f"Wikidata ({p['id']})", e)
        vistos = set()
        for b in filas:
            if b["qid"] in vistos:
                continue
            vistos.add(b["qid"])
            c = conflicto_para(b, p, conflictos, claves_pais(p))
            if not c:
                huerfanas += 1
                continue
            if ya_existe(b, c):
                continue
            payload = {
                "conflicto": c["id"],
                "batalla": {"nombre": b["nombre"], "anio": b["anio"], "lat": b["lat"], "lng": b["lng"]},
                "fuente": {"id": f"wikidata:{b['qid']}", "url": f"https://www.wikidata.org/wiki/{b['qid']}",
                           "licencia": "CC0", "consultado": HOY},
            }
            resumen = f"batalla «{b['nombre']}» ({b['anio']}) → {c['nombre']}"
            if proponer(con, "batalla", p["id"], resumen, payload, f"wikidata:{b['qid']}"):
                nuevas += 1
                print(f"  + {p['id']}: {resumen}", flush=True)
        con.commit()  # las propuestas de este país quedan guardadas al momento
        if not demo:
            progreso_marcar(con, FID, p["id"])
    if not demo and paises:
        progreso_borrar(con, FID)
        print("✔ Pila de países completada: la próxima ejecución empezará desde el principio.")
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s); {huerfanas} batalla(s) sin conflicto donde encajar (amplía los conflictos o revísalas en Wikidata)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
