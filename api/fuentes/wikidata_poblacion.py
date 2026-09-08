#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de población histórica desde Wikidata (propiedad P1082).

Uso (desde la raíz del repositorio):

    python api/fuentes/wikidata_poblacion.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_poblacion.py --demo    # datos de muestra, sin red

Para cada país de historia.json con campo "wikidata" (QID), consulta los valores
de población (P1082) con su fecha (P585), los reduce a una muestra legible y
propone reemplazar la serie poblacion[] del país. Alternativa/complemento a OWID
(útil para territorios sin entrada 'owid'). Fuente: Wikidata (CC0).

Revisa con api/revisar.py y aplica con api/exportar.py.
"""
import json
import sys
import os
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, es_error_de_pais,  # noqa: E402
                   proponer, progreso_borrar, progreso_hechas, progreso_marcar, HOY)

FID = "wikidata_poblacion"
ENDPOINT = "https://query.wikidata.org/sparql"

SPARQL = """
SELECT ?pop ?fecha WHERE {
  wd:%s p:P1082 ?st .
  ?st ps:P1082 ?pop .
  OPTIONAL { ?st pq:P585 ?fecha }
}
ORDER BY ?fecha
"""

DEMO = {"espana": [
    {"pop": "6800000", "fecha": "1500-01-01T00:00:00Z"},
    {"pop": "18566000", "fecha": "1900-01-01T00:00:00Z"},
    {"pop": "47000000", "fecha": "2020-01-01T00:00:00Z"},
]}


def anio(fecha):
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
        try:
            valor = int(float(b["pop"]["value"]))
        except (KeyError, TypeError, ValueError):
            continue
        a = anio(b.get("fecha", {}).get("value"))
        if a is None:
            continue
        filas.append((a, valor))
    return filas


def muestrear(serie):
    """Reduce a puntos legibles: cada 100 años hasta 1700, cada 50 hasta 1900,
    cada 10 después, más el último disponible. 'serie' es dict {anio: valor}."""
    out = []
    for a, v in sorted(serie.items()):
        paso = 100 if a < 1700 else 50 if a < 1900 else 10
        if a % paso == 0:
            out.append({"anio": a, "valor": v})
    ultimo = max(serie)
    if not out or out[-1]["anio"] != ultimo:
        out.append({"anio": ultimo, "valor": serie[ultimo]})
    return out


def main():
    demo = "--demo" in sys.argv
    historia = cargar_historia()
    paises = [p for p in historia["paises"] if p.get("wikidata")]
    con = conectar()
    hechas = set() if demo else progreso_hechas(con, FID)
    if hechas:
        print(f"↻ Reanudando: se saltan {len(hechas)} país(es) ya consultados "
              f"({', '.join(sorted(hechas)[:8])}{'…' if len(hechas) > 8 else ''})", flush=True)
    nuevas = 0
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        print(f"→ ({idx}/{len(paises)}) consultando {p['id']}…", flush=True)
        if demo:
            crudo = [(anio(d["fecha"]), int(d["pop"])) for d in DEMO.get(p["id"], [])]
        else:
            try:
                crudo = consultar(p["wikidata"])
                time.sleep(2)  # pausa cortés
            except Exception as e:  # noqa: BLE001
                if es_error_de_pais(e):
                    print(f"  ⚠ {p['id']}: Wikidata responde HTTP {e.code}; se salta.", flush=True)
                    progreso_marcar(con, FID, p["id"]); con.commit(); continue
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo propuesto queda guardado y la próxima "
                      "ejecución continuará desde aquí (o pulsa «Empezar de cero»).", flush=True)
                aviso_red(f"Wikidata ({p['id']})", e)
        # quedarse con el último valor por año (Wikidata a veces repite años)
        serie = {}
        for a, v in crudo:
            serie[a] = v
        if not serie:
            if not demo:
                progreso_marcar(con, FID, p["id"])
            continue
        muestra = muestrear(serie)
        for m in muestra:
            m["fuente"] = "Wikidata (P1082)"
        payload = {
            "poblacion": muestra,
            "fuente": {"id": f"wikidata:P1082:{p['wikidata']}",
                       "url": f"https://www.wikidata.org/wiki/{p['wikidata']}",
                       "licencia": "CC0", "consultado": HOY},
        }
        resumen = f"población (Wikidata, {len(muestra)} puntos: {muestra[0]['anio']}–{muestra[-1]['anio']})"
        if proponer(con, "poblacion", p["id"], resumen, payload, f"wikidata:P1082:{p['wikidata']}"):
            nuevas += 1
            print(f"  + {p['id']}: {resumen}", flush=True)
        con.commit()
        if not demo:
            progreso_marcar(con, FID, p["id"])
    if not demo and paises:
        progreso_borrar(con, FID)
        print("✔ Pila completada: la próxima ejecución empezará desde el principio.")
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s) — revisa con: python api/revisar.py list")
    return 0


if __name__ == "__main__":
    sys.exit(main())
