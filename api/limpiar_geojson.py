#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Limpia defectos conocidos de los mapas base (web/data/geojson/world_*.geojson).

    python api/limpiar_geojson.py            # aplica los parches y quita duplicados exactos
    python api/limpiar_geojson.py --check    # solo informa (código 1 si habría cambios)

Los mapas vienen de historical-basemaps y alguno trae entidades DUPLICADAS: el
mismo polígono dos veces con atribuciones distintas (en 1938, «Israel» y
«Mandatory Palestine (GB)», «Yemen» y «Yemen (UK)», Qatar y Trucial Oman por
duplicado…), lo que pinta el territorio dos veces y superpone dos rótulos.
Este script quita (1) las entidades listadas en PARCHES, con su motivo, y (2)
cualquier par de entidades con el mismo NAME, SUBJECTO y geometría idéntica.
Vuelve a ejecutarlo si se actualizan los mapas desde el proyecto original.
La detección de casi-duplicados (misma caja y vértices parecidos) la hace
python api/validar.py como aviso.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(RAIZ, "web", "data", "geojson")

# fichero -> lista de {propiedades a igualar} + motivo
PARCHES = {
    "world_1492.geojson": [
        ({"NAME": "Kō Hawaiʻi Paeʻāina (Hawaiian Kingdom)"}, "anacrónico (el reino se unificó en 1795) y duplica la geometría de «Polynesians»"),
        ({"NAME": None, "_duplica_de": "Caribbean hunter-gatherers"}, "entidad sin nombre que duplica la geometría de «Caribbean hunter-gatherers»"),
        ({"NAME": "Resighini Rancheria (Yurok)"}, "reserva moderna que duplica la geometría de «Yurok»"),
        ({"NAME": "ditidaqiic̓aq disib̓aʔk (Ditidaht)"}, "duplica la geometría de «Ditidaht» (mismo pueblo, otra grafía)"),
        ({"NAME": "Kizh"}, "duplica la geometría de «Tongva» (mismo pueblo, otro nombre)"),
        ({"NAME": "Kauwets'a:ka"}, "duplica la geometría de «Meherrin» (mismo pueblo, otro nombre)"),
        ({"NAME": "White River-Kluane"}, "duplica la geometría de «Kluane»"),
        ({"NAME": "Gitga’at Lax Yuup"}, "duplica la geometría de «Gitga’at»"),
    ],
    "world_1938.geojson": [
        ({"NAME": "Israel"}, "anacrónico: en 1938 el territorio era el Mandato británico de Palestina, que ya figura en el mapa con la misma geometría"),
        ({"NAME": "Yemen (UK)"}, "duplica la geometría de «Yemen»; el Protectorado de Adén no tiene polígono propio en este mapa"),
        ({"NAME": "Oman (British Raj)"}, "duplica la geometría de «Muscat and Oman»"),
        ({"NAME": "Qatar", "SUBJECTO": "Qatar"}, "duplica «Qatar» (protectorado británico, como en el mapa de 1930)"),
        ({"NAME": "Trucial Oman", "SUBJECTO": "Trucial Oman"}, "duplica «Trucial Oman» (protectorado británico, como en el mapa de 1930)"),
    ],
}


def _caja(geom):
    coords = (geom or {}).get("coordinates") or []
    polys = coords if geom.get("type") == "MultiPolygon" else [coords]
    pts = [c for poly in polys for ring in poly for c in ring]
    if not pts:
        return None
    return (min(c[0] for c in pts), min(c[1] for c in pts), max(c[0] for c in pts), max(c[1] for c in pts))


def coincide(ft, patron, feats):
    """Las claves normales se comparan con las propiedades; la clave especial
    '_duplica_de' exige además que la geometría tenga la misma caja (±0,05°) que
    la entidad con ese NAME (para señalar entidades sin nombre)."""
    props = ft.get("properties", {})
    for k, v in patron.items():
        if k == "_duplica_de":
            ref = next((f for f in feats if f.get("properties", {}).get("NAME") == v), None)
            c1, c2 = _caja(ft.get("geometry")), _caja(ref.get("geometry")) if ref else None
            if not (c1 and c2 and all(abs(c1[i] - c2[i]) < 0.05 for i in range(4))) or ft is ref:
                return False
        elif props.get(k) != v:
            return False
    return True


def _decidir(fn, feats):
    """Índices a quitar con su motivo: parches declarados + duplicados exactos."""
    quitar = []
    for patron, motivo in PARCHES.get(fn, []):
        for i, ft in enumerate(feats):
            if coincide(ft, patron, feats):
                quitar.append((i, f"{ft['properties'].get('NAME')!r}/{ft['properties'].get('SUBJECTO')!r}: {motivo}"))
    vistos = set()
    for i, ft in enumerate(feats):
        p = ft.get("properties", {})
        clave = (p.get("NAME"), p.get("SUBJECTO"), json.dumps(ft.get("geometry"), sort_keys=True))
        if clave in vistos:
            quitar.append((i, f"{p.get('NAME')!r}/{p.get('SUBJECTO')!r}: duplicado exacto de otra entidad del mismo mapa"))
        vistos.add(clave)
    return sorted(set(quitar))


def limpiar(fn, comprobar):
    ruta = os.path.join(GEOJSON, fn)
    with open(ruta, encoding="utf-8", newline="") as f:
        texto = f.read()
    gj = json.loads(texto)
    feats = gj.get("features", [])
    quitar = _decidir(fn, feats)
    if not quitar:
        return 0
    for i, motivo in quitar:
        print(f"  {'✘' if comprobar else '−'} {fn}: {motivo}")
    if comprobar:
        return len(quitar)
    borrar = {i for i, _ in quitar}
    lineas = texto.splitlines(keepends=True)
    # Formato «una entidad por línea» (exportación de QGIS): se quitan solo esas
    # líneas y el resto del fichero queda byte a byte igual (diffs mínimos).
    idx_lineas = [k for k, l in enumerate(lineas) if l.lstrip().startswith('{ "type": "Feature"')]
    if len(idx_lineas) == len(feats):
        for i in sorted(borrar, reverse=True):
            del lineas[idx_lineas[i]]
        # la última entidad no lleva coma final
        restantes = [k for k, l in enumerate(lineas) if l.lstrip().startswith('{ "type": "Feature"')]
        if restantes:
            k = restantes[-1]
            lineas[k] = lineas[k].rstrip("\r\n").rstrip().rstrip(",") + ("\r\n" if lineas[k].endswith("\r\n") else "\n")
        salida = "".join(lineas)
    else:  # formato compacto en una línea: se reescribe compacto
        gj["features"] = [ft for i, ft in enumerate(feats) if i not in borrar]
        salida = json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + "\n"
    json.loads(salida)  # el resultado debe seguir siendo JSON válido
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(salida)
    return len(quitar)


def main(argv):
    comprobar = "--check" in argv
    total = 0
    for fn in sorted(os.listdir(GEOJSON)):
        if fn.startswith("world_") and fn.endswith(".geojson"):
            total += limpiar(fn, comprobar)
    if comprobar:
        if total:
            print(f"✘ {total} entidad(es) duplicadas o anacrónicas en los mapas base. Ejecuta: python api/limpiar_geojson.py")
            return 1
        print("✔ mapas base sin duplicados conocidos")
        return 0
    print(f"✔ {total} entidad(es) retiradas de los mapas base" if total else "✔ nada que limpiar")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
