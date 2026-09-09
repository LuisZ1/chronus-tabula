#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validador de los datos históricos de Chronus Tabula (árbol datos/).

Ejecútalo desde la raíz del repositorio antes de abrir un merge request:

    python api/validar.py

Lee datos/ (un fichero por país, conflicto, evento y territorio) y comprueba:
  · la estructura de cada ficha contra su esquema de schema/ (tipos, campos
    obligatorios, patrones), avisando de claves desconocidas;
  · coherencia de años, coordenadas y polígonos;
  · que los nombres de países existan en los mapas GeoJSON;
  · que las referencias entre fichas (territorio → país, relacionados) resuelvan;
  · que la marca de revisión (revision.hash) siga cuadrando con los datos. Cada aviso o error indica la
entidad afectada («paises/angola» ↔ datos/paises/angola.json). Termina con
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
GEOJSON_DIR = os.path.join(RAIZ, "web", "data", "geojson")
SCHEMA_DIR = os.path.join(RAIZ, "schema")
sys.path.insert(0, os.path.join(RAIZ, "api", "fuentes"))
from comun import cargar_historia, hash_revision, DATOS  # noqa: E402

# colección → fichero de esquema en schema/
ESQUEMAS = {"paises": "pais.json", "conflictos": "conflicto.json",
            "eventos": "evento.json", "territorios": "territorio.json"}

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


# --- comprobación estructural contra schema/*.json ---------------------------
# Implementación mínima de JSON Schema (sin dependencias externas) con lo que
# usan nuestros esquemas: type, enum, required, properties, items, prefixItems,
# minItems, maxItems, minimum, maximum, minLength, pattern. Las claves que no
# estén en 'properties' se señalan como aviso (probable errata), no como error.
_TIPOS = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "array": lambda v: isinstance(v, list),
    "object": lambda v: isinstance(v, dict),
    "null": lambda v: v is None,
}


def cargar_esquemas():
    out = {}
    for col, fn in ESQUEMAS.items():
        ruta = os.path.join(SCHEMA_DIR, fn)
        try:
            with open(ruta, encoding="utf-8") as f:
                out[col] = json.load(f)
        except FileNotFoundError:
            aviso("schema", f"no encuentro schema/{fn}: se omite la comprobación estructural de '{col}'")
        except json.JSONDecodeError as e:
            err("schema", f"schema/{fn} no es JSON válido: {e}")
    return out


def comprueba_esquema(donde, v, sch, ruta=""):
    aqui = f"{donde}{(' ' + ruta) if ruta else ''}"
    tipo = sch.get("type")
    if tipo:
        tipos = tipo if isinstance(tipo, list) else [tipo]
        if not any(_TIPOS[t](v) for t in tipos):
            err(aqui, f"debe ser de tipo {'/'.join(tipos)}, no {type(v).__name__}: {v!r}"[:200])
            return
    if "enum" in sch and v not in sch["enum"]:
        err(aqui, f"valor {v!r} no permitido; usa uno de {sch['enum']}")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if "minimum" in sch and v < sch["minimum"]:
            err(aqui, f"{v} es menor que el mínimo {sch['minimum']}")
        if "maximum" in sch and v > sch["maximum"]:
            err(aqui, f"{v} es mayor que el máximo {sch['maximum']}")
    if isinstance(v, str):
        if "minLength" in sch and len(v) < sch["minLength"]:
            err(aqui, "cadena vacía o demasiado corta")
        if "pattern" in sch and not re.search(sch["pattern"], v):
            err(aqui, f"{v!r} no sigue el formato esperado ({sch['pattern']})")
    if isinstance(v, list):
        if "minItems" in sch and len(v) < sch["minItems"]:
            err(aqui, f"necesita al menos {sch['minItems']} elemento(s)")
        if "maxItems" in sch and len(v) > sch["maxItems"]:
            err(aqui, f"admite como máximo {sch['maxItems']} elemento(s)")
        for i, x in enumerate(v):
            sub = sch["prefixItems"][i] if i < len(sch.get("prefixItems", [])) else sch.get("items")
            if sub:
                etiqueta = x.get("nombre") or x.get("id") or x.get("archivo") or x.get("anio") if isinstance(x, dict) else None
                comprueba_esquema(donde, x, sub, f"{ruta}[{etiqueta if etiqueta is not None else i}]")
    if isinstance(v, dict):
        for k in sch.get("required", []):
            if k not in v:
                err(aqui, f"falta el campo obligatorio '{k}'")
        props = sch.get("properties", {})
        for k, x in v.items():
            if k in props:
                comprueba_esquema(donde, x, props[k], f"{ruta}.{k}" if ruta else k)
            elif props and not k.startswith("_"):
                aviso(aqui, f"clave desconocida '{k}' (¿errata? consulta schema/)")


def _caja(geom):
    """Caja (minx, miny, maxx, maxy) y nº de vértices de un (Multi)Polygon."""
    coords = geom.get("coordinates") or []
    polys = coords if geom.get("type") == "MultiPolygon" else [coords]
    pts = [c for poly in polys for ring in poly for c in ring]
    if not pts:
        return None, 0
    xs = [c[0] for c in pts]
    ys = [c[1] for c in pts]
    return (min(xs), min(ys), max(xs), max(ys)), len(pts)


def geometrias_repetidas(feats):
    """Pares de entidades de un mapa con la misma caja (±0,05°) y un número de
    vértices parecido, y tamaño apreciable (> 0,5°²): casi seguro el mismo polígono
    dos veces con atribuciones distintas (defecto conocido de los mapas base)."""
    resumen = []
    for ft in feats:
        caja, n = _caja(ft.get("geometry") or {})
        if caja and (caja[2] - caja[0]) * (caja[3] - caja[1]) > 0.5:
            p = ft.get("properties", {})
            resumen.append((caja, n, f"{p.get('NAME')} / {p.get('SUBJECTO')}"))
    pares = []
    for i in range(len(resumen)):
        c1, n1, e1 = resumen[i]
        for j in range(i + 1, len(resumen)):
            c2, n2, e2 = resumen[j]
            if all(abs(c1[k] - c2[k]) < 0.05 for k in range(4)) and abs(n1 - n2) <= max(6, 0.15 * max(n1, n2)):
                pares.append((e1, e2))
    return pares


def main():
    # 1) JSON bien formado (cada fichero de datos/; un fallo indica su ruta)
    try:
        d = cargar_historia()
    except FileNotFoundError as e:
        print(f"✘ No encuentro los datos ({e}). Ejecuta el script desde la raíz del repositorio.")
        return 1
    except ValueError as e:
        print(f"✘ JSON inválido en {e}")
        print("  Pista: vigila comas finales y comillas dobles.")
        return 1
    if not os.path.isdir(DATOS):
        aviso("datos", "no existe la carpeta datos/: se ha validado el historia.json monolítico "
                       "(ejecuta python api/dividir.py para migrar)")

    # 1b) estructura de cada ficha contra su esquema (schema/*.json)
    esquemas = cargar_esquemas()
    for col, sch in esquemas.items():
        for reg in d.get(col, []):
            etiqueta = reg.get("id") or reg.get("nombre") or "?" if isinstance(reg, dict) else "?"
            comprueba_esquema(f"{col}/{etiqueta}", reg, sch)

    # 2) nombres reales presentes en los GeoJSON (NAME y SUBJECTO), y entidades
    #    duplicadas dentro de un mismo mapa (misma caja y vértices parecidos: el
    #    territorio se pintaría dos veces con dos rótulos; api/limpiar_geojson.py)
    nombres_geo = set()
    n_mapas = 0
    if os.path.isdir(GEOJSON_DIR):
        for fn in sorted(os.listdir(GEOJSON_DIR)):
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
                for a, b in geometrias_repetidas(gj.get("features", [])):
                    aviso(fn, f"«{a}» y «{b}» tienen (casi) la misma geometría: se pintarían dos veces; "
                              "añade el caso a PARCHES en api/limpiar_geojson.py y ejecútalo")
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
                aviso(donde, f"'nombres' solo debe llevar los nombres EXACTOS de los GeoJSON; estos no aparecen en "
                             f"ninguno: {desconocidos}. Si son alias en español, muévelos a 'relacionados' "
                             "(los usa el filtro «Seguir un reino»)")
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
        # nombres por época: la etiqueta del mapa usa el que corresponde al año
        np = p.get("nombres_periodo")
        if np is not None:
            if not isinstance(np, list):
                err(donde, "'nombres_periodo' debe ser una lista")
            else:
                for per in np:
                    if not isinstance(per, dict) or not per.get("nombre"):
                        err(donde, f"nombres_periodo: falta 'nombre' en {per!r}")
                    elif not es_anio(per.get("desde")):
                        err(donde, f"nombres_periodo '{per.get('nombre')}': 'desde' debe ser un año entero")
                    elif per.get("hasta") is not None and not es_anio(per.get("hasta")):
                        err(donde, f"nombres_periodo '{per.get('nombre')}': 'hasta' debe ser un año entero o ausente")
        # bloque de revisión: marca de que los datos ya se han validado (resumable)
        rev = p.get("revision")
        if rev is not None:
            if not isinstance(rev, dict):
                err(donde, "'revision' debe ser un objeto")
            elif rev.get("estado") not in ("validado", "borrador"):
                err(donde, "revision.estado debe ser 'validado' o 'borrador'")
            elif rev.get("estado") == "validado" and rev.get("hash") and rev["hash"] != hash_revision(p):
                aviso(donde, "revision.hash no cuadra: gobernantes/población/nombres_periodo han cambiado "
                             "después de validarse; revísalos y vuelve a exportar (o quita la marca)")
        # escudos por época: el mapa elige el vigente en el año consultado
        esc = p.get("escudos")
        if esc is not None:
            if not isinstance(esc, list):
                err(donde, "'escudos' debe ser una lista")
            else:
                for e in esc:
                    if not isinstance(e, dict) or not e.get("archivo"):
                        err(donde, f"escudo sin 'archivo': {e!r}")
                    elif e.get("desde") is not None and not es_anio(e.get("desde")):
                        err(donde, f"escudo '{e.get('archivo')}': 'desde' debe ser año entero o ausente")
                    elif e.get("hasta") is not None and not es_anio(e.get("hasta")):
                        err(donde, f"escudo '{e.get('archivo')}': 'hasta' debe ser año entero o ausente")
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
    for p in d.get("paises", []):
        for n in p.get("relacionados", []):
            if str(n).lower() not in nombres_pais:
                aviso(f"paises/{p.get('id')}", f"'relacionados' cita {n!r}, que no es el nombre de ninguna ficha de 'paises'")
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
        # pais == nombre: entidad con color propio a propósito (póleis, Sumeria…)
        if b and nombres_pais and b not in nombres_pais and b != str(t.get("nombre", "")).lower():
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
    print(f"✔ datos válidos — {n[0]} países, {n[1]} conflictos, {n[2]} zonas, {n[3]} batallas, {n[4]} eventos, {n[5]} territorios"
          + (f" ({len(avisos)} aviso(s) no bloqueantes)" if avisos else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
