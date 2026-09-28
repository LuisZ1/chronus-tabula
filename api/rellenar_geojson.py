#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rellena la tierra SIN ATRIBUIR de un mapa base con pueblos de mapas vecinos.

    python api/rellenar_geojson.py            # aplica RELLENOS a web/data/geojson/
    python api/rellenar_geojson.py --check    # solo informa (código 1 si habría cambios)

Algunos mapas de historical-basemaps dejan grandes zonas sin atribuir (features
sin NAME). En el de 500 a. C., un polígono sin nombre de unos 18 millones de km²
va de la península ibérica a Corea; el mapa lo pintaba como un único territorio.
Los mapas de 700 y 400 a. C. sí reparten esas zonas entre celtas, escitas,
germanos, tracios, pastores árabes…

Para cada entrada de RELLENOS se toma el polígono de ese pueblo en el mapa de
origen, se recorta a lo que sigue sin atribuir en el mapa de destino y se añade
como feature nueva con su nombre original y la propiedad RELLENO (mapa de origen
y motivo), así queda trazado de dónde sale. Lo que no cubre ningún relleno sigue
sin nombre y el mapa lo muestra como «sin datos». El orden importa: cada relleno
ocupa solo lo que dejaron libre los anteriores.

Es idempotente (un relleno ya aplicado no se repite) y hay que volver a
ejecutarlo si se actualizan los mapas desde el proyecto original. Es la única
herramienta del repositorio que necesita una dependencia externa (recortar
polígonos): pip install shapely. La web no la necesita.
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
MIN_KM2 = 2000  # trozos menores no se añaden (bordes de recorte)

# destino -> [(mapa de origen, NAME en el origen, motivo)], en orden de prioridad
RELLENOS = {
    "world_bc500.geojson": [
        ("world_bc700.geojson", "Celtiberians", "celtíberos, aún presentes en 500 a. C.; ausentes en este mapa"),
        ("world_bc700.geojson", "Thrace", "tracios (el reino odrisio se forma hacia 480 a. C.); ausentes en este mapa"),
        ("world_bc400.geojson", "Celltic Hallsatt culture", "cultura de Hallstatt (celtas), vigente hasta ca. 450 a. C."),
        ("world_bc400.geojson", "Celts", "celtas de las islas británicas"),
        ("world_bc400.geojson", "Germanic tribes", "pueblos germánicos de Escandinavia y el Báltico occidental"),
        ("world_bc400.geojson", "Scythians", "escitas, dominantes en la estepa póntica desde el siglo VII a. C."),
        ("world_bc700.geojson", "Iranian pastoralists", "pastores nómadas iranios del Caspio"),
        ("world_bc700.geojson", "Arabian pastoral nomads", "pastores nómadas de Arabia"),
        ("world_bc400.geojson", "Zhangzhung Kingdom", "reino de Zhangzhung (Tíbet occidental)"),
        ("world_bc400.geojson", "Proto-Tibetan cultures", "culturas proto-tibetanas"),
        ("world_bc400.geojson", "Gojoseon", "Gojoseon (norte de Corea y Liaodong)"),
        ("world_bc400.geojson", "Magadha", "reino de Magadha (en 500 a. C. ya bajo Bimbisara)"),
        ("world_bc700.geojson", "Wu", "estado de Wu, que existió hasta 473 a. C."),
        ("world_bc700.geojson", "Sinic", "pueblos del ámbito chino fuera de los estados Zhou"),
        ("world_bc400.geojson", "Austro-Asiatic rice farmers", "agricultores austroasiáticos del arroz (sur de China y sudeste asiático)"),
        # descartados a propósito: «Proto-Thai cultures» (el mapa de origen las sitúa en
        # Manchuria), «Cimerians» (desaparecidos antes de 500 a. C.), «Karasuk culture»
        # (anterior) y «Burmese» (los birmanos llegan en el siglo IX)
    ],
}


def _redondear(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], 4), round(obj[1], 4)]
        return [_redondear(x) for x in obj]
    return obj


def _km2(g):
    import math
    from shapely.ops import transform
    return transform(lambda x, y, z=None: (math.radians(x) * 6371, math.sin(math.radians(y)) * 6371), g).area


def _leer(fn):
    with open(os.path.join(GEOJSON, fn), encoding="utf-8") as f:
        return json.load(f)


def _poligonal(g):
    """Solo las partes de superficie (un recorte puede dejar líneas o puntos)."""
    if g.is_empty:
        return g
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    partes = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(partes) if partes else g.__class__()


def rellenar(destino, entradas):
    gj = _leer(destino)
    feats = gj["features"]
    ya = {(f["properties"].get("NAME"), (f["properties"].get("RELLENO") or {}).get("origen"))
          for f in feats if f["properties"].get("RELLENO")}
    geo = [(f, make_valid(shape(f["geometry"]))) for f in feats if f.get("geometry")]
    nombrados = unary_union([g for f, g in geo if f["properties"].get("NAME")])
    sin_nombre = [(f, g) for f, g in geo if not f["properties"].get("NAME")]
    libre = unary_union([g for _, g in sin_nombre]).difference(nombrados)
    origenes = {}
    nuevos, informe = [], []
    for origen, nombre, motivo in entradas:
        if (nombre, origen) in ya:
            continue
        if origen not in origenes:
            origenes[origen] = _leer(origen)["features"]
        fuente = [make_valid(shape(f["geometry"])) for f in origenes[origen]
                  if f.get("geometry") and f["properties"].get("NAME") == nombre]
        if not fuente:
            informe.append(f"  ⚠ {nombre!r} no está en {origen}")
            continue
        props0 = next(f["properties"] for f in origenes[origen] if f["properties"].get("NAME") == nombre)
        trozo = _poligonal(unary_union(fuente).intersection(libre))
        if trozo.is_empty or _km2(trozo) < MIN_KM2:
            informe.append(f"  · {nombre}: no queda hueco que cubrir")
            continue
        libre = libre.difference(trozo)
        props = {k: props0.get(k) for k in ("NAME", "ABBREVN", "SUBJECTO", "BORDERPRECISION", "PARTOF")}
        props["RELLENO"] = {"origen": origen, "motivo": motivo}
        geom = mapping(trozo if trozo.geom_type == "MultiPolygon" else unary_union([trozo]))
        nuevos.append({"type": "Feature", "properties": props, "geometry": _redondear(geom)})
        informe.append(f"  + {nombre} ({origen}): {_km2(trozo) / 1e6:.2f} M km²")
    if not nuevos:
        return gj, informe, False
    # la tierra sin nombre pierde lo que ahora ocupan los rellenos
    ocupado = unary_union([shape(n["geometry"]) for n in nuevos])
    salida = []
    for f in feats:
        if f.get("geometry") and not f["properties"].get("NAME"):
            g = _poligonal(make_valid(shape(f["geometry"])).difference(ocupado))
            if g.is_empty or _km2(g) < 1:
                continue
            f = {**f, "geometry": _redondear(mapping(g))}
        salida.append(f)
    gj = {**gj, "features": salida + nuevos}
    resto = [p for p in getattr(libre, "geoms", [libre]) if p.bounds[3] > -55]  # sin la Antártida
    informe.append(f"  = sigue sin datos (sin contar la Antártida): {sum(_km2(p) for p in resto) / 1e6:.2f} M km²")
    return gj, informe, True


def main():
    solo_ver = "--check" in sys.argv
    cambios = 0
    for destino, entradas in RELLENOS.items():
        gj, informe, cambia = rellenar(destino, entradas)
        print(destino)
        print("\n".join(informe) or "  (sin cambios)")
        if cambia:
            cambios += 1
            if not solo_ver:
                with open(os.path.join(GEOJSON, destino), "w", encoding="utf-8", newline="\n") as f:
                    f.write(json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + "\n")
    if solo_ver and cambios:
        print(f"\n{cambios} mapa(s) con rellenos pendientes: ejecuta python api/rellenar_geojson.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
