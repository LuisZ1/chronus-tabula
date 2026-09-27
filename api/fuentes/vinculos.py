#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vínculos entre fichas de países: predecesores, sucesores y partes.

Un vínculo une una ficha de datos/paises/ con otra por su 'id' y dice qué
relación tienen:

    "vinculos": [
        {"id": "castilla", "tipo": "predecesor"},
        {"id": "portugal", "tipo": "incluye", "desde": 1580, "hasta": 1640}
    ]

    predecesor            continuidad política: esta hereda el Estado, la dinastía
                          o las instituciones de la otra (Castilla → España),
                          directamente o a través de Estados de la misma línea
                          que no tienen ficha
    sucesor               el inverso: la otra heredó el Estado de esta
    parte_de              esta entidad formaba parte de la otra
    incluye               la otra entidad (territorio, colonia, reino) formaba parte de esta
    antecesor_territorial la otra gobernó antes (parte de) este territorio, pero hubo
                          ruptura: conquista o un Estado nuevo que no la continúa
                          (Califato de Córdoba → España, Imperio azteca → México)
    sucesor_territorial   el inverso: la otra gobernó después este territorio

Los vínculos son siempre recíprocos: si España tiene a Castilla como
predecesor, Castilla tiene a España como sucesor, con los mismos años. El
asistente del panel escribe el inverso automáticamente (reciprocos()) y
api/validar.py avisa si falta alguno.

Al seguir una entidad en el mapa se resaltan ella, sus predecesores y lo que
incluye, siguiendo la cadena (España → Castilla → León); los antecesores
territoriales solo si se activa esa opción en el panel de capas. 'desde'/'hasta' son
opcionales y acotan los años en que vale el vínculo.
Solo librería estándar.
"""
import unicodedata

INVERSO = {"predecesor": "sucesor", "sucesor": "predecesor", "parte_de": "incluye", "incluye": "parte_de",
           "antecesor_territorial": "sucesor_territorial", "sucesor_territorial": "antecesor_territorial"}
TIPOS = tuple(INVERSO)
ORDEN_TIPO = {t: i for i, t in enumerate(TIPOS)}


def orden(v):
    """Clave del orden canónico de la lista: por tipo, luego por año y por id."""
    def num(x):
        return x if isinstance(x, int) and not isinstance(x, bool) else float("-inf")
    return (ORDEN_TIPO.get(v.get("tipo"), 99), num(v.get("desde")), v.get("id") or "")


def inverso(v, origen):
    """El vínculo que debe tener la otra ficha apuntando a 'origen'."""
    out = {"id": origen, "tipo": INVERSO.get(v.get("tipo"), v.get("tipo"))}
    for k in ("desde", "hasta"):
        if v.get(k) is not None:
            out[k] = v[k]
    return out


def _lista(reg):
    v = reg.get("vinculos") if isinstance(reg, dict) else None
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def comprobar(reg, ids, err, aviso, donde):
    """Coherencia de los vínculos de una ficha frente al conjunto de ids existentes."""
    propio = reg.get("id")
    vistos = set()
    for v in _lista(reg):
        dest, tipo = v.get("id"), v.get("tipo")
        etiqueta = f"{donde} vínculo «{dest}»"
        if not dest:
            err(etiqueta, "falta el 'id' de la otra ficha")
            continue
        if dest == propio:
            err(etiqueta, "una ficha no puede vincularse consigo misma")
        elif ids and dest not in ids:
            err(etiqueta, f"no existe ninguna ficha datos/paises/{dest}.json")
        if tipo not in INVERSO:
            err(etiqueta, f"tipo {tipo!r} no válido; usa uno de {list(TIPOS)}")
        a, b = v.get("desde"), v.get("hasta")
        if isinstance(a, int) and isinstance(b, int) and a > b:
            err(etiqueta, f"'desde' ({a}) es posterior a 'hasta' ({b})")
        clave = (dest, tipo, a, b)
        if clave in vistos:
            err(etiqueta, "vínculo repetido")
        vistos.add(clave)
    tipos_por_id = {}
    for v in _lista(reg):
        tipos_por_id.setdefault(v.get("id"), set()).add(v.get("tipo"))
    for dest, ts in tipos_por_id.items():
        if {"predecesor", "sucesor"} <= ts:
            aviso(f"{donde} vínculo «{dest}»", "es a la vez predecesor y sucesor: ¿seguro? (acota los años)")


def comprobar_reciprocos(paises, aviso):
    """Aviso por cada vínculo cuyo inverso no está en la otra ficha (validar.py)."""
    por_id = {p.get("id"): p for p in paises if isinstance(p, dict)}
    for p in paises:
        for v in _lista(p):
            otra = por_id.get(v.get("id"))
            if not otra or v.get("tipo") not in INVERSO:
                continue
            esperado = inverso(v, p.get("id"))
            if not any(_igual(esperado, w) for w in _lista(otra)):
                aviso(f"paises/{p.get('id')}",
                      f"el vínculo «{v.get('tipo')} {v.get('id')}» no tiene su inverso en paises/{v.get('id')} "
                      f"(«{esperado['tipo']} {p.get('id')}»); guárdala desde el asistente para completarlo")


def _igual(a, b):
    return all(a.get(k) == b.get(k) for k in ("id", "tipo", "desde", "hasta"))


def reciprocos(origen, antes, despues, leer):
    """Cambios que hay que escribir en OTRAS fichas para que queden recíprocas.

    La ficha que se edita manda sobre las parejas que menciona (antes o
    después): en cada ficha destino se quitan los vínculos que apuntaban a
    'origen' y se ponen los inversos de los actuales. 'leer(id)' devuelve el
    registro de esa ficha o None. Devuelve {id: registro_nuevo} solo de las
    fichas que cambian."""
    afectadas = {v.get("id") for v in _lista(antes) + _lista(despues) if v.get("id") and v.get("id") != origen}
    cambios = {}
    for dest in sorted(afectadas):
        reg = leer(dest)
        if not isinstance(reg, dict):
            continue
        actuales = _lista(reg)
        nuevos = [w for w in actuales if w.get("id") != origen]
        nuevos += [inverso(v, origen) for v in _lista(despues) if v.get("id") == dest and v.get("tipo") in INVERSO]
        nuevos.sort(key=orden)
        if sorted(actuales, key=orden) != nuevos:
            r2 = dict(reg)
            if nuevos:
                r2["vinculos"] = nuevos
            else:
                r2.pop("vinculos", None)
            cambios[dest] = r2
    return cambios


def entrantes(origen, reg, todos):
    """Vínculos que OTRAS fichas declaran hacia 'origen' y que 'reg' no tiene
    (expresados desde el punto de vista de 'reg'): sugerencias para el asistente."""
    propios = _lista(reg)
    out = []
    for p in todos:
        if not isinstance(p, dict) or p.get("id") == origen:
            continue
        for v in _lista(p):
            if v.get("id") != origen or v.get("tipo") not in INVERSO:
                continue
            desde_aqui = inverso(v, p.get("id"))
            if not any(_igual(desde_aqui, w) for w in propios):
                out.append({**desde_aqui, "nombre": p.get("nombre") or p.get("id")})
    return out


# --- resolver un nombre libre ('relacionados') a una ficha -------------------

def norm(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip()


def resolver(nombre, paises, excluir=None):
    """Id de la ficha a la que se refiere un nombre, con la misma prioridad que el
    buscador del mapa: nombre propio, sus partes («A / B»), id, nombres de los
    mapas y nombres por época. None si no hay una coincidencia clara."""
    v = norm(nombre)
    if not v:
        return None
    ps = [p for p in paises if isinstance(p, dict) and p.get("id") != excluir]
    pruebas = (
        lambda p: norm(p.get("nombre")) == v,
        lambda p: any(norm(x) == v for x in str(p.get("nombre") or "").split("/")),
        lambda p: p.get("id") == v,
        lambda p: any(norm(x) == v for x in p.get("nombres") or []),
        lambda p: any(isinstance(x, dict) and norm(x.get("nombre")) == v for x in p.get("nombres_periodo") or []),
    )
    for prueba in pruebas:
        hits = [p["id"] for p in ps if prueba(p)]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            return None
    return None


# --- años en que cada entidad aparece en los mapas (para sugerir el tipo) ----

def anios_en_mapas(geojson_dir):
    """{nombre del GeoJSON: (primer año, último año)} a partir de world_*.geojson."""
    import json
    import os
    import re
    out = {}
    if not os.path.isdir(geojson_dir):
        return out
    for fn in os.listdir(geojson_dir):
        m = re.match(r"world_(bc)?(\d+)\.geojson$", fn)
        if not m:
            continue
        anio = -int(m.group(2)) if m.group(1) else int(m.group(2))
        try:
            with open(os.path.join(geojson_dir, fn), encoding="utf-8") as f:
                feats = json.load(f).get("features", [])
        except Exception:  # noqa: BLE001 — un mapa roto no debe impedir sugerir
            continue
        for ft in feats:
            p = ft.get("properties", {})
            for k in ("NAME", "SUBJECTO"):
                n = p.get(k)
                if n:
                    a, b = out.get(n, (anio, anio))
                    out[n] = (min(a, anio), max(b, anio))
    return out


def lapso(pais, por_nombre):
    """(primer, último) año en que alguno de sus 'nombres' sale en los mapas, o None."""
    xs = [por_nombre[n] for n in pais.get("nombres") or [] if n in por_nombre]
    if not xs:
        return None
    return (min(a for a, _ in xs), max(b for _, b in xs))


def sugerir_tipo(propio, otro):
    """Tipo probable del vínculo propio → otro según sus lapsos en los mapas.
    Empieza antes y acaba antes: predecesor. Empieza después y acaba después:
    sucesor. Su vida cabe en la propia: incluye. La propia cabe en la suya:
    parte_de. None si no hay datos o empiezan el mismo año."""
    if not propio or not otro:
        return None
    (a1, b1), (a2, b2) = propio, otro
    if a2 < a1:
        return "parte_de" if b2 >= b1 else "predecesor"
    if a2 > a1:
        return "incluye" if b2 <= b1 else "sucesor"
    return None
