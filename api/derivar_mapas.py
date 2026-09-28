#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera mapas base DERIVADOS para fechas que historical-basemaps no cubre.

    python api/derivar_mapas.py            # (re)genera los mapas de DERIVADOS
    python api/derivar_mapas.py --check    # solo informa (código 1 si habría cambios)

El último mapa del proyecto original es el de 2010, así que para cualquier año
posterior la web mostraba fronteras de 2010: en 2026, Sudán y Sudán del Sur
salían como un solo país. Cada entrada de DERIVADOS parte de un mapa base y le
aplica cambios documentados (hoy, separar un Estado con una geometría de
Natural Earth, de dominio público, recortada al contorno del mapa base para no
dejar huecos ni solapes). Cada feature nueva lleva la propiedad DERIVADO con el
mapa base, la fuente de la geometría y el motivo. Después se añade el año a
web/data/years.json.

Como rellenar_geojson.py, necesita shapely (pip install shapely); la web no.
Los mapas derivados de historical-basemaps siguen bajo GPL-3.0.
"""
import json
import os
import sys

try:
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita shapely: pip install shapely")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(RAIZ, "web", "data", "geojson")
YEARS = os.path.join(RAIZ, "web", "data", "years.json")
GEO_EXTRA = os.path.join(RAIZ, "api", "geo")

# mapa nuevo -> base y cambios, en orden
DERIVADOS = {
    "world_2011.geojson": {
        "anio": 2011,
        "base": "world_2010.geojson",
        "separar": [
            {
                "de": "Sudan",
                "geometria": "sudan-del-sur.ne50m.geojson",
                "fuente": "Natural Earth 1:50m admin-0 (dominio público)",
                "propiedades": {"NAME": "South Sudan", "ABBREVN": "S. Sudan", "SUBJECTO": "South Sudan",
                                "BORDERPRECISION": 3, "PARTOF": "South Sudan"},
                "motivo": "independencia de Sudán del Sur, 9 de julio de 2011 (ONU)",
            },
        ],
    },
}


def _redondear(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], 4), round(obj[1], 4)]
        return [_redondear(x) for x in obj]
    return obj


def _superficie(g):
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    partes = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(partes)


def derivar(nombre, cfg):
    with open(os.path.join(GEOJSON, cfg["base"]), encoding="utf-8") as f:
        gj = json.load(f)
    feats = [dict(ft) for ft in gj["features"]]
    informe = []
    for cambio in cfg.get("separar", []):
        with open(os.path.join(GEO_EXTRA, cambio["geometria"]), encoding="utf-8") as f:
            extra = json.load(f)
        nueva = make_valid(unary_union([shape(ft["geometry"]) for ft in extra["features"]]))
        idx = [i for i, ft in enumerate(feats) if ft["properties"].get("NAME") == cambio["de"]]
        if not idx:
            informe.append(f"  ⚠ {cambio['de']!r} no está en {cfg['base']}")
            continue
        origen = make_valid(unary_union([shape(feats[i]["geometry"]) for i in idx]))
        trozo = _superficie(nueva.intersection(origen))
        resto = _superficie(origen.difference(trozo))
        base_props = feats[idx[0]]["properties"]
        for i in sorted(idx, reverse=True):
            feats.pop(i)
        feats.append({"type": "Feature", "properties": dict(base_props),
                      "geometry": _redondear(mapping(resto))})
        props = dict(cambio["propiedades"])
        props["DERIVADO"] = {"base": cfg["base"], "geometria": cambio["fuente"], "motivo": cambio["motivo"]}
        feats.append({"type": "Feature", "properties": props, "geometry": _redondear(mapping(trozo))})
        informe.append(f"  + {props['NAME']} separado de {cambio['de']} ({cambio['motivo']})")
    salida = {**gj, "name": nombre[:-8], "features": feats}
    return json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + "\n", informe


def main():
    solo_ver = "--check" in sys.argv
    pendientes = 0
    with open(YEARS, encoding="utf-8") as f:
        anios = json.load(f)
    for nombre, cfg in DERIVADOS.items():
        texto, informe = derivar(nombre, cfg)
        ruta = os.path.join(GEOJSON, nombre)
        actual = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else None
        print(nombre)
        print("\n".join(informe))
        if actual != texto:
            pendientes += 1
            if not solo_ver:
                with open(ruta, "w", encoding="utf-8", newline="\n") as f:
                    f.write(texto)
        if cfg["anio"] not in anios:
            pendientes += 1
            anios.append(cfg["anio"])
    if not solo_ver:
        with open(YEARS, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(sorted(set(anios)), indent=4) + "\n")
    if solo_ver and pendientes:
        print(f"\n{pendientes} cambio(s) pendiente(s): ejecuta python api/derivar_mapas.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
