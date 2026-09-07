#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validador de data/historia.json para Chronus Tabula.

Ejecútalo desde la raíz del repositorio antes de abrir un merge request:

    python api/validar.py

Comprueba estructura, campos obligatorios, coherencia de años, coordenadas
y que los nombres de países existan en los mapas GeoJSON. Termina con
código 0 si todo es válido y 1 si hay errores.
"""
import json
import os
import re
import sys

for _flujo in (sys.stdout, sys.stderr):
    if _flujo and hasattr(_flujo, "reconfigure"):
        try:
            _flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORIA = os.path.join(RAIZ, "web", "data", "historia.json")
GEOJSON_DIR = os.path.join(RAIZ, "web", "data", "geojson")

errores = []
avisos = []


def err(donde, msg):
    errores.append(f"  ✘ [{donde}] {msg}")


def aviso(donde, msg):
    avisos.append(f"  ⚠ [{donde}] {msg}")


def es_anio(v):
    return isinstance(v, int) and -123000 <= v <= 2100


def valida_coord(donde, lat, lng):
    if not isinstance(lat, (int, float)) or not -90 <= lat <= 90:
        err(donde, f"lat fuera de rango: {lat!r}")
    if not isinstance(lng, (int, float)) or not -180 <= lng <= 180:
        err(donde, f"lng fuera de rango: {lng!r}")


def valida_fuentes(donde, reg, obligatorio=True):
    fs = reg.get("fuentes")
    if not fs:
        if obligatorio:
            aviso(donde, "sin 'fuentes'; toda contribución nueva debe citar su fuente (ver CONTRIBUTING)")
        return
    if not isinstance(fs, list):
        err(donde, "'fuentes' debe ser una lista de {id, url?, licencia?, consultado?}")
        return
    for f in fs:
        if not isinstance(f, dict) or not f.get("id"):
            err(donde, f"fuente inválida (falta 'id'): {f!r}")


def valida_poligono(donde, poly):
    if not isinstance(poly, list) or len(poly) < 3:
        err(donde, "poligono debe ser una lista de al menos 3 vértices [lat, lng]")
        return
    for i, pt in enumerate(poly):
        if not (isinstance(pt, list) and len(pt) == 2):
            err(donde, f"vértice {i} no es [lat, lng]: {pt!r}")
            return
        valida_coord(f"{donde} vértice {i}", pt[0], pt[1])
    # heurística lat/lng invertidos: latitudes imposibles
    if all(abs(pt[0]) <= 90 for pt in poly) and any(abs(pt[0]) > 85 for pt in poly):
        aviso(donde, "hay latitudes > 85°; comprueba que no hayas invertido [lat, lng]")


def main():
    # 1) JSON bien formado
    try:
        with open(HISTORIA, encoding="utf-8") as f:
            d = json.load(f)
    except FileNotFoundError:
        print(f"✘ No encuentro {HISTORIA}. Ejecuta el script desde la raíz del repositorio.")
        return 1
    except json.JSONDecodeError as e:
        print(f"✘ historia.json no es JSON válido: línea {e.lineno}, columna {e.colno}: {e.msg}")
        print("  Pista: vigila comas finales y comillas dobles.")
        return 1

    # 2) nombres reales presentes en los GeoJSON (NAME y SUBJECTO)
    nombres_geo = set()
    n_mapas = 0
    if os.path.isdir(GEOJSON_DIR):
        for fn in os.listdir(GEOJSON_DIR):
            if not re.match(r"world_(bc)?\d+\.geojson$", fn):
                continue
            try:
                with open(os.path.join(GEOJSON_DIR, fn), encoding="utf-8") as f:
                    gj = json.load(f)
                n_mapas += 1
                for ft in gj.get("features", []):
                    p = ft.get("properties", {})
                    for k in ("NAME", "SUBJECTO"):
                        if p.get(k):
                            nombres_geo.add(p[k])
            except Exception as e:  # noqa: BLE001 — un mapa corrupto no debe parar la validación
                aviso(fn, f"no se pudo leer: {e}")
    else:
        aviso("geojson", "no encuentro data/geojson; se omite la comprobación de nombres")

    # 3) países
    ids = set()
    for p in d.get("paises", []):
        donde = f"paises/{p.get('id', '¿sin id?')}"
        for campo in ("id", "nombres"):
            if campo not in p:
                err(donde, f"falta el campo obligatorio '{campo}'")
        if p.get("id") in ids:
            err(donde, "id duplicado")
        ids.add(p.get("id"))
        if not isinstance(p.get("nombres"), list) or not p.get("nombres"):
            err(donde, "'nombres' debe ser una lista no vacía")
        elif nombres_geo:
            desconocidos = [n for n in p["nombres"] if n not in nombres_geo]
            if desconocidos and len(desconocidos) == len(p["nombres"]) and n_mapas >= 40:
                err(donde, f"ninguno de sus 'nombres' existe en los GeoJSON: {desconocidos}")
            elif desconocidos and n_mapas >= 40:
                aviso(donde, f"nombres no encontrados en ningún GeoJSON: {desconocidos}")
        for g in p.get("gobernantes", []):
            gd = f"{donde} gobernante '{g.get('nombre', '?')}'"
            if not (es_anio(g.get("desde")) and es_anio(g.get("hasta"))):
                err(gd, "'desde'/'hasta' deben ser años enteros (negativos = a. C.)")
            elif g["desde"] > g["hasta"]:
                err(gd, f"desde ({g['desde']}) > hasta ({g['hasta']})")
            if not g.get("nombre"):
                err(gd, "falta 'nombre'")
        for pob in p.get("poblacion", []):
            if not es_anio(pob.get("anio")) or not isinstance(pob.get("valor"), (int, float)):
                err(donde, f"población inválida: {pob!r}")
        valida_fuentes(donde, p)

    # 4) conflictos
    cids = set()
    for c in d.get("conflictos", []):
        donde = f"conflictos/{c.get('id', c.get('nombre', '¿sin id?'))}"
        for campo in ("id", "nombre", "inicio", "fin"):
            if campo not in c:
                err(donde, f"falta el campo obligatorio '{campo}'")
        if c.get("id") in cids:
            err(donde, "id duplicado")
        cids.add(c.get("id"))
        if es_anio(c.get("inicio")) and es_anio(c.get("fin")):
            if c["inicio"] > c["fin"]:
                err(donde, f"inicio ({c['inicio']}) > fin ({c['fin']})")
        else:
            err(donde, "'inicio'/'fin' deben ser años enteros")
            continue
        for z in c.get("zonas", []):
            zd = f"{donde} zona '{z.get('nombre', '?')}'"
            if z.get("tipo") not in ("frente", "ocupado", None):
                err(zd, f"tipo desconocido: {z.get('tipo')!r} (usa 'frente' u 'ocupado')")
            zi = z.get("desde", c["inicio"])
            zf = z.get("hasta", c["fin"])
            if not (es_anio(zi) and es_anio(zf)) or zi > zf:
                err(zd, f"fase incoherente: desde={zi} hasta={zf}")
            elif zi < c["inicio"] or zf > c["fin"]:
                aviso(zd, f"la fase ({zi}–{zf}) se sale del conflicto ({c['inicio']}–{c['fin']})")
            if z.get("color") and not re.match(r"^#[0-9a-fA-F]{6}$", z["color"]):
                err(zd, f"color inválido: {z['color']!r} (usa formato #rrggbb)")
            valida_poligono(zd, z.get("poligono"))
        for b in c.get("batallas", []):
            bd = f"{donde} batalla '{b.get('nombre', '?')}'"
            if not b.get("nombre"):
                err(bd, "falta 'nombre'")
            if not es_anio(b.get("anio")):
                err(bd, f"año inválido: {b.get('anio')!r}")
            elif not c["inicio"] <= b["anio"] <= c["fin"]:
                err(bd, f"el año {b['anio']} cae fuera del conflicto ({c['inicio']}–{c['fin']})")
            if "hasta" in b and b["hasta"] is not None:
                if not es_anio(b["hasta"]) or b["hasta"] < b.get("anio", -123000):
                    err(bd, f"'hasta' incoherente: {b.get('hasta')!r} (debe ser ≥ anio)")
                elif b["hasta"] > c["fin"]:
                    aviso(bd, f"'hasta' ({b['hasta']}) se sale del conflicto ({c['inicio']}–{c['fin']})")
            valida_coord(bd, b.get("lat"), b.get("lng"))
        valida_fuentes(donde, c)

    # 5) eventos
    for ev in d.get("eventos", []):
        donde = f"eventos/'{ev.get('nombre', '?')}'"
        if not ev.get("nombre"):
            err(donde, "falta 'nombre'")
        if not es_anio(ev.get("anio")):
            err(donde, f"año inválido: {ev.get('anio')!r}")
        if "hasta" in ev and (not es_anio(ev["hasta"]) or ev["hasta"] < ev.get("anio", 0)):
            err(donde, f"'hasta' incoherente: {ev.get('hasta')!r}")
        if ev.get("categoria") not in (None, "invento"):
            aviso(donde, f"categoría desconocida: {ev['categoria']!r} (hoy solo existe 'invento')")
        valida_coord(donde, ev.get("lat"), ev.get("lng"))
        valida_fuentes(donde, ev)

    # 6) territorios menores
    nombres_pais = set()
    for p in d.get("paises", []):
        for parte in str(p.get("nombre", "")).split("/"):
            if parte.strip():
                nombres_pais.add(parte.strip().lower())
        for n in p.get("nombres", []) + p.get("relacionados", []):
            nombres_pais.add(str(n).lower())
    for t in d.get("territorios", []):
        donde = f"territorios/'{t.get('nombre', '?')}'"
        for campo in ("nombre", "pais", "desde"):
            if campo not in t:
                err(donde, f"falta el campo obligatorio '{campo}'")
        if "desde" in t and not es_anio(t["desde"]):
            err(donde, f"'desde' inválido: {t['desde']!r}")
        if "hasta" in t and t["hasta"] is not None:
            if not es_anio(t["hasta"]) or t["hasta"] < t.get("desde", -123000):
                err(donde, f"'hasta' incoherente: {t.get('hasta')!r}")
        valida_coord(donde, t.get("lat"), t.get("lng"))
        b = str(t.get("pais", "")).lower()
        if b and nombres_pais and b not in nombres_pais:
            aviso(donde, f"su 'pais' ({t['pais']!r}) no coincide con ningún país de 'paises'; "
                         "el punto no heredará el color del país en el mapa")
        if "poligono" in t:
            valida_poligono(donde + " poligono", t["poligono"])
        valida_fuentes(donde, t)

    # resultado
    for a in avisos:
        print(a)
    if errores:
        print("\n".join(errores))
        print(f"\n✘ {len(errores)} error(es), {len(avisos)} aviso(s). Corrige antes del merge request.")
        return 1
    n = (len(d.get("paises", [])), len(d.get("conflictos", [])),
         sum(len(c.get("zonas", [])) for c in d.get("conflictos", [])),
         sum(len(c.get("batallas", [])) for c in d.get("conflictos", [])),
         len(d.get("eventos", [])), len(d.get("territorios", [])))
    print(f"✔ historia.json válido — {n[0]} países, {n[1]} conflictos, {n[2]} zonas, {n[3]} batallas, {n[4]} eventos, {n[5]} territorios"
          + (f" ({len(avisos)} aviso(s) no bloqueantes)" if avisos else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
