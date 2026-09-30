#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gestión de las traducciones de los datos (catálogos datos/i18n/<idioma>.json).

    python api/traducciones.py --estado                  # cobertura de cada idioma
    python api/traducciones.py --pendientes en           # exporta lo que falta o está desactualizado
            [--solo nombres|textos] [--max N] [--salida fichero.json]
    python api/traducciones.py --importar en fichero.json   # incorpora traducciones
    python api/traducciones.py --limpiar en              # retira claves que ya no existen
    python api/traducciones.py --nuevo fr                # crea el catálogo de un idioma nuevo

El español es el idioma fuente (las fichas de datos/). Cada traducción guarda la
huella del texto español del que sale ('src'): si el español cambia, la traducción
pasa a «desactualizada» y vuelve a salir en --pendientes. Los nombres de los mapas
base (claves mapa:…) vienen en inglés, así que también se traducen al español
(es.json) y --pendientes es los lista.

El fichero de --pendientes es {clave: {"es": texto español, "t": traducción actual o ""}};
se rellena "t" y se devuelve con --importar (acepta también {clave: "texto"}).
Tras importar: python api/formatear.py --check, python api/validar.py y
python api/compilar.py (genera web/data/historia.<idioma>.json).
Para añadir un idioma a la web: --nuevo xx y traducir; la interfaz, con api/traducir_interfaz.py --nuevo xx
(textos de la interfaz) y su opción en el selector de mapa.html (ver CONTRIBUTING).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import cargar_historia, cargar_geonombres  # noqa: E402
import traduccion as T  # noqa: E402


def barra(p, ancho=24):
    llenos = round(p * ancho)
    return "█" * llenos + "░" * (ancho - llenos)


def cmd_estado(d):
    geo = cargar_geonombres()
    langs = [T.IDIOMA_FUENTE] + T.idiomas()
    for lang in langs:
        cat = T.cargar_catalogo(lang)
        mapa = {k for k in cat if k.startswith("mapa:")}
        m_ok = len({f"mapa:{n}" for n in geo} & mapa)
        print(f"\n{lang}  ({T.ruta_catalogo(lang).replace(os.sep, '/').split('/datos/')[-1]})")
        if lang == T.IDIOMA_FUENTE:
            print(f"  nombres de los mapas  {barra(m_ok / max(1, len(geo)))} {m_ok}/{len(geo)}")
            continue
        est = T.estado(d, lang, cat)
        for etiqueta, largo in (("nombres y textos cortos", False), ("descripciones y reseñas", True)):
            tot = [x for g in ("ok", "falta", "desactualizada") for x in est[g] if T.es_texto_largo(x[0]) == largo]
            ok = [x for x in est["ok"] if T.es_texto_largo(x[0]) == largo]
            des = [x for x in est["desactualizada"] if T.es_texto_largo(x[0]) == largo]
            print(f"  {etiqueta:<22} {barra(len(ok) / max(1, len(tot)))} {len(ok)}/{len(tot)}"
                  + (f"  · {len(des)} desactualizada(s)" if des else ""))
        print(f"  nombres de los mapas   (solo los que difieren del original: {len(mapa)})")
        if est["huerfanas"]:
            print(f"  ⚠ {len(est['huerfanas'])} clave(s) huérfana(s): --limpiar {lang}")
    return 0


def cmd_pendientes(d, lang, solo, maximo, salida):
    cat = T.cargar_catalogo(lang)
    out = {}
    if lang == T.IDIOMA_FUENTE:
        for n in sorted(cargar_geonombres()):
            if f"mapa:{n}" not in cat:
                out[f"mapa:{n}"] = {"es": n, "t": ""}
    else:
        est = T.estado(d, lang, cat)
        for clave, texto in est["desactualizada"] + est["falta"]:
            if solo == "nombres" and T.es_texto_largo(clave):
                continue
            if solo == "textos" and not T.es_texto_largo(clave):
                continue
            out[clave] = {"es": texto, "t": (cat.get(clave) or {}).get("t", "")}
    if maximo:
        out = dict(list(out.items())[:maximo])
    texto = json.dumps(out, ensure_ascii=False, indent="\t") + "\n"
    if salida:
        with open(salida, "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        print(f"✔ {len(out)} texto(s) pendientes de '{lang}' en {salida}")
    else:
        sys.stdout.write(texto)
    return 0


def cmd_importar(d, lang, fichero):
    with open(fichero, encoding="utf-8") as f:
        nuevos = json.load(f)
    fuente = dict(T.unidades(d))
    cat = T.cargar_catalogo(lang)
    n = 0
    desconocidas = []
    for clave, v in nuevos.items():
        t = v.get("t") if isinstance(v, dict) else v
        if not isinstance(t, str) or not t.strip():
            continue
        if clave.startswith("mapa:"):
            cat[clave] = {"t": t.strip()}
        elif clave.startswith("txt:") and "@" in clave and clave.rsplit("@", 1)[0] in fuente:
            cat[clave] = {"t": t.strip()}
        elif clave in fuente:
            e = {"t": t.strip()}
            if not clave.startswith("txt:"):
                e["src"] = T.huella(fuente[clave])
            cat[clave] = e
        else:
            desconocidas.append(clave)
            continue
        n += 1
    T.guardar_catalogo(lang, cat)
    print(f"✔ {n} traducción(es) incorporada(s) a datos/i18n/{lang}.json")
    if desconocidas:
        print(f"⚠ {len(desconocidas)} clave(s) que no corresponden a ningún texto, no importadas: {desconocidas[:10]}")
    return 0


def cmd_limpiar(d, lang):
    cat = T.cargar_catalogo(lang)
    est = T.estado(d, lang, cat)
    for k in est["huerfanas"]:
        del cat[k]
    T.guardar_catalogo(lang, cat)
    print(f"✔ {len(est['huerfanas'])} clave(s) retirada(s) de datos/i18n/{lang}.json")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--estado", action="store_true")
    g.add_argument("--pendientes", metavar="IDIOMA")
    g.add_argument("--importar", nargs=2, metavar=("IDIOMA", "FICHERO"))
    g.add_argument("--limpiar", metavar="IDIOMA")
    g.add_argument("--nuevo", metavar="IDIOMA")
    ap.add_argument("--solo", choices=("nombres", "textos"))
    ap.add_argument("--max", type=int, default=0)
    ap.add_argument("--salida")
    a = ap.parse_args()
    d = cargar_historia()
    if a.estado:
        return cmd_estado(d)
    if a.pendientes:
        return cmd_pendientes(d, a.pendientes, a.solo, a.max, a.salida)
    if a.importar:
        return cmd_importar(d, *a.importar)
    if a.limpiar:
        return cmd_limpiar(d, a.limpiar)
    if a.nuevo:
        if os.path.exists(T.ruta_catalogo(a.nuevo)):
            print(f"✘ ya existe datos/i18n/{a.nuevo}.json")
            return 1
        T.guardar_catalogo(a.nuevo, {})
        print(f"✔ datos/i18n/{a.nuevo}.json creado. Siguiente: python api/traducciones.py --pendientes {a.nuevo}")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
