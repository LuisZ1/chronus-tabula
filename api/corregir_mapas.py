#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aplica correcciones documentadas de fronteras y rótulos a los mapas base.

    python api/corregir_mapas.py                       # aplica api/correcciones/*.json
    python api/corregir_mapas.py --check               # solo informa (código 1 si habría cambios)
    python api/corregir_mapas.py --solo 20-medieval.json [--check]
    python api/corregir_mapas.py --informe             # recalcula y muestra el informe aunque esté al día
    python api/corregir_mapas.py --forzar              # reescribe los mapas aunque su huella coincida

Los mapas de historical-basemaps tienen errores de fronteras (Egipto persa en
400 a. C., el Inca en 1600…) y de rótulos (Parthian en 300, Austrian Empire
antes de 1804…). Este script los corrige de forma reproducible: cada fichero
api/correcciones/<NN>-<tema>.json describe, por mapa, una lista de operaciones
con su motivo y su fuente, y el script las aplica partiendo SIEMPRE del mapa
original, de modo que se pueden regenerar si se actualizan los mapas de origen.

Formato de un fichero de correcciones (el de las herramientas del cartógrafo A):

    {"tema": "...", "mapas": {
        "world_bc400.geojson": [op, ...],                       # corrige un mapa existente
        "world_bc600.geojson<world_bc700.geojson": [op, ...]    # crea un mapa nuevo a partir de otro
    }}

Operaciones (todas admiten "motivo" y "fuente"):
  renombrar  {"de": NAME, "props": {...}}        une las features con ese NAME en una y le pone props
                                                 (si el NAME nuevo ya existe, se funde con él)
             {"patron": {...}, "poner": {...}}   cambia las propiedades de cada feature que case con
                                                 patron, sin tocar la geometría (NAME/SUBJECTO/ABBREVN/PARTOF…)
  asignar    {"region": R, "desde": [NAME...] | "*", "libre": bool, "props": {"NAME": ..., ...}}
             la parte de R que hoy es de «desde» (y de la tierra sin datos si libre) pasa a props["NAME"];
             con "NAME": null pasa a «sin datos»
  quitar     {"de": NAME, "a": NAME | null}      la entidad se une a otra o pasa a «sin datos»
  recortar   {"de": NAME}                        quita a la entidad lo que solapa con otras con nombre
  sustituir  {"geometria": "api/geo/correcciones/<f>.geojson", "nombres": [NAME...],
              "modo": "sustituir" | "añadir", "resto": NAME | null, "props": {...}}
             toma del fichero las features con esos NAME (y, si tienen la propiedad MAPA, solo las de
             este mapa), las recorta a la tierra del mapa y a las vecinas les quita lo que solapa.
             modo "sustituir" (por defecto): esa es la geometría completa de la entidad y lo que deja
             pasa a «resto» (por defecto sin datos). modo "añadir": las piezas se suman a lo que ya tiene
             (las piezas precalculadas del cartógrafo B, con NAME destino, DE donante, MOTIVO, FUENTE).
Regiones R: {"caja": [lon1, lat1, lon2, lat2]} | {"pol": [[lon, lat], ...]}
            | {"feat": NAME, "mapa": "world_X.geojson"?}  (sin mapa: el estado actual de este mapa;
              con mapa: el ORIGINAL de ese mapa)
            | {"archivo": "api/geo/…geojson", "nombre": NAME?} | {"y": [R...]} (unión)
            | {"n": [R...]} (intersección) | {"menos": [R, R...]} (diferencia)

Cada feature tocada lleva CORREGIDO {base, motivo[, fuente]} en los mapas existentes
y DERIVADO {base, motivo[, fuente]} en los mapas nuevos. El FeatureCollection lleva
"correcciones": {"base", "huella"}: la huella resume el original, las operaciones
y los ficheros de geometría usados. Si coincide, el mapa está al día y no se
reescribe; por eso el script es idempotente y no pisa lo que añadan después
rellenar_geojson.py o limpiar_geojson.py.

Originales: la primera vez que se corrige un mapa se guarda una copia exacta
del mapa tal como estaba en api/geo/originales/<mapa>. Ese es el punto de
partida de todas las ejecuciones siguientes (no depende de git). Si se
actualizan los mapas desde historical-basemaps, se copia el mapa nuevo ahí.
Si un mapa deja de tener correcciones, se restaura su original.

Canalización (en este orden; cada paso es idempotente):
    1. python api/corregir_mapas.py     originales + correcciones → web/data/geojson
    2. python api/limpiar_geojson.py    quita duplicados y anacronismos (PARCHES)
    3. python api/rellenar_geojson.py   rellena tierra sin datos (RELLENOS)
    4. python api/derivar_mapas.py      mapas posteriores a 2010 (DERIVADOS)
Si el paso 1 reescribe un mapa, hay que volver a pasar 2-4 (el script lo recuerda).
No se pueden corregir los mapas que genera derivar_mapas.py (world_2011): se corrige su base.
Al final regenera web/data/years.json con los world_*.geojson presentes.

Necesita shapely (pip install shapely); la web no. Los mapas siguen bajo GPL-3.0.
"""
import copy
import glob
import hashlib
import json
import math
import os
import re
import shutil
import sys

try:
    from shapely.geometry import Polygon, box, mapping, shape
    from shapely.ops import transform, unary_union
    from shapely.validation import make_valid
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita shapely: pip install shapely")

VERSION = "1"  # súbela si cambia la semántica de las operaciones (fuerza regenerar)
CLAVES = ("NAME", "ABBREVN", "SUBJECTO", "BORDERPRECISION", "PARTOF")
MIN_KM2 = 50      # trozos menores no se mueven (bordes de recorte)
SOLAPE_KM2 = 500  # solapes menores no se avisan
ASTILLA_KM2 = 1   # recortes menores (sustituir) no se anotan en CORREGIDO ni en el informe


class Rutas:
    def __init__(self, raiz):
        self.raiz = os.path.abspath(raiz)
        self.geojson = os.path.join(self.raiz, "web", "data", "geojson")
        self.years = os.path.join(self.raiz, "web", "data", "years.json")
        self.specs = os.path.join(self.raiz, "api", "correcciones")
        self.originales = os.path.join(self.raiz, "api", "geo", "originales")

    def rel(self, ruta):
        return os.path.join(self.raiz, ruta)


# ---------------------------------------------------------------- geometría

def km2(g):
    return transform(lambda x, y, z=None: (math.radians(x) * 6371, math.sin(math.radians(y)) * 6371), g).area


def cifra(a):
    """km² legibles: en miles si es grande."""
    return f"{a / 1e3:,.0f} mil km²" if a >= 1e4 else f"{a:,.0f} km²"


def sup(g):
    """Solo las partes de superficie (un recorte puede dejar líneas o puntos)."""
    if g.is_empty:
        return g
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    partes = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(partes) if partes else Polygon()


def red(o):
    if isinstance(o, (list, tuple)):
        if o and isinstance(o[0], (int, float)):
            return [round(o[0], 4), round(o[1], 4)]
        return [red(x) for x in o]
    return o


def sha(datos):
    return hashlib.sha256(datos if isinstance(datos, bytes) else datos.encode("utf-8")).hexdigest()


def canon(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def anio(fn):
    m = re.match(r"world_(bc)?(\d+)\.geojson$", fn)
    return (-int(m.group(2)) if m.group(1) else int(m.group(2))) if m else None


# ---------------------------------------------------------------- lectura

class Fuentes:
    """Lee originales y ficheros auxiliares, y recuerda su huella."""

    def __init__(self, rutas):
        self.r = rutas
        self._bytes = {}
        self._feats = {}

    def ruta_original(self, fn):
        guardado = os.path.join(self.r.originales, fn)
        if os.path.exists(guardado):
            return guardado
        return os.path.join(self.r.geojson, fn)

    def bytes_de(self, ruta):
        if ruta not in self._bytes:
            with open(ruta, "rb") as f:
                self._bytes[ruta] = f.read()
        return self._bytes[ruta]

    def original(self, fn):
        ruta = self.ruta_original(fn)
        if not os.path.exists(ruta):
            raise SystemExit(f"✘ no existe el mapa {fn}")
        datos = self.bytes_de(ruta)
        gj = json.loads(datos)
        if ruta.startswith(self.r.geojson) and gj.get("correcciones"):
            raise SystemExit(f"✘ {fn} ya está corregido pero falta su original en api/geo/originales/; "
                             "cópialo de historical-basemaps (o de git) antes de seguir")
        return gj, sha(datos)

    def feats_original(self, fn):
        if fn not in self._feats:
            gj, _ = self.original(fn)
            self._feats[fn] = [(f["properties"], make_valid(shape(f["geometry"])))
                               for f in gj["features"] if f.get("geometry")]
        return self._feats[fn]

    def archivo(self, ruta_rel):
        ruta = self.r.rel(ruta_rel)
        if not os.path.exists(ruta):
            raise SystemExit(f"✘ no existe {ruta_rel}")
        return json.loads(self.bytes_de(ruta)), sha(self.bytes_de(ruta))


def referencias(ops, mapa):
    """Ficheros y mapas que leen las operaciones (para la huella)."""
    archivos, mapas = set(), set()

    def en_region(R):
        if not isinstance(R, dict):
            return
        if "archivo" in R:
            archivos.add(R["archivo"])
        if R.get("mapa") and "feat" in R:
            mapas.add(R["mapa"])
        for k in ("y", "n", "menos"):
            for sub in R.get(k, []):
                en_region(sub)

    for op in ops:
        if op.get("op") == "sustituir":
            archivos.add(op["geometria"])
        if "region" in op:
            en_region(op["region"])
    return sorted(archivos), sorted(mapas)


# ---------------------------------------------------------------- estado de un mapa

class Feature:
    __slots__ = ("props", "geom", "orig", "marca")

    def __init__(self, props, geom, orig=None, marca=None):
        self.props = props      # propiedades (sin la marca)
        self.geom = geom        # geometría shapely
        self.orig = orig        # geometría GeoJSON original si no se ha tocado
        self.marca = marca or {}  # {"CORREGIDO"|"DERIVADO": {"base", "motivos", "fuentes"}}

    @property
    def nombre(self):
        return self.props.get("NAME")

    def tocar(self, clave, base, motivo, fuente=None):
        self.orig = None
        m = self.marca.setdefault(clave, {"base": base, "motivos": [], "fuentes": []})
        if motivo and motivo not in m["motivos"]:
            m["motivos"].append(motivo)
        for fu in ([fuente] if isinstance(fuente, str) else (fuente or [])):
            if fu and fu not in m["fuentes"]:
                m["fuentes"].append(fu)

    def copiar(self):
        return Feature(dict(self.props), self.geom, self.orig, copy.deepcopy(self.marca))


class Mapa:
    def __init__(self, nombre, cabecera, feats, base):
        self.nombre = nombre
        self.cabecera = cabecera  # claves del FeatureCollection salvo features
        self.feats = feats
        self.base = base          # mapa original del que parte
        self.nuevo = False
        self.sin_geometria = []   # features sin geometría: se conservan tal cual

    @classmethod
    def desde_geojson(cls, fn, gj):
        feats, vacias = [], []
        for f in gj["features"]:
            if f.get("geometry"):
                feats.append(Feature(dict(f["properties"]), make_valid(shape(f["geometry"])), f["geometry"]))
            else:
                vacias.append(f)
        cab = {k: v for k, v in gj.items() if k not in ("features", "correcciones")}
        m = cls(fn, cab, feats, fn)
        m.sin_geometria = vacias
        return m

    def derivar(self, fn):
        m = Mapa(fn, {**self.cabecera, "name": fn[:-8]}, [f.copiar() for f in self.feats], self.nombre)
        m.nuevo = True
        m.sin_geometria = list(self.sin_geometria)
        return m

    @property
    def clave(self):
        return "DERIVADO" if self.nuevo else "CORREGIDO"

    def geojson(self, huella):
        salida = []
        for fe in self.feats:
            if fe.geom.is_empty:
                continue
            p = dict(fe.props)
            for k, m in fe.marca.items():
                v = {"base": m["base"], "motivo": " · ".join(m["motivos"]) or "recorte por un cambio vecino"}
                if m["fuentes"]:
                    v["fuente"] = "; ".join(m["fuentes"])
                p[k] = v
            geom = fe.orig if fe.orig is not None else red(mapping(fe.geom))
            salida.append({"type": "Feature", "properties": p, "geometry": geom})
        gj = {**self.cabecera, "correcciones": {"base": self.base, "huella": huella},
              "features": salida + self.sin_geometria}
        return json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + "\n"


# ---------------------------------------------------------------- operaciones

class Aplicador:
    def __init__(self, fuentes):
        self.fu = fuentes

    def region(self, R, mapa):
        if "caja" in R:
            return box(*R["caja"])
        if "pol" in R:
            return make_valid(Polygon(R["pol"]))
        if "feat" in R:
            if R.get("mapa"):
                return unary_union([g for p, g in self.fu.feats_original(R["mapa"]) if p.get("NAME") == R["feat"]])
            return unary_union([fe.geom for fe in mapa.feats if fe.nombre == R["feat"]])
        if "archivo" in R:
            gj, _ = self.fu.archivo(R["archivo"])
            return unary_union([make_valid(shape(f["geometry"])) for f in gj["features"]
                                if f.get("geometry") and ("nombre" not in R or f["properties"].get("NAME") == R["nombre"])])
        if "y" in R:
            return unary_union([self.region(r, mapa) for r in R["y"]])
        if "n" in R:
            g = self.region(R["n"][0], mapa)
            for r in R["n"][1:]:
                g = g.intersection(self.region(r, mapa))
            return g
        if "menos" in R:
            g = self.region(R["menos"][0], mapa)
            for r in R["menos"][1:]:
                g = g.difference(self.region(r, mapa))
            return g
        raise SystemExit(f"✘ región desconocida: {R}")

    @staticmethod
    def destino(mapa, props):
        for fe in mapa.feats:
            if fe.nombre == props["NAME"]:
                return fe
        p = {k: props.get(k) for k in CLAVES}
        if p.get("BORDERPRECISION") is None:
            p["BORDERPRECISION"] = 1
        for k in ("SUBJECTO", "PARTOF"):
            if not p.get(k):
                p[k] = props["NAME"]
        fe = Feature(p, Polygon())
        mapa.feats.append(fe)
        return fe

    @staticmethod
    def sin_datos():
        return Feature({"NAME": None, "ABBREVN": None, "SUBJECTO": None, "BORDERPRECISION": 1, "PARTOF": None},
                       Polygon())

    def aplicar(self, mapa, ops, informe):
        fn, cl, base = mapa.nombre, mapa.clave, mapa.base
        tierra0 = unary_union([fe.geom for fe in mapa.feats])
        for op in ops:
            tipo = op.get("op")
            motivo = op.get("motivo", "")
            fuente = op.get("fuente")
            if tipo == "renombrar" and "patron" in op:
                n = 0
                for fe in mapa.feats:
                    if all(fe.props.get(k) == v for k, v in op["patron"].items()):
                        fe.props.update(op["poner"])
                        fe.tocar(cl, base, motivo, fuente)
                        n += 1
                informe.append(f"  ~ {fn}: {canon(op['patron'])} → {canon(op['poner'])} ({n} feature(s)) · {motivo}"
                               if n else f"  ⚠ {fn}: nada casa con {canon(op['patron'])}")
            elif tipo == "renombrar":
                idx = [fe for fe in mapa.feats if fe.nombre == op["de"]]
                if not idx:
                    informe.append(f"  ⚠ {fn}: no hay {op['de']!r}")
                    continue
                g = unary_union([fe.geom for fe in idx])
                for fe in idx:
                    mapa.feats.remove(fe)
                nuevo = dict(idx[0].props)
                nuevo.update(op["props"])
                existe = next((fe for fe in mapa.feats if fe.nombre == nuevo["NAME"]), None)
                if existe:
                    existe.geom = sup(existe.geom.union(g))
                    existe.tocar(cl, base, motivo, fuente)
                else:
                    fe = Feature(nuevo, g, None, copy.deepcopy(idx[0].marca))
                    fe.tocar(cl, base, motivo, fuente)
                    mapa.feats.append(fe)
                informe.append(f"  ~ {fn}: {op['de']!r} → {nuevo['NAME']!r} ({km2(g) / 1e3:,.0f} mil km²) · {motivo}")
            elif tipo == "quitar":
                idx = [fe for fe in mapa.feats if fe.nombre == op["de"]]
                if not idx:
                    informe.append(f"  ⚠ {fn}: no hay {op['de']!r}")
                    continue
                g = unary_union([fe.geom for fe in idx])
                for fe in idx:
                    mapa.feats.remove(fe)
                if op.get("a"):
                    d = self.destino(mapa, {"NAME": op["a"]})
                    d.geom = sup(d.geom.union(g))
                    d.tocar(cl, base, motivo, fuente)
                    informe.append(f"  - {fn}: {op['de']!r} se une a {op['a']!r} ({km2(g) / 1e3:,.0f} mil km²) · {motivo}")
                else:
                    d = self.sin_datos()
                    d.geom = g
                    d.tocar(cl, base, motivo, fuente)
                    mapa.feats.append(d)
                    informe.append(f"  - {fn}: {op['de']!r} pasa a «sin datos» ({km2(g) / 1e3:,.0f} mil km²) · {motivo}")
            elif tipo == "recortar":
                otros = unary_union([fe.geom for fe in mapa.feats if fe.nombre and fe.nombre != op["de"]])
                hay = False
                for fe in mapa.feats:
                    if fe.nombre == op["de"]:
                        hay = True
                        a0 = km2(fe.geom)
                        fe.geom = sup(fe.geom.difference(otros))
                        fe.tocar(cl, base, motivo, fuente)
                        informe.append(f"  ✂ {fn}: {op['de']!r} pierde {(a0 - km2(fe.geom)) / 1e3:,.0f} mil km² "
                                       f"que solapaban con otras entidades · {motivo}")
                if not hay:
                    informe.append(f"  ⚠ {fn}: no hay {op['de']!r}")
            elif tipo == "asignar":
                R = self.region(op["region"], mapa)
                if op["props"].get("NAME") is None:
                    d = self.sin_datos()
                    mapa.feats.append(d)
                else:
                    d = self.destino(mapa, op["props"])
                tomado = self._tomar(mapa, d, R, op.get("desde", "*"), op.get("libre", False), cl, base, motivo)
                d.tocar(cl, base, motivo, fuente)
                for k, v in op["props"].items():
                    if d.nombre is not None or k != "NAME":
                        d.props[k] = v
                tot = sum(a for _, a in tomado)
                det = ", ".join(f"{n or 'sin datos'} {cifra(a)}" for n, a in tomado)
                informe.append(f"  + {fn}: {op['props'].get('NAME') or 'sin datos'!r} recibe {tot / 1e3:,.0f} mil km² "
                               f"({det}) · {motivo}")
            elif tipo == "sustituir":
                self._sustituir(mapa, op, tierra0, informe)
            else:
                raise SystemExit(f"✘ {fn}: operación desconocida {tipo!r}")
        self._comprobar(mapa, tierra0, informe)

    def _tomar(self, mapa, d, R, desde, libre, cl, base, motivo, minimo=MIN_KM2):
        """Pasa a d la parte de R de las entidades de «desde» (y de la tierra sin datos si libre)."""
        tomado = []
        for fe in list(mapa.feats):
            if fe is d:
                continue
            n = fe.nombre
            if n is None:
                if not libre:
                    continue
            elif desde != "*" and n not in desde:
                continue
            trozo = sup(fe.geom.intersection(R))
            if trozo.is_empty or km2(trozo) < minimo:
                continue
            fe.geom = sup(fe.geom.difference(trozo))
            if km2(trozo) >= ASTILLA_KM2:
                fe.tocar(cl, base, f"cede territorio a «{d.nombre or 'sin datos'}»: {motivo}")
                tomado.append((n, km2(trozo)))
            else:  # astilla de borde: se recorta sin anotarla
                fe.orig = None
            d.geom = sup(d.geom.union(trozo))
            if fe.geom.is_empty or km2(fe.geom) < minimo:
                if not fe.geom.is_empty and d.nombre is not None:
                    d.geom = sup(d.geom.union(fe.geom))
                mapa.feats.remove(fe)
        return tomado

    def _sustituir(self, mapa, op, tierra0, informe):
        fn, cl, base = mapa.nombre, mapa.clave, mapa.base
        motivo = op.get("motivo", "")
        gj, _ = self.fu.archivo(op["geometria"])
        modo = op.get("modo", "sustituir")
        if modo not in ("sustituir", "añadir"):
            raise SystemExit(f"✘ {fn}: modo desconocido {modo!r}")
        for nombre in op["nombres"]:
            piezas = [f for f in gj["features"] if f.get("geometry") and f["properties"].get("NAME") == nombre
                      and f["properties"].get("MAPA") in (None, fn, base)]
            if not piezas:
                informe.append(f"  ⚠ {fn}: {op['geometria']} no tiene piezas de {nombre!r} para este mapa")
                continue
            g = sup(make_valid(unary_union([make_valid(shape(f["geometry"])) for f in piezas])).intersection(tierra0))
            p0 = piezas[0]["properties"]
            props = {k: p0.get(k) for k in CLAVES if p0.get(k) is not None}
            props["NAME"] = nombre
            props.update(op.get("props", {}))
            fuentes = [op["fuente"]] if op.get("fuente") else []
            fuentes += [f["properties"]["FUENTE"] for f in piezas if f["properties"].get("FUENTE")]
            motivos = [motivo] if motivo else []
            motivos += [f["properties"]["MOTIVO"] for f in piezas if f["properties"].get("MOTIVO")]
            mot = " · ".join(dict.fromkeys(motivos))
            d = self.destino(mapa, props)
            for k, v in op.get("props", {}).items():
                d.props[k] = v
            a0 = km2(d.geom)
            if modo == "sustituir":
                sobra = sup(d.geom.difference(g))
                d.geom = Polygon()
                if not sobra.is_empty and km2(sobra) >= MIN_KM2:
                    if op.get("resto"):
                        r = self.destino(mapa, {"NAME": op["resto"]})
                        r.geom = sup(r.geom.union(sobra))
                    else:
                        r = self.sin_datos()
                        r.geom = sobra
                        mapa.feats.append(r)
                    r.tocar(cl, base, f"recibe lo que deja «{nombre}»: {mot}")
                    informe.append(f"  - {fn}: {nombre!r} deja {km2(sobra) / 1e3:,.0f} mil km² a "
                                   f"{op.get('resto') or 'sin datos'!r}")
                elif not sobra.is_empty:
                    g = sup(g.union(sobra))  # astillas de borde: se quedan con la entidad
            tomado = self._tomar(mapa, d, g, "*", True, cl, base, mot, minimo=0)
            d.geom = sup(d.geom.union(g))
            d.tocar(cl, base, mot, fuentes)
            det = ", ".join(f"{n or 'sin datos'} {cifra(a)}" for n, a in tomado)
            informe.append(f"  ⇄ {fn}: {nombre!r} ({modo}) {a0 / 1e3:,.0f} → {km2(d.geom) / 1e3:,.0f} mil km²; "
                           f"toma {sum(a for _, a in tomado) / 1e3:,.0f} mil km² ({det or '—'}) · {mot}")

    @staticmethod
    def _comprobar(mapa, tierra0, informe):
        tierra1 = unary_union([fe.geom for fe in mapa.feats])
        perdida = km2(sup(tierra0.difference(tierra1)))
        ganada = km2(sup(tierra1.difference(tierra0)))
        nombr = [fe for fe in mapa.feats if fe.nombre]
        solapes = []
        for fe in nombr:
            if not fe.marca:
                continue
            for otra in nombr:
                if otra is fe or not fe.geom.intersects(otra.geom):
                    continue
                a = km2(sup(fe.geom.intersection(otra.geom)))
                if a > SOLAPE_KM2:
                    solapes.append((fe.nombre, otra.nombre, a))
        informe.append(f"  = {mapa.nombre}: tierra perdida {perdida:,.0f} km², añadida {ganada:,.0f} km²; "
                       f"solapes >{SOLAPE_KM2} km² de lo tocado: {len(solapes)}"
                       + "".join(f"\n      ! {a} × {b}: {s:,.0f} km²" for a, b, s in solapes[:8]))


# ---------------------------------------------------------------- plan y huellas

def leer_specs(rutas, derivados):
    pasos = []  # (fichero, destino, base, ops)
    for ruta in sorted(glob.glob(os.path.join(rutas.specs, "*.json"))):
        with open(ruta, encoding="utf-8") as f:
            try:
                spec = json.load(f)
            except json.JSONDecodeError as e:
                raise SystemExit(f"✘ {os.path.relpath(ruta, rutas.raiz)}: JSON mal formado ({e})")
        for clave, ops in (spec.get("mapas") or {}).items():
            destino, _, base = clave.partition("<")
            base = base or destino
            for fn in (destino, base):
                if anio(fn) is None:
                    raise SystemExit(f"✘ {os.path.basename(ruta)}: nombre de mapa inválido {fn!r}")
            if destino in derivados:
                raise SystemExit(f"✘ {os.path.basename(ruta)}: {destino} lo genera api/derivar_mapas.py; "
                                 f"corrige su base ({derivados[destino]}) en su lugar")
            pasos.append((os.path.basename(ruta), destino, base, ops))
    return pasos


def huellas(pasos, fuentes, rutas):
    h, bases, origen = {}, {}, {}
    for fichero, destino, base, ops in pasos:
        if destino != base:
            if destino in h:
                raise SystemExit(f"✘ {fichero}: el mapa nuevo {destino} ya se define antes")
            ruta_web = os.path.join(rutas.geojson, destino)
            if os.path.exists(ruta_web) and not json.loads(fuentes.bytes_de(ruta_web)).get("correcciones"):
                raise SystemExit(f"✘ {fichero}: {destino} ya existe y no es un mapa derivado por este script")
            if base not in h:
                h[base] = sha(VERSION + "|original|" + fuentes.original(base)[1])
                bases[base], origen[base] = base, None
            h[destino] = sha(VERSION + "|nuevo|" + destino + "|" + h[base])
            bases[destino], origen[destino] = base, fichero
        elif destino not in h:
            h[destino] = sha(VERSION + "|original|" + fuentes.original(destino)[1])
            bases[destino], origen[destino] = destino, None
        archivos, mapas = referencias(ops, destino)
        extra = [a + ":" + fuentes.archivo(a)[1] for a in archivos]
        extra += [m + ":" + fuentes.original(m)[1] for m in mapas]
        h[destino] = sha(h[destino] + "|" + canon(ops) + "|" + "|".join(extra))
    return h, bases


def huella_actual(rutas, fn):
    ruta = os.path.join(rutas.geojson, fn)
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8") as f:
        return (json.load(f).get("correcciones") or {}).get("huella")


def years(rutas):
    return sorted(a for fn in os.listdir(rutas.geojson) for a in [anio(fn)] if a is not None)


# ---------------------------------------------------------------- principal

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    solo_ver = "--check" in argv
    forzar = "--forzar" in argv
    ver_informe = "--informe" in argv
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    solo = None
    for opcion in ("--raiz", "--solo"):
        if opcion in argv:
            i = argv.index(opcion)
            if i + 1 >= len(argv):
                raise SystemExit(f"✘ falta el valor de {opcion}")
            if opcion == "--raiz":
                raiz = argv[i + 1]
            else:
                solo = os.path.basename(argv[i + 1])
    rutas = Rutas(raiz)
    sys.path.insert(0, os.path.join(rutas.raiz, "api"))
    try:
        from derivar_mapas import DERIVADOS
        derivados = {k: v["base"] for k, v in DERIVADOS.items()}
    except Exception:  # noqa: BLE001 — sin derivar_mapas no hay mapas que proteger
        derivados = {}
    fuentes = Fuentes(rutas)
    pasos = leer_specs(rutas, derivados)
    if solo and not any(p[0] == solo for p in pasos) and not os.path.exists(os.path.join(rutas.specs, solo)):
        raise SystemExit(f"✘ no existe api/correcciones/{solo}")
    h, bases = huellas(pasos, fuentes, rutas)
    objetivo = [fn for fn in dict.fromkeys(p[1] for p in pasos if not solo or p[0] == solo)]
    if solo:
        otros = sorted({p[0] for p in pasos if p[1] in objetivo and p[0] != solo})
        if otros:
            print(f"⚠ los mapas de {solo} también los tocan: {', '.join(otros)} (se aplican todos, en orden)")
    pendientes = [fn for fn in objetivo if forzar or huella_actual(rutas, fn) != h[fn]]
    calcular = set(pendientes if not ver_informe else objetivo)
    cambia = True
    while cambia:  # un mapa nuevo necesita calcular su base
        cambia = False
        for fn in list(calcular):
            if bases[fn] != fn and bases[fn] not in calcular and bases[fn] in h:
                calcular.add(bases[fn])
                cambia = True

    estados, informes = {}, {}
    ap = Aplicador(fuentes)
    for fichero, destino, base, ops in pasos:
        if destino not in calcular:
            continue
        if destino not in estados:
            if destino != base:
                mbase = estados.get(base) or Mapa.desde_geojson(base, fuentes.original(base)[0])
                estados[destino] = mbase.derivar(destino)
            else:
                estados[destino] = Mapa.desde_geojson(destino, fuentes.original(destino)[0])
        inf = informes.setdefault(destino, [])
        inf.append(f"  [{fichero}]" + (f" mapa nuevo derivado de {base}" if destino != base else ""))
        ap.aplicar(estados[destino], ops, inf)

    escritos = 0
    for fn in objetivo:
        estado = "pendiente" if fn in pendientes else "al día"
        print(f"{fn} ({estado})")
        if fn in informes:
            print("\n".join(informes[fn]))
        if fn not in pendientes:
            continue
        if solo_ver:
            continue
        orig = os.path.join(rutas.originales, fn)
        if bases[fn] == fn and not os.path.exists(orig):
            os.makedirs(rutas.originales, exist_ok=True)
            shutil.copyfile(os.path.join(rutas.geojson, fn), orig)
            print(f"  · original guardado en {os.path.relpath(orig, rutas.raiz)}")
        with open(os.path.join(rutas.geojson, fn), "w", encoding="utf-8", newline="\n") as f:
            f.write(estados[fn].geojson(h[fn]))
        escritos += 1

    # mapas que ya no tienen correcciones (solo en la ejecución completa)
    huerfanos = 0
    if not solo:
        for ruta in sorted(glob.glob(os.path.join(rutas.geojson, "world_*.geojson"))):
            fn = os.path.basename(ruta)
            if fn in h or fn in derivados or not huella_actual(rutas, fn):
                continue  # los de derivar_mapas.py heredan la marca de su base
            huerfanos += 1
            orig = os.path.join(rutas.originales, fn)
            if os.path.exists(orig):
                print(f"{fn}: ya no tiene correcciones → se restaura su original")
                if not solo_ver:
                    shutil.copyfile(orig, ruta)
                    escritos += 1
            else:
                print(f"⚠ {fn}: mapa derivado que ya no está en ninguna corrección; bórralo a mano "
                      "(y vuelve a ejecutar este script para actualizar years.json)")

    anios = years(rutas)
    with open(rutas.years, encoding="utf-8") as f:
        anios_ahora = json.load(f)
    years_pend = anios != anios_ahora
    if years_pend:
        faltan = sorted(set(anios) - set(anios_ahora))
        sobran = sorted(set(anios_ahora) - set(anios))
        print(f"years.json: añade {faltan or '—'}, quita {sobran or '—'}")
        if not solo_ver:
            with open(rutas.years, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(anios, indent=4) + "\n")

    total = len(pendientes) + huerfanos + (1 if years_pend else 0)
    if solo_ver:
        if total:
            print(f"\n{total} cambio(s) pendiente(s): ejecuta python api/corregir_mapas.py"
                  + (f" --solo {solo}" if solo else ""))
            return 1
        print("\n✔ mapas corregidos al día")
        return 0
    if escritos:
        print(f"\n{escritos} mapa(s) reescrito(s): vuelve a pasar api/limpiar_geojson.py, "
              "api/rellenar_geojson.py y api/derivar_mapas.py")
    else:
        print("\n✔ mapas corregidos al día")
    return 0


if __name__ == "__main__":
    sys.exit(main())
