#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vista previa (PNG) de un año del mapa, con o sin un cambio propuesto encima.

    python api/vista_previa.py 1492 --caja -10,35,5,45 --salida revisiones/1492-antes.png
    python api/vista_previa.py 1492 --caja -10,35,5,45 --propuesta revisiones/granada.geojson \
        --salida revisiones/1492-despues.png
    python api/vista_previa.py -480 --caja 19,35,28,42 --conflicto guerras-medicas --salida x.png

Pinta las fronteras del mapa que la web usa para ese año (el último mapa con
fecha <= año, como hace la barra de tiempo), rotuladas con su NAME. Opciones:

  --caja lon_min,lat_min,lon_max,lat_max   encuadre (por defecto, el mundo)
  --propuesta fichero.geojson              geometrías propuestas, en rojo sobre el mapa
  --conflicto id                           zonas y batallas de datos/conflictos/<id>.json
                                           vigentes ese año (zonas rayadas, batallas en rombo)
  --resaltar NAME[,NAME…]                  entidades del mapa que se destacan

Sirve para comparar el antes y el después de un cambio de fronteras o de una
zona de guerra, y como mockup para decidir si se aplica. Necesita shapely y
matplotlib (pip install shapely matplotlib); la web no los usa.
"""
import argparse
import json
import os
import re
import sys

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from shapely.geometry import shape, box
    from shapely.validation import make_valid
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita shapely y matplotlib: pip install shapely matplotlib")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(RAIZ, "web", "data", "geojson")
YEARS = os.path.join(RAIZ, "web", "data", "years.json")
CONFLICTOS = os.path.join(RAIZ, "datos", "conflictos")
TINTAS = ["#eaa39b", "#f1d06e", "#a9d18e", "#f2b27a", "#bda6d8", "#9cc7e0", "#d8b48a", "#b3d3c1",
          "#df8f86", "#e6bf52", "#93c077", "#e89e5f", "#a78fc9", "#84b5d3", "#c9a072", "#98c2ab"]  # TINTAS_MAPA (web/js/nucleo.js)
COLORES = os.path.join(RAIZ, "web", "data", "colores.json")


def mapa_del_anio(y):
    with open(YEARS, encoding="utf-8") as f:
        anios = sorted(json.load(f))
    elegido = anios[0]
    for a in anios:
        if a <= y:
            elegido = a
    fn = f"world_bc{-elegido}.geojson" if elegido < 0 else f"world_{elegido}.geojson"
    return elegido, os.path.join(GEOJSON, fn)


def color(nombre, anio=None):
    """El color que usa la web: excepción de data/colores.json para ese mapa o, si no, hash."""
    if anio is not None:
        try:
            with open(COLORES, encoding="utf-8") as f:
                exc = json.load(f).get(str(anio), {})
            if nombre in exc:
                return TINTAS[exc[nombre]]
        except (OSError, ValueError):
            pass
    h = 0
    for u in range(0, len((nombre or "?").encode("utf-16-le")), 2):
        h = (h * 31 + int.from_bytes((nombre or "?").encode("utf-16-le")[u:u + 2], "little")) & 0xFFFFFFFF
    return TINTAS[h % len(TINTAS)]


def pintar(ax, g, **k):
    for p in getattr(g, "geoms", [g]):
        if p.geom_type == "Polygon":
            x, y = p.exterior.xy
            ax.fill(x, y, **k)
        elif hasattr(p, "geoms"):
            pintar(ax, p, **k)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("anio", type=int)
    ap.add_argument("--caja")
    ap.add_argument("--propuesta")
    ap.add_argument("--conflicto")
    ap.add_argument("--resaltar", default="")
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()

    mapa_anio, ruta = mapa_del_anio(a.anio)
    caja = [float(v) for v in a.caja.split(",")] if a.caja else [-180, -60, 180, 85]
    marco = box(*caja)
    resaltar = {n.strip() for n in a.resaltar.split(",") if n.strip()}
    fig, ax = plt.subplots(figsize=(12, 12 * (caja[3] - caja[1]) / max(1e-6, caja[2] - caja[0]) * 1.15 + 0.6))
    ax.set_facecolor("#cfe2ef")
    with open(ruta, encoding="utf-8") as f:
        feats = json.load(f)["features"]
    rotulos = []
    for ft in feats:
        if not ft.get("geometry"):
            continue
        g = make_valid(shape(ft["geometry"]))
        if not g.intersects(marco):
            continue
        nombre = ft["properties"].get("NAME")
        if nombre:
            borde = "#b8291c" if nombre in resaltar else "#3a4450"
            pintar(ax, g, fc=color(ft["properties"].get("SUBJECTO") or nombre, mapa_anio), ec=borde,
                   lw=2 if nombre in resaltar else 0.5, alpha=0.85)
            vis = g.intersection(marco)
            if not vis.is_empty and vis.area > (caja[2] - caja[0]) * (caja[3] - caja[1]) * 0.004:
                pt = vis.representative_point()
                rotulos.append((pt.x, pt.y, nombre))
        else:
            pintar(ax, g, fc="white", ec="#9aa6b1", lw=0.4, hatch="///", alpha=0.9)
    if a.conflicto:
        with open(os.path.join(CONFLICTOS, a.conflicto + ".json"), encoding="utf-8") as f:
            c = json.load(f)
        for z in c.get("zonas", []):
            d, h = z.get("desde", c.get("inicio")), z.get("hasta", c.get("fin"))
            if d is not None and h is not None and not (d <= a.anio <= h):
                continue
            poly = [(lng, lat) for lat, lng in z.get("poligono", [])]
            if len(poly) >= 3:
                xs, ys = zip(*(poly + poly[:1]))
                ax.fill(xs, ys, fc="none", ec="#b8291c", hatch="\\\\", lw=1.4, ls="--")
        for b in c.get("batallas", []):
            if abs(b.get("anio", 10**6) - a.anio) <= 1:
                ax.plot(b["lng"], b["lat"], marker="D", color="#b8291c", ms=7, mec="white")
                ax.annotate(b["nombre"], (b["lng"], b["lat"]), xytext=(5, 5), textcoords="offset points",
                            fontsize=7, color="#7a1010")
    if a.propuesta:
        with open(a.propuesta, encoding="utf-8") as f:
            prop = json.load(f)
        for ft in prop.get("features", []):
            g = make_valid(shape(ft["geometry"]))
            pintar(ax, g, fc="#b8291c", ec="#7a1010", lw=1.5, alpha=0.35)
            n = ft.get("properties", {}).get("NAME")
            if n:
                pt = g.representative_point()
                rotulos.append((pt.x, pt.y, "▶ " + n))
    for x, y, t in rotulos:
        ax.text(x, y, t, fontsize=7, ha="center", va="center", weight="bold", color="#14202b")
    ax.set_xlim(caja[0], caja[2])
    ax.set_ylim(caja[1], caja[3])
    ax.set_aspect(1.15)
    ax.set_xticks([])
    ax.set_yticks([])
    titulo = f"Año {a.anio} · fronteras del mapa de {mapa_anio}"
    if a.propuesta:
        titulo += " · en rojo, el cambio propuesto"
    ax.set_title(titulo, fontsize=10)
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    plt.tight_layout()
    plt.savefig(a.salida, dpi=110)
    print(f"✔ {a.salida} ({os.path.basename(ruta)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
