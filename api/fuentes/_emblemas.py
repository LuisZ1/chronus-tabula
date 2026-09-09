#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Núcleo compartido de los conectores de emblemas por época desde Wikidata:
escudos (P94, campo 'escudos') y banderas (P41, campo 'banderas'). Cada conector
es un envoltorio fino que llama a ejecutar() con su propiedad y su campo.

Para cada país con "wikidata" (QID):
 - consulta la propiedad con sus cualificadores de fecha (P580/P582) → emblemas
   con vigencia; el valor sin fecha se guarda como respaldo (al final).
 - además, por cada entrada de 'nombres_periodo' con su propio "wikidata" (Qid de
   la entidad histórica: Corona de Castilla, Zaire…), consulta la misma propiedad
   de esa entidad y la añade con las fechas del periodo.

Propone el campo [{archivo, desde, hasta}]. El mapa elige el vigente en el año
consultado (y cae al emblema actual en vivo si la ficha no tiene el campo).
Fuente: Wikidata (CC0). Revisa con api/revisar.py y aplica con exportar.py.
"""
import json
import sys
import os
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, es_error_de_pais,  # noqa: E402
                   proponer, progreso_borrar, progreso_hechas, progreso_marcar, HOY,
                   filtrar_pendientes, detener_si_procede, CODIGO_DETENIDO)

ENDPOINT = "https://query.wikidata.org/sparql"

# propiedad con fechas (para la entidad principal del país)
SPARQL_FECHAS = """
SELECT ?img ?ini ?fin WHERE {
  wd:%(qid)s p:%(prop)s ?st .
  ?st ps:%(prop)s ?img .
  OPTIONAL { ?st pq:P580 ?ini }
  OPTIONAL { ?st pq:P582 ?fin }
}
"""
# propiedad «a secas» de una entidad (para las entidades históricas de nombres_periodo)
SPARQL_SIMPLE = "SELECT ?img WHERE { wd:%(qid)s wdt:%(prop)s ?img } LIMIT 1"


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


def emblemas_de(p, prop):
    """Lista de emblemas {archivo, desde, hasta} del país p para la propiedad prop."""
    emblemas = []
    respaldo = None
    for b in consultar(SPARQL_FECHAS % {"qid": p["wikidata"], "prop": prop}):
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
            emblemas.append(e)
    # emblemas de las entidades históricas enlazadas en nombres_periodo
    for per in p.get("nombres_periodo", []) or []:
        qid = per.get("wikidata")
        if not qid:
            continue
        try:
            filas = consultar(SPARQL_SIMPLE % {"qid": qid, "prop": prop})
        except Exception:  # noqa: BLE001 — una entidad histórica sin dato no para el país
            continue
        if filas:
            archivo = archivo_de(filas[0].get("img", {}).get("value"))
            if archivo:
                e = {"archivo": archivo}
                if per.get("desde") is not None:
                    e["desde"] = per["desde"]
                if per.get("hasta") is not None:
                    e["hasta"] = per["hasta"]
                emblemas.append(e)
        time.sleep(1)
    # los datados primero (por 'desde'); el respaldo sin fecha, al final
    emblemas.sort(key=lambda e: e.get("desde", 9999))
    if respaldo:
        emblemas.append(respaldo)
    # dedup por (archivo, desde)
    visto, out = set(), []
    for e in emblemas:
        k = (e["archivo"], e.get("desde"))
        if k in visto:
            continue
        visto.add(k)
        out.append(e)
    return out


def ejecutar(fid, prop, campo, demo_datos, argv=None):
    """Bucle estándar de un conector por países (reanudable, detenible, solo-nuevos)."""
    argv = sys.argv if argv is None else argv
    demo = "--demo" in argv
    historia = cargar_historia()
    paises = [p for p in historia["paises"] if p.get("wikidata")]
    con = conectar()
    hechas = set() if demo else progreso_hechas(con, fid)
    if hechas:
        print(f"↻ Reanudando: se saltan {len(hechas)} país(es).", flush=True)
    nuevas = 0
    paises = filtrar_pendientes(con, fid, paises, demo)
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        if detener_si_procede(con, fid, idx - 1):
            return CODIGO_DETENIDO
        print(f"→ ({idx}/{len(paises)}) {p['id']}…", flush=True)
        if demo:
            emblemas = demo_datos.get(p["id"], [])
        else:
            try:
                emblemas = emblemas_de(p, prop)
                time.sleep(1)
            except Exception as e:  # noqa: BLE001
                if es_error_de_pais(e):
                    print(f"  ⚠ {p['id']}: Wikidata responde HTTP {e.code}; se salta.", flush=True)
                    progreso_marcar(con, fid, p["id"]); con.commit(); continue
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo propuesto queda guardado.", flush=True)
                aviso_red(f"Wikidata ({p['id']})", e)
        if not emblemas:
            if not demo:
                progreso_marcar(con, fid, p["id"])
            continue
        payload = {
            campo: emblemas,
            "fuente": {"id": f"wikidata:{prop}:{p['wikidata']}",
                       "url": f"https://www.wikidata.org/wiki/{p['wikidata']}",
                       "licencia": "CC0", "consultado": HOY},
        }
        con_fecha = sum(1 for e in emblemas if "desde" in e or "hasta" in e)
        res = f"{campo} ({len(emblemas)}: {con_fecha} con vigencia)"
        if proponer(con, campo, p["id"], res, payload, f"wikidata:{prop}:{p['wikidata']}"):
            nuevas += 1
            print(f"  + {p['id']}: {res}", flush=True)
        con.commit()
        if not demo:
            progreso_marcar(con, fid, p["id"])
    if not demo and paises:
        progreso_borrar(con, fid)
        print("✔ Pila completada.")
    con.close()
    print(f"✔ {nuevas} propuesta(s) nueva(s) — revisa con: python api/revisar.py list")
    return 0
