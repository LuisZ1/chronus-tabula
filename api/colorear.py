#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparte los colores del mapa para que dos territorios vecinos no se pinten igual.

    python api/colorear.py            # (re)genera web/data/colores.json
    python api/colorear.py --check    # solo informa (código 1 si habría cambios)
    python api/colorear.py --informe  # lista los choques que había con el color por hash

La web pinta cada entidad (SUBJECTO o, si no hay, NAME) con una de las 16 tintas de
TINTAS_MAPA (web/js/nucleo.js): 8 colores en dos tonos, elegidos por un hash del
nombre. Así una entidad conserva su color en todos los años, pero dos vecinas pueden
caer en el mismo color. Este script recorre los mapas de web/data/years.json en orden
cronológico, busca las entidades que se tocan (o quedan a menos de VECINDAD grados,
p. ej. a ambos lados de un río generalizado) y, si comparten color —mismo tono de los
8, aunque sea en la variante clara u oscura—, cambia el de la más pequeña.

Prioridades para cada entidad, de mayor a menor superficie:
  1. el color que ya tenía en el mapa anterior (si se lo cambiamos entonces);
  2. su color por hash;
  3. el primer color libre, probando antes el otro tono del mismo color.

Solo se guardan las excepciones (entidades cuyo color difiere del hash), por año de
mapa: {"<año>": {"<clave>": índice_en_TINTAS_MAPA}}. La web lo lee al arrancar
(js/arranque.js) y colorFor() lo consulta para el año que se muestra.

Necesita shapely (pip install shapely); la web no. Se ejecuta al final de la
canalización de mapas, después de derivar_mapas.py.
"""
import json
import os
import sys

try:
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely.strtree import STRtree
    from shapely.validation import make_valid
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita shapely: pip install shapely")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(RAIZ, "web", "data", "geojson")
YEARS = os.path.join(RAIZ, "web", "data", "years.json")
SALIDA = os.path.join(RAIZ, "web", "data", "colores.json")
N_TINTAS = 16  # longitud de TINTAS_MAPA en web/js/nucleo.js
N_TONOS = 8  # índice i e i+8 son el mismo color en dos tonos
VECINDAD = 0.08  # grados (~8 km): vecinas aunque haya una franja mínima entre ellas
SIMPLIFICAR = 0.02


def hash_color(nombre):
    """El mismo hash que colorFor() en web/js/nucleo.js (unidades UTF-16, >>> 0)."""
    h = 0
    datos = nombre.encode("utf-16-le")
    for i in range(0, len(datos), 2):
        h = (h * 31 + int.from_bytes(datos[i:i + 2], "little")) & 0xFFFFFFFF
    return h % N_TINTAS


def fichero(y):
    return f"world_bc{-y}.geojson" if y < 0 else f"world_{y}.geojson"


def entidades(y):
    """clave -> geometría unida (la clave es la que usa la web: SUBJECTO o NAME)."""
    with open(os.path.join(GEOJSON, fichero(y)), encoding="utf-8") as f:
        feats = json.load(f)["features"]
    grupos = {}
    for ft in feats:
        p = ft.get("properties") or {}
        if not p.get("NAME") or not ft.get("geometry"):
            continue  # sin datos: se pinta rayado, sin color
        clave = p.get("SUBJECTO") or p["NAME"]
        g = make_valid(shape(ft["geometry"])).simplify(SIMPLIFICAR)
        grupos.setdefault(clave, []).append(g)
    return {k: unary_union(v) for k, v in grupos.items()}


def vecinos(geoms):
    claves = list(geoms)
    lista = [geoms[k].buffer(VECINDAD / 2) for k in claves]
    arbol = STRtree(lista)
    ady = {k: set() for k in claves}
    for i, g in enumerate(lista):
        for j in arbol.query(g):
            j = int(j)
            if j > i and g.intersects(lista[j]):
                ady[claves[i]].add(claves[j])
                ady[claves[j]].add(claves[i])
    return ady


def tono(i):
    return i % N_TONOS


def colorear_mapa(geoms, previo):
    ady = vecinos(geoms)
    orden = sorted(geoms, key=lambda k: -geoms[k].area)
    color = {}
    for k in orden:
        usados = {tono(color[v]) for v in ady[k] if v in color}
        h = hash_color(k)
        preferidos = []
        if k in previo:
            preferidos.append(previo[k])
        preferidos += [h, (h + N_TONOS) % N_TINTAS]
        preferidos += [i for i in range(N_TINTAS) if i not in preferidos]
        elegido = next((i for i in preferidos if tono(i) not in usados), None)
        if elegido is None:  # sin tono libre: al menos que no repita el color exacto
            exactos = {color[v] for v in ady[k] if v in color}
            elegido = next((i for i in preferidos if i not in exactos), h)
        color[k] = elegido
    choques_hash = sum(1 for k in geoms for v in ady[k] if k < v and tono(hash_color(k)) == tono(hash_color(v)))
    restos = [(k, v) for k in geoms for v in ady[k] if k < v and tono(color[k]) == tono(color[v])]
    return color, choques_hash, restos


def main():
    solo_ver = "--check" in sys.argv
    informe = "--informe" in sys.argv
    with open(YEARS, encoding="utf-8") as f:
        anios = sorted(json.load(f))
    salida = {}
    previo = {}
    total_hash = total_restos = 0
    for y in anios:
        if not os.path.exists(os.path.join(GEOJSON, fichero(y))):
            continue
        geoms = entidades(y)
        color, choques, restos = colorear_mapa(geoms, previo)
        total_hash += choques
        total_restos += len(restos)
        excepciones = {k: c for k, c in sorted(color.items()) if c != hash_color(k)}
        if excepciones:
            salida[str(y)] = excepciones
        # solo se arrastra lo que se tuvo que cambiar: si la entidad vuelve a estar
        # libre, recupera su color de siempre
        previo = excepciones
        if informe:
            print(f"{y}: {len(geoms)} entidades, {choques} choques con el color por hash, "
                  f"{len(excepciones)} recoloreadas, {len(restos)} sin resolver")
            for a, b in restos:
                print(f"   ⚠ {a} / {b}")
    texto = json.dumps(salida, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    actual = open(SALIDA, encoding="utf-8").read() if os.path.exists(SALIDA) else None
    print(f"{len(anios)} mapas · {total_hash} pares de vecinas con el mismo color por hash · "
          f"{sum(len(v) for v in salida.values())} recoloreos · {total_restos} pares sin resolver")
    if actual == texto:
        print("✔ web/data/colores.json al día")
        return 0
    if solo_ver:
        print("colores.json no está al día: ejecuta python api/colorear.py")
        return 1
    with open(SALIDA, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    print(f"✔ web/data/colores.json escrito ({len(texto) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
