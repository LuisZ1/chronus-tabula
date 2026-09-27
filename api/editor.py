#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Asistente de edición de fichas: lógica del servidor.

Lo usa api/servidor.py para las rutas /api/fichas/… del panel de administración.
El asistente del panel edita una ficha de datos/ con un formulario generado a
partir de schema/*.json; aquí se valida, se escribe en formato canónico y se
recompila web/data/historia.json. Así nadie tiene que editar el JSON a mano.

    GET  /api/fichas/_esquemas            los cuatro esquemas de schema/
    GET  /api/fichas/<col>                lista de fichas de la colección
    GET  /api/fichas/<col>/<fichero>      una ficha, con su versión (huella del texto)
    POST /api/fichas/_validar             {coleccion, registro, fichero?} -> errores, avisos, diff (no escribe)
    POST /api/fichas/<col>                {registro} -> crea una ficha nueva
    POST /api/fichas/<col>/<fichero>      {registro, version} -> guarda cambios

Reglas:
  · Solo se escribe si no hay errores (los avisos no bloquean).
  · La versión evita pisar cambios ajenos: si el fichero cambió en disco desde
    que se abrió (otra pestaña, un git pull, una exportación), se rechaza (409).
  · En países y conflictos el 'id' da nombre al fichero y no se cambia desde
    aquí. En eventos y territorios el nombre del fichero se deriva del año y el
    nombre: si cambian, el fichero se renombra.
  · Si un país con revisión «validado» cambia gobernantes, población o nombres
    por época, su marca pasa a «borrador» (hay que volver a revisarlo).
Solo librería estándar.
"""
import difflib
import hashlib
import json
import os
import re
import sys
import threading

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "fuentes"))
sys.path.insert(0, AQUI)
from comun import (COLECCIONES, DATOS, HOY, RAIZ, _leer_json, _nombre_fichero,  # noqa: E402
                   compilar_web, hash_revision, texto_canonico)
import validar as V  # noqa: E402

FICHERO_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.json$")
escritura = threading.Lock()   # una escritura a la vez
_geo_lock = threading.Lock()
_nombres_geo = None            # nombres de los GeoJSON (NAME/SUBJECTO), se cargan una vez


class ErrorFicha(Exception):
    def __init__(self, msg, codigo=400, **extra):
        super().__init__(msg)
        self.codigo = codigo
        self.extra = extra


# --- rutas y lectura ---------------------------------------------------------

def _ruta(col, fichero=None):
    if col not in COLECCIONES:
        raise ErrorFicha(f"colección desconocida: {col!r}", 404)
    carpeta = os.path.join(DATOS, col)
    if fichero is None:
        return carpeta
    if not FICHERO_RE.match(fichero or ""):
        raise ErrorFicha(f"nombre de fichero no válido: {fichero!r}", 400)
    return os.path.join(carpeta, fichero)


def _huella(texto):
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:12]


def _leer_texto(ruta):
    with open(ruta, encoding="utf-8", newline="") as f:
        return f.read()


def esquemas():
    V.errores.clear(); V.avisos.clear()
    return V.cargar_esquemas()


def _detalle(col, r):
    def a(v):
        if not isinstance(v, int):
            return "?"
        return f"{-v} a. C." if v < 0 else str(v)
    if col == "paises":
        return r.get("id", "")
    if col == "conflictos":
        return f"{a(r.get('inicio'))}–{a(r.get('fin'))}"
    if col == "eventos":
        return a(r.get("anio")) + (f"–{a(r['hasta'])}" if isinstance(r.get("hasta"), int) else "")
    return f"{r.get('pais', '?')} · desde {a(r.get('desde'))}"


def listar(col):
    carpeta = _ruta(col)
    out = []
    for fn in sorted(os.listdir(carpeta)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        try:
            r = _leer_json(os.path.join(carpeta, fn))
        except ValueError as e:
            out.append({"fichero": fn, "titulo": fn, "detalle": f"JSON inválido: {e}", "roto": True})
            continue
        out.append({"fichero": fn, "titulo": r.get("nombre") or r.get("id") or fn, "detalle": _detalle(col, r)})
    out.sort(key=lambda x: x["titulo"].lower())
    return out


def leer(col, fichero):
    ruta = _ruta(col, fichero)
    if not os.path.exists(ruta):
        raise ErrorFicha(f"no existe {col}/{fichero}", 404)
    texto = _leer_texto(ruta)
    try:
        registro = json.loads(texto)
    except json.JSONDecodeError as e:
        raise ErrorFicha(f"{col}/{fichero} no es JSON válido (línea {e.lineno}): corrígelo a mano", 422)
    return {"coleccion": col, "fichero": fichero, "registro": registro, "version": _huella(texto)}


# --- validación --------------------------------------------------------------

def nombres_geo():
    """Nombres NAME/SUBJECTO de todos los mapas (para avisar de 'nombres' que no
    existen). Se leen una sola vez: son ~70 MB de GeoJSON."""
    global _nombres_geo
    with _geo_lock:
        if _nombres_geo is None:
            nombres = set()
            if os.path.isdir(V.GEOJSON_DIR):
                for fn in os.listdir(V.GEOJSON_DIR):
                    if re.match(r"world_(bc)?\d+\.geojson$", fn):
                        try:
                            with open(os.path.join(V.GEOJSON_DIR, fn), encoding="utf-8") as f:
                                for ft in json.load(f).get("features", []):
                                    p = ft.get("properties", {})
                                    nombres.update(p[k] for k in ("NAME", "SUBJECTO") if p.get(k))
                        except Exception:  # noqa: BLE001 — un mapa roto no debe impedir editar
                            pass
            _nombres_geo = nombres
        return _nombres_geo


def limpiar(v):
    """Quita lo vacío que deja un formulario: cadenas en blanco, listas y objetos
    vacíos, null. Un 'hasta' vacío significa «sin fin», igual que ausente."""
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            x = limpiar(x)
            if x is None or x == "" or x == [] or x == {}:
                continue
            out[k] = x
        return out
    if isinstance(v, list):
        return [x for x in (limpiar(x) for x in v) if not (x is None or x == "" or x == {})]
    if isinstance(v, str):
        return v.strip()
    return v


def _rangos(donde, lista, a="desde", b="hasta", etiqueta="nombre"):
    for x in lista or []:
        if isinstance(x, dict) and isinstance(x.get(a), int) and isinstance(x.get(b), int) and x[a] > x[b]:
            V.err(f"{donde} «{x.get(etiqueta, '?')}»", f"'{a}' ({x[a]}) es posterior a '{b}' ({x[b]})")


def comprobar(col, reg):
    """Errores y avisos de UNA ficha: esquema + coherencia de años, coordenadas,
    polígonos, fuentes y nombres de los mapas. Reutiliza las funciones de validar.py."""
    V.errores.clear(); V.avisos.clear()
    etiqueta = reg.get("id") or reg.get("nombre") or "?"
    donde = f"{col}/{etiqueta}"
    sch = V.cargar_esquemas().get(col)
    if sch:
        V.comprueba_esquema(donde, reg, sch)
    for a, b in (("desde", "hasta"), ("inicio", "fin"), ("anio", "hasta")):
        if isinstance(reg.get(a), int) and isinstance(reg.get(b), int) and reg[a] > reg[b]:
            V.err(donde, f"'{a}' ({reg[a]}) es posterior a '{b}' ({reg[b]})")
    if col == "paises":
        _rangos(donde + " gobernante", reg.get("gobernantes"))
        _rangos(donde + " nombre por época", reg.get("nombres_periodo"))
        _rangos(donde + " escudo", reg.get("escudos"), etiqueta="archivo")
        _rangos(donde + " bandera", reg.get("banderas"), etiqueta="archivo")
        geo = nombres_geo()
        nombres = [n for n in reg.get("nombres", []) if isinstance(n, str)]
        desconocidos = [n for n in nombres if n not in geo]
        if geo and nombres and desconocidos:
            msg = (f"estos 'nombres' no aparecen en ningún mapa: {desconocidos}. Deben ser los nombres "
                   "EXACTOS de los GeoJSON; los alias en español van en 'relacionados'")
            (V.err if len(desconocidos) == len(nombres) else V.aviso)(donde, msg)
    if col == "conflictos":
        _rangos(donde + " batalla", reg.get("batallas"), "anio", "hasta")
        _rangos(donde + " zona", reg.get("zonas"))
        for z in reg.get("zonas", []) or []:
            if isinstance(z, dict) and "poligono" in z:
                V.valida_poligono(f"{donde} zona «{z.get('nombre', '?')}»", z["poligono"])
    # las coordenadas sueltas (lat/lng de eventos, territorios y batallas) ya las
    # acota el esquema (mínimo/máximo); aquí solo los polígonos
    if col == "territorios" and "poligono" in reg:
        V.valida_poligono(donde + " poligono", reg["poligono"])
    V.valida_fuentes(donde, reg)
    return list(V.errores), list(V.avisos)


def _preparar(col, reg, fichero_actual):
    """Limpia, ajusta la revisión y decide el fichero de destino. Devuelve
    (registro, fichero_destino, avisos_extra)."""
    if not isinstance(reg, dict):
        raise ErrorFicha("'registro' debe ser un objeto JSON")
    reg = limpiar(reg)
    extra = []
    if col == "paises":
        rev = reg.get("revision")
        if isinstance(rev, dict) and rev.get("hash") and rev["hash"] != hash_revision(reg):
            reg["revision"] = {**rev, "estado": "borrador", "fecha": HOY, "por": "editor",
                               "hash": hash_revision(reg)}
            if rev.get("estado") == "validado":
                extra.append(f"  ⚠ [{col}/{reg.get('id')}] cambian gobernantes/población/nombres por época: "
                             "la marca de revisión pasa de «validado» a «borrador»")
    destino = _nombre_fichero(col, reg)
    if not FICHERO_RE.match(destino):
        raise ErrorFicha(f"no se puede derivar un nombre de fichero válido ({destino!r}); revisa id/nombre")
    if fichero_actual and col in ("paises", "conflictos") and destino != fichero_actual:
        raise ErrorFicha(f"el 'id' no se puede cambiar desde el asistente (el fichero es {fichero_actual}); "
                         "crea una ficha nueva si es otra entidad")
    if destino != fichero_actual:
        # alta o renombrado (evento/territorio): no pisar otra ficha
        if col in ("paises", "conflictos"):
            if os.path.exists(_ruta(col, destino)):
                raise ErrorFicha(f"ya existe una ficha con id «{reg.get('id')}» ({col}/{destino})", 409)
        else:
            base, i = destino[:-5], 2
            while os.path.exists(_ruta(col, destino)):
                destino, i = f"{base}-{i}.json", i + 1
    return reg, destino, extra


def validar(col, reg, fichero_actual=None):
    """Simulación completa del guardado: no escribe nada."""
    if fichero_actual is not None:
        _ruta(col, fichero_actual)
    reg, destino, extra = _preparar(col, reg, fichero_actual)
    errores, avisos = comprobar(col, reg)
    nuevo = texto_canonico(col, reg)
    antes = ""
    if fichero_actual and os.path.exists(_ruta(col, fichero_actual)):
        antes = _leer_texto(_ruta(col, fichero_actual))
    diff = "".join(difflib.unified_diff(
        antes.splitlines(True), nuevo.splitlines(True),
        fromfile=f"datos/{col}/{fichero_actual}" if fichero_actual else "/dev/null",
        tofile=f"datos/{col}/{destino}", n=2))
    return {"errores": errores, "avisos": avisos + extra, "fichero": destino,
            "diff": diff, "sin_cambios": bool(fichero_actual) and antes == nuevo}


def guardar(col, reg, fichero_actual=None, version=None):
    with escritura:
        if fichero_actual:
            ruta_actual = _ruta(col, fichero_actual)
            if not os.path.exists(ruta_actual):
                raise ErrorFicha(f"{col}/{fichero_actual} ya no existe (¿se borró o renombró?)", 409)
            if version != _huella(_leer_texto(ruta_actual)):
                raise ErrorFicha("la ficha ha cambiado en disco desde que la abriste; recárgala y repite "
                                 "los cambios (no se ha escrito nada)", 409)
        res = validar(col, reg, fichero_actual)
        if res["errores"]:
            raise ErrorFicha("hay errores: corrígelos antes de guardar", 400, **res)
        if res["sin_cambios"]:
            return {**res, "guardado": False, "version": version}
        reg2, destino, _ = _preparar(col, reg, fichero_actual)
        texto = texto_canonico(col, reg2)
        os.makedirs(_ruta(col), exist_ok=True)
        with open(_ruta(col, destino), "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        if fichero_actual and destino != fichero_actual:
            os.remove(_ruta(col, fichero_actual))
        try:
            compilar_web()
            recompilado = True
        except Exception:  # noqa: BLE001 — el fichero ya está bien escrito; otro fichero roto no lo invalida
            recompilado = False
        return {**res, "guardado": True, "fichero": destino, "version": _huella(texto),
                "recompilado": recompilado,
                "ruta": os.path.relpath(_ruta(col, destino), RAIZ).replace(os.sep, "/")}
