#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de una breve reseña por país desde Wikipedia en español.

Uso (desde la raíz del repositorio):

    python api/fuentes/wikipedia_resenas.py           # descarga real
    python api/fuentes/wikipedia_resenas.py --demo    # datos de muestra, sin red
    python api/fuentes/wikipedia_resenas.py --todos   # consultar todos los países, no solo los nuevos

Para cada país de historia.json con campo "wiki" (o, en su defecto, "nombre"),
descarga el resumen de Wikipedia (API REST page/summary), lo recorta a ~2 frases
y propone el campo 'resena'. El texto de Wikipedia es CC BY-SA: se guarda corto y
atribuido (fuente + licencia). Revisa con api/revisar.py y aplica con exportar.py.
"""
import json
import sys
import os
import time
import urllib.parse
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import (aviso_red, cargar_historia, conectar, descargar_reintentos, es_error_de_pais,  # noqa: E402
                   proponer, progreso_borrar, progreso_hechas, progreso_marcar, HOY,
                   filtrar_pendientes, detener_si_procede, CODIGO_DETENIDO)

FID = "wikipedia_resenas"
LIMITE = 360  # longitud máxima de la reseña (caracteres)

DEMO = {"espana": {
    "extract": "España es un país soberano del suroeste de Europa. Su territorio "
               "incluye la península ibérica, las islas Baleares y Canarias, y las "
               "ciudades de Ceuta y Melilla.",
    "url": "https://es.wikipedia.org/wiki/España",
}}


def titulo_wiki(p):
    """'es:España' -> 'España'; si no hay 'wiki', usa el nombre. Los nombres dobles
    («Reino Unido / Gran Bretaña») no son un título válido: toma la primera variante."""
    w = p.get("wiki") or ""
    if w.startswith("es:"):
        t = w[3:]
    elif w and ":" not in w:
        t = w
    else:
        t = p.get("nombre") or p.get("id")
    if "/" in t:
        t = t.split("/")[0].strip()
    return t


def resumen(titulo):
    # safe="" codifica también la «/» y otros caracteres: un título con barra daría
    # HTTP 400 si se dejara literal en la ruta.
    url = ("https://es.wikipedia.org/api/rest_v1/page/summary/"
           + urllib.parse.quote(titulo.replace(" ", "_"), safe="") + "?redirect=true")
    datos = json.loads(descargar_reintentos(url, timeout=60))
    return {"extract": datos.get("extract") or "",
            "url": (datos.get("content_urls", {}).get("desktop", {}) or {}).get("page")
                   or f"https://es.wikipedia.org/wiki/{urllib.parse.quote(titulo)}"}


def recortar(texto, limite=LIMITE):
    """Deja como mucho 2 frases y no más de 'limite' caracteres, cortando en el
    último punto para no dejar frases a medias."""
    texto = " ".join(texto.split())
    if not texto:
        return ""
    # primeras 2 frases
    trozos = texto.split(". ")
    corto = ". ".join(trozos[:2]).strip()
    if not corto.endswith(".") and len(trozos) > 2:
        corto += "."
    if len(corto) > limite:
        corto = corto[:limite]
        p = corto.rfind(".")
        corto = (corto[:p + 1] if p > 40 else corto.rstrip() + "…")
    return corto


def main():
    demo = "--demo" in sys.argv
    historia = cargar_historia()
    paises = [p for p in historia["paises"] if p.get("wiki") or p.get("nombre")]
    con = conectar()
    hechas = set() if demo else progreso_hechas(con, FID)
    if hechas:
        print(f"↻ Reanudando: se saltan {len(hechas)} país(es) ya consultados.", flush=True)
    nuevas = 0
    paises = filtrar_pendientes(con, FID, paises, demo)
    for idx, p in enumerate(paises, 1):
        if not demo and p["id"] in hechas:
            continue
        if detener_si_procede(con, FID, idx - 1):
            return CODIGO_DETENIDO
        print(f"→ ({idx}/{len(paises)}) {p['id']}…", flush=True)
        if demo:
            data = DEMO.get(p["id"])
            if not data:
                continue
        else:
            try:
                data = resumen(titulo_wiki(p))
                time.sleep(1)  # pausa cortés
            except Exception as e:  # noqa: BLE001
                if es_error_de_pais(e):
                    # el servidor respondió pero este país no tiene resumen válido
                    # (título malo, sin artículo…): se salta y se sigue.
                    print(f"  ⚠ {p['id']}: Wikipedia responde HTTP {e.code} para «{titulo_wiki(p)}»; se salta.", flush=True)
                    if not demo:
                        progreso_marcar(con, FID, p["id"])
                    con.commit()
                    continue
                con.commit(); con.close()
                print(f"⚠ Interrumpido en '{p['id']}': lo propuesto queda guardado; "
                      "la próxima ejecución continúa desde aquí.", flush=True)
                aviso_red(f"Wikipedia ({p['id']})", e)
        resena = recortar(data.get("extract", ""))
        if not resena:
            if not demo:
                progreso_marcar(con, FID, p["id"])
            continue
        # no reproponer si ya tiene una reseña idéntica
        if (p.get("resena") or "").strip() == resena:
            if not demo:
                progreso_marcar(con, FID, p["id"])
            continue
        payload = {
            "resena": resena,
            "fuente": {"id": f"Wikipedia (es): {titulo_wiki(p)}", "url": data.get("url"),
                       "licencia": "CC BY-SA", "consultado": HOY},
        }
        res = f"reseña ({len(resena)} car.): «{resena[:60]}…»"
        if proponer(con, "resena", p["id"], res, payload, "wikipedia:resena"):
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
