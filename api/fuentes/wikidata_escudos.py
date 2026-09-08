#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de escudos por época desde Wikidata (propiedad P94).

Uso (desde la raíz del repositorio):

    python api/fuentes/wikidata_escudos.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_escudos.py --demo    # datos de muestra, sin red

Para cada país con "wikidata" (QID):
 - consulta P94 (escudo de armas) con sus cualificadores de fecha (P580/P582)
   -> escudos con vigencia; el valor sin fecha se guarda como respaldo (al final).
 - además, por cada entrada de 'nombres_periodo' que tenga su propio "wikidata"
   (Qid de la entidad histórica: Corona de Castilla, Zaire, etc.), consulta el
   P94 de esa entidad y lo añade con las fechas del periodo.

Propone el campo 'escudos' [{archivo, desde, hasta}]. El mapa elige el vigente en
el año consultado (y cae al escudo actual en vivo si la ficha no tiene 'escudos').
Fuente: Wikidata (CC0). Revisa con api/revisar.py y aplica con exportar.py.
"""
import json
import sys
import os
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, es_error_de_pais,  # noqa: E402
                   proponer, progreso_borrar, progreso_hechas, progreso_marcar, HOY)

FID = "wikidata_escudos"
ENDPOINT = "https://query.wikidata.org/sparql"

# P94 con fechas (para la entidad principal del país)
SPARQL_FECHAS = """
SELECT ?img ?ini ?fin WHERE {
  wd:%s p:P94 ?st .
  ?st ps:P94 ?img .
  OPTIONAL { ?st pq:P580 ?ini }
  OPTIONAL { ?st pq:P582 ?fin }
}
"""
# P94 «a secas» de una entidad (para las entidades históricas de nombres_periodo)
SPARQL_SIMPLE = "SELECT ?img WHERE { wd:%s wdt:P94 ?img } LIMIT 1"

DEMO = {"espana": [
    {"archivo": "Escudo de España (mazonado).svg", "desde": 1981, "hasta": None},
    {"archivo": "Escudo de España 1945-1977.svg", "desde": 1939, "hasta": 1977},
]}


def anio(fecha):
    if not fecha:
        return None
    neg = fecha.startswith("-")
    cuerpo = fecha[1:] if neg else fecha
    try:
        return (-1 if neg else 1) * int(cuerpo.split("-")[0])
    except ValueError:
        return None


def archivo_de(img_url):
    """'http://commons.wikimedia.org/wiki/Special:FilePath/Escudo%20X.svg' -> 'Escudo X.svg'."""
    if not img_url:
        return None
    if "FilePath/" in img_url:
        img_url = img_url.split("FilePath/", 1)[1]
    elif "/" in img_url:
        img_url = img_url.rsplit("/", 1)[1]
    return urllib.parse.unquote(img_url)


def consultar(query):
    url = ENDPOINT + "?format=json&query=" + urllib.parse.quote(query)
    return json.loads(descargar_reintentos(url, timeout=180))["results"]["bindings"]


def escudos_de(p):
    """Devuelve la lista de escudos {archivo, desde, hasta} para el país p."""
    escudos = []
    respaldo = None
    for b in consultar(SPARQL_FECHAS % p["wikidata"]):
        archivo = archivo_de(b.get("img", {}).get("value"))
        if not archivo:
            continue
        ini = anio(b.get("ini", {}).get("value"))
        fin = anio(b.get("fin", {}).get("value"))
        if ini is None and fin is None:
            respaldo = {"archivo": archivo}  # sin fecha: respaldo, va al final
        else:
            e = {"archivo": archivo}
            if ini is not None:
                e["desde"] = ini
            if fin is not None:
                e["hasta"] = fin
            escudos.append(e)
    # escudos de las entidades históricas enlazadas en nombres_periodo
    for per in p.get("nombres_periodo", []) or []:
        qid = per.get("wikidata")
        if not qid:
            continue
        try:
            filas = consultar(SPARQL_SIMPLE % qid)
        except Exception:
            continue
        if filas:
            archivo = archivo_de(filas[0].get("img", {}).get("value"))
            if archivo:
                e = {"archivo": archivo}
                if per.get("desde") is not None:
                    e["desde"] = per["desde"]
                if per.get("hasta") is not None:
                    e["hasta"] = per["hasta"]
                escudos.append(e)
        time.sleep(1)
    # los datados primero (por 'desde'); el respaldo sin fecha, al final
    escudos.sort(key=lambda e: e.get("desde", 9999))
    if respaldo:
        escudos.append(respaldo)
    # dedup por (archivo, desde)
    visto, out = set(), []
    for e in escudos:
        k = (e["archivo"], e.get("desde"))
        if k in visto:
            continue
        visto.add(k)
        out.append(e)
    return out


def main():
    demo = "--demo" in sys.argv
    historia = cargar_historia()
    paises = [p for p in historia["paises"] if p.get("wikidata")]
    con = conectar()
    hechas = set() if demo else progreso_hechas(con, FID)
    if hechas:
        print(f"↻ Reanudando: se saltan {len(hechas)} país(es).", flush=True)
    nuevas = 0
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        print(f"→ ({idx}/{len(paises)}) {p['id']}…", flush=True)
        if demo:
            escudos = DEMO.get(p["id"], [])
        else:
            try:
                escudos = escudos_de(p)
                time.sleep(1)
            except Exception as e:  # noqa: BLE001
                if es_error_de_pais(e):
                    print(f"  ⚠ {p['id']}: Wikidata responde HTTP {e.code}; se salta.", flush=True)
                    progreso_marcar(con, FID, p["id"]); con.commit(); continue
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo propuesto queda guardado.", flush=True)
                aviso_red(f"Wikidata ({p['id']})", e)
        if not escudos:
            if not demo:
                progreso_marcar(con, FID, p["id"])
            continue
        payload = {
            "escudos": escudos,
            "fuente": {"id": f"wikidata:P94:{p['wikidata']}",
                       "url": f"https://www.wikidata.org/wiki/{p['wikidata']}",
                       "licencia": "CC0", "consultado": HOY},
        }
        con_fecha = sum(1 for e in escudos if "desde" in e or "hasta" in e)
        res = f"escudos ({len(escudos)}: {con_fecha} con vigencia)"
        if proponer(con, "escudos", p["id"], res, payload, f"wikidata:P94:{p['wikidata']}"):
            nuevas += 1
            print(f"  + {p['id']}: {res}", flush=True)
        con.commit()
        if not demo:
            progreso_marcar(con, FID, p["id"])
    if not demo and paises:
        progreso_borrar(con, FID)
        print("✔ Pila completada.")
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s) — revisa con: python api/revisar.py list")
    return 0


if __name__ == "__main__":
    sys.exit(main())
