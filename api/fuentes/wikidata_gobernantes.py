#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de gobernantes (jefes de Estado) desde Wikidata.

Uso (desde la raíz del repositorio):

    python api/fuentes/wikidata_gobernantes.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_gobernantes.py --demo    # datos de muestra, sin red

Para cada país de historia.json con campo "wikidata" (QID), consulta los
valores históricos de la propiedad P35 (jefe de Estado) con sus fechas y
propone los reinados que aún no existan en el país. Fuente: Wikidata (CC0).
"""
import json
import sys
import urllib.parse

import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import time
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, proponer,  # noqa: E402
                   progreso_borrar, progreso_hechas, progreso_marcar, HOY)

FID = "wikidata_gobernantes"
ENDPOINT = "https://query.wikidata.org/sparql"

SPARQL = """
SELECT ?persona ?personaLabel ?ini ?fin WHERE {
  wd:%s p:P35 ?st .
  ?st ps:P35 ?persona .
  OPTIONAL { ?st pq:P580 ?ini }
  OPTIONAL { ?st pq:P582 ?fin }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY ?ini
"""

DEMO = {"espana": [
    {"persona": "http://www.wikidata.org/entity/Q19943", "nombre": "Isabel II de España", "ini": "1833", "fin": "1868"},
    {"persona": "http://www.wikidata.org/entity/Q57553", "nombre": "Felipe VI de España", "ini": "2014", "fin": None},
]}


def anio(fecha):
    """'1833-09-29T00:00:00Z' -> 1833; también admite años negativos ('-0479-…')."""
    if not fecha:
        return None
    neg = fecha.startswith("-")
    cuerpo = fecha[1:] if neg else fecha
    try:
        a = int(cuerpo.split("-")[0])
    except ValueError:
        return None
    return -a if neg else a


def consultar(qid):
    url = ENDPOINT + "?format=json&query=" + urllib.parse.quote(SPARQL % qid)
    datos = json.loads(descargar_reintentos(url, timeout=180))
    filas = []
    for b in datos["results"]["bindings"]:
        filas.append({
            "persona": b["persona"]["value"],
            "nombre": b["personaLabel"]["value"],
            "ini": anio(b.get("ini", {}).get("value")),
            "fin": anio(b.get("fin", {}).get("value")),
        })
    return filas


def main():
    demo = "--demo" in sys.argv
    historia = cargar_historia()
    paises = [p for p in historia["paises"] if p.get("wikidata")]
    con = conectar()
    # reanudación: si la ejecución anterior se cortó a medias, saltar lo ya consultado
    hechas = set() if demo else progreso_hechas(con, FID)
    if hechas:
        print(f"↻ Reanudando la ejecución anterior: se saltan {len(hechas)} país(es) ya consultados "
              f"({', '.join(sorted(hechas)[:8])}{'…' if len(hechas) > 8 else ''})", flush=True)
    nuevas = 0
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        print(f"→ ({idx}/{len(paises)}) consultando {p['id']}…", flush=True)
        if demo:
            filas = DEMO.get(p["id"], [])
        else:
            try:
                filas = consultar(p["wikidata"])
                time.sleep(2)  # pausa cortés entre países
            except Exception as e:  # noqa: BLE001
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo ya propuesto queda guardado y la próxima "
                      "ejecución continuará desde este país (o pulsa «Empezar de cero» en el panel).", flush=True)
                aviso_red(f"Wikidata ({p['id']})", e)
        existentes = {(g.get("nombre", ""), g.get("desde")) for g in p.get("gobernantes", [])}
        for f in filas:
            if demo:
                f = {"persona": f["persona"], "nombre": f["nombre"],
                     "ini": int(f["ini"]) if f["ini"] else None,
                     "fin": int(f["fin"]) if f["fin"] else None}
            if f["ini"] is None:
                continue
            desde, hasta = f["ini"], f["fin"] if f["fin"] is not None else f["ini"]
            # ¿ya existe uno que se solape con el mismo nombre aproximado?
            apellido = f["nombre"].split(" de ")[0].strip().lower()
            if any(apellido in n.lower() and d and abs(d - desde) <= 2 for n, d in existentes):
                continue
            qid_p = f["persona"].rsplit("/", 1)[-1]
            payload = {
                "gobernante": {"desde": desde, "hasta": hasta, "nombre": f["nombre"]},
                "fuente": {"id": f"wikidata:{qid_p}", "url": f["persona"],
                           "licencia": "CC0", "consultado": HOY},
            }
            resumen = f"gobernante {f['nombre']} ({desde}–{hasta})"
            if proponer(con, "gobernante", p["id"], resumen, payload, f"wikidata:{qid_p}"):
                nuevas += 1
                print(f"  + {p['id']}: {resumen}", flush=True)
        con.commit()  # las propuestas de este país quedan guardadas al momento
        if not demo:
            progreso_marcar(con, FID, p["id"])
    if not demo and paises:
        progreso_borrar(con, FID)
        print("✔ Pila de países completada: la próxima ejecución empezará desde el principio.")
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s) — revisa con: python api/revisar.py list")
    return 0


if __name__ == "__main__":
    sys.exit(main())
