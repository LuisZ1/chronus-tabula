#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Traducción de las páginas estáticas (portada, colaborar, fuentes, aviso legal).

    python api/traducir_paginas.py --marcar             # añade data-i18n-* a los textos nuevos
    python api/traducir_paginas.py --estado             # cobertura de cada idioma
    python api/traducir_paginas.py --pendientes en [--salida f.json]
    python api/traducir_paginas.py --importar en f.json

El español es el idioma fuente: el texto vive en el HTML. Cada elemento con texto
lleva un atributo con su clave, que es la página y una huella corta del texto
español la primera vez que se marcó:

    <p class="lema" data-i18n-html="index.3f9a1c">Fronteras, gobernantes…</p>
    <img alt="…" data-i18n-alt="index.a01b2c">

Las traducciones van en web/i18n/paginas.<idioma>.json, {clave: {"t": …, "src": …}},
donde 'src' es la huella del español del que sale: si el texto del HTML cambia, la
traducción queda desactualizada y --estado lo dice. js/idioma.js las aplica en el
navegador (y restaura el español al volver a él). Los textos que escriben los
scripts de las páginas (portada.js, fuentes.js) usan claves explícitas en el mismo
fichero (p. ej. «fuentes.js.libros») y se añaden con --importar.
"""
import argparse
import hashlib
import json
import os
import re
import sys

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita beautifulsoup4: pip install beautifulsoup4")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "web")
I18N = os.path.join(WEB, "i18n")
PAGINAS = {"index.html": "index", "colaborar.html": "colaborar", "fuentes.html": "fuentes",
           "aviso-legal.html": "legal"}
BLOQUES = {"h1", "h2", "h3", "h4", "p", "li", "dt", "dd", "summary", "th", "td", "figcaption",
           "caption", "blockquote", "legend", "label"}
SUELTOS = {"a", "button", "span", "strong", "em", "b", "small", "option", "div", "cite"}
NUNCA = {"script", "style", "svg", "pre", "noscript", "code", "kbd", "select", "template"}
ATRIBUTOS = ("alt", "title", "aria-label", "placeholder")
SOLO_SIMBOLOS = re.compile(r"^[\s\d.,:;·•–—\-+%()→←↗#/|×✕?!«»\"'*]*$")
MARCA = {"Chronus Tabula", "GitHub", "GitHub ↗"}


def huella(texto):
    return hashlib.sha1(" ".join(str(texto).split()).encode("utf-8")).hexdigest()[:6]


def texto_de(tag):
    return " ".join(tag.get_text(" ").split())


def excluido(tag):
    for p in [tag] + list(tag.parents):
        if getattr(p, "name", None) in NUNCA or (hasattr(p, "get") and p.get("translate") == "no"):
            return True
        if hasattr(p, "get") and p.get("data-i18n-no") is not None:
            return True
    return False


def contenido(tag):
    """HTML interior del elemento, normalizado (el que se traduce)."""
    return " ".join(tag.decode_contents().split())


INTERACTIVOS = ["button", "input", "select", "textarea", "picture", "img", "details"]


def interactivo_dentro(tag):
    """¿Tiene dentro algo que un script usa o escucha? Entonces no se sustituye su
    contenido entero (se perderían los manejadores): se traducen sus partes."""
    if tag.find(INTERACTIVOS):
        return True
    return any(d.get("id") or d.get("data-i18n-no") is not None for d in tag.find_all(True))


def candidatos(soup):
    """[(tag, tipo, texto)] de los textos traducibles, tengan ya clave o no."""
    out = []
    elegidos = []

    def dentro(tag):
        return any(e in tag.parents for e in elegidos)

    for tag in soup.find_all(True):
        if excluido(tag) or dentro(tag):
            continue
        txt = texto_de(tag)
        if not txt or SOLO_SIMBOLOS.match(txt) or txt in MARCA:
            continue
        if tag.find(list(BLOQUES)) is not None or interactivo_dentro(tag):
            continue
        if tag.name in BLOQUES:
            out.append((tag, "html", contenido(tag)))
            elegidos.append(tag)
        elif tag.name in SUELTOS:
            directo = "".join(str(c) for c in tag.contents if isinstance(c, NavigableString)).strip()
            if directo or tag.name != "div":
                out.append((tag, "html", contenido(tag)))
                elegidos.append(tag)
    for tag in soup.find_all(True):
        if excluido(tag):
            continue
        for a in ATRIBUTOS:
            v = tag.get(a)
            if v and not SOLO_SIMBOLOS.match(v) and v not in MARCA and not str(v).startswith(("http", "#")):
                out.append((tag, a, v))
    return out


def atributo_clave(tipo):
    return {"html": "data-i18n-html", "alt": "data-i18n-alt", "title": "data-i18n-title",
            "aria-label": "data-i18n-aria", "placeholder": "data-i18n-placeholder"}[tipo]


def marcar(fn, pref):
    """Añade las claves que falten insertando el atributo en el HTML original, sin
    reescribir nada más (BeautifulSoup solo localiza la etiqueta)."""
    ruta = os.path.join(WEB, fn)
    with open(ruta, encoding="utf-8") as f:
        fuente = f.read()
    soup = BeautifulSoup(fuente, "html.parser")
    lineas = fuente.split("\n")
    inicio = [0]
    for l in lineas:
        inicio.append(inicio[-1] + len(l) + 1)
    inserciones = []
    for tag, tipo, texto in candidatos(soup):
        attr = atributo_clave(tipo)
        if tag.get(attr):
            continue
        pos = inicio[tag.sourceline - 1] + tag.sourcepos + 1 + len(tag.name)
        inserciones.append((pos, f' {attr}="{pref}.{huella(texto)}"'))
    for pos, txt in sorted(set(inserciones), reverse=True):
        fuente = fuente[:pos] + txt + fuente[pos:]
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(fuente)
    return len(inserciones)


def fuentes_es():
    """{clave: texto español} de todas las páginas (lo marcado)."""
    out = {}
    for fn in PAGINAS:
        with open(os.path.join(WEB, fn), encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        for tag, tipo, texto in candidatos(soup):
            k = tag.get(atributo_clave(tipo))
            if k:
                out[k] = texto
        # título y descripción de la página
        pref = PAGINAS[fn]
        if soup.title:
            out[f"{pref}.titulo"] = soup.title.get_text().strip()
        d = soup.find("meta", attrs={"name": "description"})
        if d:
            out[f"{pref}.descripcion"] = d.get("content", "")
    return out


def ruta_cat(lang):
    return os.path.join(I18N, f"paginas.{lang}.json")


def cargar(lang):
    r = ruta_cat(lang)
    return json.load(open(r, encoding="utf-8")) if os.path.exists(r) else {}


def guardar(lang, cat):
    lineas = [f"\t{json.dumps(k, ensure_ascii=False)}: {json.dumps(cat[k], ensure_ascii=False)}" for k in sorted(cat)]
    with open(ruta_cat(lang), "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n" + ",\n".join(lineas) + "\n}\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--marcar", action="store_true")
    ap.add_argument("--estado", action="store_true")
    ap.add_argument("--pendientes")
    ap.add_argument("--importar", nargs=2)
    ap.add_argument("--salida")
    a = ap.parse_args()
    if a.marcar:
        for fn, pref in PAGINAS.items():
            print(f"{fn}: {marcar(fn, pref)} texto(s) marcado(s)")
        return 0
    es = fuentes_es()
    if a.estado:
        langs = sorted(f[8:-5] for f in os.listdir(I18N) if f.startswith("paginas.") and f.endswith(".json"))
        for lang in langs:
            cat = cargar(lang)
            ok = [k for k in es if k in cat and cat[k].get("src") == huella(es[k])]
            des = [k for k in es if k in cat and cat[k].get("src") and cat[k]["src"] != huella(es[k])]
            falta = [k for k in es if k not in cat]
            print(f"{lang}: {len(ok)}/{len(es)} textos traducidos · {len(des)} desactualizados · {len(falta)} sin traducir")
        return 0
    if a.pendientes:
        cat = cargar(a.pendientes)
        out = {k: v for k, v in es.items() if k not in cat or cat[k].get("src") != huella(v)}
        txt = json.dumps(out, ensure_ascii=False, indent="\t") + "\n"
        if a.salida:
            open(a.salida, "w", encoding="utf-8").write(txt)
            print(f"✔ {len(out)} texto(s) pendientes en {a.salida}")
        else:
            sys.stdout.write(txt)
        return 0
    if a.importar:
        lang, fichero = a.importar
        nuevos = json.load(open(fichero, encoding="utf-8"))
        cat = cargar(lang)
        n = 0
        for k, v in nuevos.items():
            t = v.get("t") if isinstance(v, dict) else v
            if not t:
                continue
            e = {"t": t}
            if k in es:
                e["src"] = huella(es[k])
            cat[k] = e
            n += 1
        guardar(lang, cat)
        print(f"✔ {n} traducción(es) en web/i18n/paginas.{lang}.json")
        return 0
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
