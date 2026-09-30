#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Textos de la interfaz: el mapa y las páginas (portada, colaborar, fuentes, aviso legal).

    python api/traducir_interfaz.py --sincronizar          # claves a los textos nuevos del HTML y es.json al día
    python api/traducir_interfaz.py --estado               # cobertura de cada idioma
    python api/traducir_interfaz.py --pendientes en [--salida f.json]
    python api/traducir_interfaz.py --importar en f.json   # incorpora traducciones (mismo árbol que es.json)
    python api/traducir_interfaz.py --confirmar en [clave…] # da por buenas traducciones editadas a mano
    python api/traducir_interfaz.py --nuevo fr             # crea el catálogo de un idioma nuevo

Un catálogo por idioma, web/i18n/<idioma>.json, con el mismo árbol en todos:

    {"comun": {"abrirMapa": "…", "enlaces": {…}},    textos que comparten las páginas
     "mapa": {"ui": {…}, "popup": {…}},              la aplicación (mapa.html)
     "index": {"meta": {…}, "portada": {…}, …},      una rama por página y dentro por sección
     "colaborar": {…}, "fuentes": {…}, "legal": {…}}

es.json es la referencia. En las páginas, el español está escrito en el HTML y cada
elemento lleva su clave (data-i18n, o data-i18n-alt, -title, -aria, -placeholder para
atributos); --sincronizar copia esos textos a es.json y pone clave a los que no la
tienen. El resto de es.json (la rama «mapa» y los textos que escriben los scripts de
las páginas) se edita a mano.

Para traducir basta con copiar el árbol de es.json y cambiar los valores. Para saber si
una traducción se ha quedado vieja, api/i18n/huellas.<idioma>.json guarda la huella del
español del que salió cada una (lo escriben --importar y --confirmar); si el español
cambia, --estado la marca como desactualizada.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:  # pragma: no cover
    sys.exit("Este script necesita beautifulsoup4: pip install beautifulsoup4")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "web")
I18N = os.path.join(WEB, "i18n")
HUELLAS = os.path.join(RAIZ, "api", "i18n")
FUENTE = "es"
PAGINAS = {"index.html": "index", "colaborar.html": "colaborar", "fuentes.html": "fuentes",
           "aviso-legal.html": "legal"}
ORDEN = ["comun", "mapa", "index", "colaborar", "fuentes", "legal"]
# atributo con la clave → atributo que traduce (None: el contenido del elemento)
ATRIBUTOS = {"data-i18n": None, "data-i18n-alt": "alt", "data-i18n-title": "title",
             "data-i18n-aria": "aria-label", "data-i18n-placeholder": "placeholder"}
TRADUCIBLES = {v: k for k, v in ATRIBUTOS.items() if v}
BLOQUES = {"h1", "h2", "h3", "h4", "p", "li", "dt", "dd", "summary", "th", "td", "figcaption",
           "caption", "blockquote", "legend", "label"}
SUELTOS = {"a", "button", "span", "strong", "em", "b", "small", "option", "div", "cite"}
NUNCA = {"script", "style", "svg", "pre", "noscript", "code", "kbd", "select", "template"}
INTERACTIVOS = ["button", "input", "select", "textarea", "picture", "img", "details"]
SOLO_SIMBOLOS = re.compile(r"^[\s\d.,:;·•–—\-+%()→←↗#/|×✕?!«»\"'*]*$")
MARCA = {"Chronus Tabula", "GitHub", "GitHub ↗"}
ZONAS = {"header": "cabecera", "footer": "pie", "nav": "menu"}


# ------------------------------------------------------------ utilidades

def huella(texto):
    return hashlib.sha1(" ".join(str(texto).split()).encode("utf-8")).hexdigest()[:8]


def aplanar(arbol, pref=""):
    out = {}
    for k, v in arbol.items():
        clave = f"{pref}{k}"
        if isinstance(v, dict):
            out.update(aplanar(v, clave + "."))
        else:
            out[clave] = v
    return out


def poner(arbol, clave, valor):
    partes = clave.split(".")
    nodo = arbol
    for p in partes[:-1]:
        sig = nodo.setdefault(p, {})
        if not isinstance(sig, dict):
            raise ValueError(f"«{clave}»: «{p}» ya es un texto, no puede tener claves dentro")
        nodo = sig
    if isinstance(nodo.get(partes[-1]), dict):
        raise ValueError(f"«{clave}» ya es un grupo de claves, no puede ser un texto")
    nodo[partes[-1]] = valor


def anidar(plano, orden=None):
    """Árbol a partir de {clave.con.puntos: texto}, en el orden de 'orden' (otra lista de
    claves planas, normalmente las de es.json) y lo demás detrás."""
    arbol = {}
    claves = [k for k in (orden or []) if k in plano] + [k for k in plano if k not in set(orden or [])]
    for k in claves:
        poner(arbol, k, plano[k])
    # ramas de primer nivel en el orden de siempre
    return {k: arbol[k] for k in sorted(arbol, key=lambda r: (ORDEN.index(r) if r in ORDEN else len(ORDEN), r))}


def ruta_cat(lang):
    return os.path.join(I18N, f"{lang}.json")


def ruta_huellas(lang):
    return os.path.join(HUELLAS, f"huellas.{lang}.json")


def leer(ruta):
    if not os.path.exists(ruta):
        return {}
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def escribir(ruta, obj):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent="\t") + "\n")


def idiomas():
    return sorted(f[:-5] for f in os.listdir(I18N) if re.fullmatch(r"[a-z]{2,3}\.json", f))


# ------------------------------------------------------------ el HTML

def contenido(tag):
    return " ".join(tag.decode_contents().split())


def texto_de(tag):
    return " ".join(tag.get_text(" ").split())


def excluido(tag):
    for p in [tag] + list(tag.parents):
        if getattr(p, "name", None) in NUNCA:
            return True
        if hasattr(p, "get") and (p.get("translate") == "no" or p.get("data-i18n-no") is not None):
            return True
    return False


def con_clave(tag):
    return any(tag.get(a) for a in ATRIBUTOS)


def no_sustituible(tag):
    """¿Tiene dentro algo que un script usa o escucha, o textos que ya llevan su clave?
    Entonces no se sustituye su contenido entero: se traducen sus partes."""
    if tag.find(INTERACTIVOS):
        return True
    return any(d.get("id") or d.get("data-i18n-no") is not None or con_clave(d) for d in tag.find_all(True))


def candidatos(soup):
    """[(tag, atributo de la clave, texto)] de los textos traducibles, con clave o sin ella."""
    out, elegidos = [], []
    for tag in soup.find_all(True):
        if excluido(tag) or any(e in tag.parents for e in elegidos):
            continue
        if tag.get("data-i18n"):
            out.append((tag, "data-i18n", contenido(tag)))
            elegidos.append(tag)
            continue
        txt = texto_de(tag)
        if not txt or SOLO_SIMBOLOS.match(txt) or txt in MARCA:
            continue
        if tag.find(list(BLOQUES)) is not None or no_sustituible(tag):
            continue
        directo = "".join(str(c) for c in tag.contents if isinstance(c, NavigableString)).strip()
        if tag.name in BLOQUES or (tag.name in SUELTOS and (directo or tag.name != "div")):
            out.append((tag, "data-i18n", contenido(tag)))
            elegidos.append(tag)
    for tag in soup.find_all(True):
        if excluido(tag):
            continue
        for attr, marca in TRADUCIBLES.items():
            v = tag.get(attr)
            if v and not SOLO_SIMBOLOS.match(v) and v not in MARCA and not str(v).startswith(("http", "#")):
                out.append((tag, marca, v))
    return out


def sopa(fn):
    with open(os.path.join(WEB, fn), encoding="utf-8") as f:
        return BeautifulSoup(f.read(), "html.parser")


AVISADOS = set()


def textos_html():
    """{clave: texto español} de todas las páginas (lo que ya tiene clave)."""
    out = {}
    for fn, pref in PAGINAS.items():
        s = sopa(fn)
        if s.title:
            out[f"{pref}.meta.titulo"] = s.title.get_text().strip()
        d = s.find("meta", attrs={"name": "description"})
        if d:
            out[f"{pref}.meta.descripcion"] = d.get("content", "")
        for tag, marca, texto in candidatos(s):
            k = tag.get(marca)
            if not k:
                continue
            if k in out and out[k] != texto and (k, texto) not in AVISADOS:
                AVISADOS.add((k, texto))
                print(f"  ⚠ {fn}: «{k}» tiene textos distintos: «{out[k][:50]}» / «{texto[:50]}»")
            out.setdefault(k, texto)
    return out


def camel(texto, palabras=3):
    t = unicodedata.normalize("NFD", re.sub(r"<[^>]+>", " ", texto))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    ps = re.findall(r"[A-Za-z0-9]+", t)[:palabras] or ["texto"]
    s = ps[0].lower() + "".join(p.capitalize() for p in ps[1:])
    return s if not s[0].isdigit() else "t" + s


def seccion(tag):
    for p in tag.parents:
        if not hasattr(p, "get"):
            break
        if p.get("id") and p.name not in ("html", "body", "main"):
            return camel(p["id"].replace("-", " "), 4)
        if p.name in ZONAS:
            return ZONAS[p.name]
    return "general"


def marcar(fn, pref, ya):
    """Pone clave a los textos sin ella: <página>.<sección>.<primeras palabras>, o la de
    un texto igual de la misma página. Inserta el atributo sin reescribir el HTML."""
    ruta = os.path.join(WEB, fn)
    with open(ruta, encoding="utf-8") as f:
        fuente = f.read()
    s = BeautifulSoup(fuente, "html.parser")
    inicio = [0]
    for linea in fuente.split("\n"):
        inicio.append(inicio[-1] + len(linea) + 1)
    por_texto = {v: k for k, v in ya.items() if k.startswith(pref + ".") or k.startswith("comun.")}
    usadas = set(ya)
    nuevas, inserciones = [], []
    for tag, marca, texto in candidatos(s):
        if tag.get(marca):
            continue
        k = por_texto.get(texto)
        if not k:
            base = f"{pref}.{seccion(tag)}.{camel(texto)}"
            k, n = base, 2
            while k in usadas or any(u.startswith(k + ".") for u in usadas):
                k, n = f"{base}{n}", n + 1
            usadas.add(k)
            por_texto[texto] = k
            nuevas.append((k, texto))
        pos = inicio[tag.sourceline - 1] + tag.sourcepos + 1 + len(tag.name)
        inserciones.append((pos, f' {marca}="{k}"'))
    for pos, txt in sorted(set(inserciones), reverse=True):
        fuente = fuente[:pos] + txt + fuente[pos:]
    if inserciones:
        with open(ruta, "w", encoding="utf-8", newline="\n") as f:
            f.write(fuente)
    return nuevas


# ------------------------------------------------------------ órdenes

def sincronizar():
    es = leer(ruta_cat(FUENTE))
    plano = aplanar(es)
    for fn, pref in PAGINAS.items():
        for k, t in marcar(fn, pref, {**plano, **textos_html()}):
            print(f"  + {fn}: {k} = «{t[:60]}»")
    html = textos_html()
    cambios = [k for k in html if k in plano and plano[k] != html[k]]
    nuevos = [k for k in html if k not in plano]
    plano.update(html)
    escribir(ruta_cat(FUENTE), anidar(plano, list(aplanar(es))))
    for k in cambios:
        print(f"  ~ {k}: el español ha cambiado (sus traducciones quedan desactualizadas)")
    print(f"✔ web/i18n/{FUENTE}.json: {len(html)} textos de las páginas, {len(nuevos)} nuevos, {len(cambios)} cambiados")


def estado_de(lang):
    es = aplanar(leer(ruta_cat(FUENTE)))
    tr = aplanar(leer(ruta_cat(lang)))
    hu = leer(ruta_huellas(lang))
    r = {"ok": [], "desactualizadas": [], "sin_confirmar": [], "sin_traducir": [],
         "sobrantes": [k for k in tr if k not in es]}
    for k, v in es.items():
        if k not in tr or tr[k] in ("", None):
            r["sin_traducir"].append(k)
        elif k not in hu:
            r["sin_confirmar"].append(k)
        elif hu[k] != huella(v):
            r["desactualizadas"].append(k)
        else:
            r["ok"].append(k)
    return es, r


def estado():
    for lang in idiomas():
        if lang == FUENTE:
            continue
        es, r = estado_de(lang)
        print(f"{lang}: {len(r['ok'])}/{len(es)} al día · {len(r['desactualizadas'])} desactualizadas · "
              f"{len(r['sin_confirmar'])} sin confirmar · {len(r['sin_traducir'])} sin traducir · "
              f"{len(r['sobrantes'])} sobrantes")
        for nombre in ("desactualizadas", "sin_confirmar", "sobrantes"):
            for k in r[nombre][:10]:
                print(f"    {nombre.replace('_', ' ')}: {k}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sincronizar", action="store_true")
    ap.add_argument("--estado", action="store_true")
    ap.add_argument("--pendientes", metavar="IDIOMA")
    ap.add_argument("--salida")
    ap.add_argument("--importar", nargs=2, metavar=("IDIOMA", "FICHERO"))
    ap.add_argument("--confirmar", nargs="+", metavar="IDIOMA [CLAVE…]")
    ap.add_argument("--nuevo", metavar="IDIOMA")
    a = ap.parse_args()
    if a.sincronizar:
        sincronizar()
    elif a.estado:
        estado()
    elif a.pendientes:
        es, r = estado_de(a.pendientes)
        claves = r["sin_traducir"] + r["desactualizadas"] + r["sin_confirmar"]
        arbol = anidar({k: es[k] for k in claves}, list(es))
        txt = json.dumps(arbol, ensure_ascii=False, indent="\t") + "\n"
        if a.salida:
            with open(a.salida, "w", encoding="utf-8") as f:
                f.write(txt)
            print(f"✔ {len(claves)} texto(s) pendientes en {a.salida}")
        else:
            sys.stdout.write(txt)
    elif a.importar:
        lang, fichero = a.importar
        es = aplanar(leer(ruta_cat(FUENTE)))
        nuevos = aplanar(leer(fichero))
        tr = aplanar(leer(ruta_cat(lang)))
        hu = leer(ruta_huellas(lang))
        n = 0
        for k, v in nuevos.items():
            if k not in es:
                print(f"  ⚠ «{k}» no existe en {FUENTE}.json: se ignora")
                continue
            if v in ("", None):
                continue
            tr[k] = v
            hu[k] = huella(es[k])
            n += 1
        escribir(ruta_cat(lang), anidar(tr, list(es)))
        escribir(ruta_huellas(lang), dict(sorted(hu.items())))
        print(f"✔ {n} traducción(es) en web/i18n/{lang}.json")
    elif a.confirmar:
        lang, claves = a.confirmar[0], a.confirmar[1:]
        es = aplanar(leer(ruta_cat(FUENTE)))
        tr = aplanar(leer(ruta_cat(lang)))
        hu = leer(ruta_huellas(lang))
        for k in claves or [k for k in tr if k in es]:
            if k in tr and k in es:
                hu[k] = huella(es[k])
        escribir(ruta_huellas(lang), dict(sorted(hu.items())))
        escribir(ruta_cat(lang), anidar(tr, list(es)))
        print(f"✔ huellas de {lang} al día ({len(claves) or 'todas las'} clave(s))")
    elif a.nuevo:
        if os.path.exists(ruta_cat(a.nuevo)):
            sys.exit(f"✘ ya existe web/i18n/{a.nuevo}.json")
        escribir(ruta_cat(a.nuevo), {})
        print(f"✔ web/i18n/{a.nuevo}.json creado. Siguiente: python api/traducir_interfaz.py --pendientes {a.nuevo}")
    else:
        ap.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
