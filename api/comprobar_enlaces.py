#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprueba que los enlaces a Wikipedia de las fuentes llevan a un artículo que existe.

    python api/comprobar_enlaces.py            # informa de enlaces rotos y páginas de desambiguación
    python api/comprobar_enlaces.py --todo     # lista también las redirecciones

Recorre datos/, api/correcciones/ y los scripts de api/, reúne las URL de
es.wikipedia.org y en.wikipedia.org y las consulta en bloques de 50 títulos con la
API de MediaWiki (action=query, redirects=1, pageprops=disambiguation). Informa de:

  ✘  títulos que no existen (p. ej. «Canato_ávaro» cuando el artículo es «Kanato_ávaro»);
  ?  páginas de desambiguación (el enlace no lleva a un artículo concreto);
  →  redirecciones (funcionan; solo con --todo).

Devuelve código 1 si hay algún ✘ o ?. Necesita conexión a Internet (no forma parte de
validar.py, que funciona sin red). Solo usa la biblioteca estándar.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATRON = re.compile(r"https?://(es|en)\.wikipedia\.org/wiki/([^\s\"'<>;,]+)")
AGENTE = "ChronusTabula-comprobar-enlaces/1.0 (https://github.com/LuisZ1/chronus-tabula)"


def ficheros():
    for carpeta in ("datos", os.path.join("api", "correcciones")):
        for r, _, fs in os.walk(os.path.join(RAIZ, carpeta)):
            for f in fs:
                if f.endswith(".json"):
                    yield os.path.join(r, f)
    for f in sorted(os.listdir(os.path.join(RAIZ, "api"))):
        if f.endswith(".py"):
            yield os.path.join(RAIZ, "api", f)


def titulo(crudo):
    while crudo.endswith(")") and crudo.count("(") < crudo.count(")"):
        crudo = crudo[:-1]  # paréntesis de cierre que no es de la URL
    return urllib.parse.unquote(crudo).split("#")[0].replace("_", " ")


def reunir():
    donde = {}
    for ruta in ficheros():
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        for lang, crudo in PATRON.findall(texto):
            donde.setdefault((lang, titulo(crudo)), set()).add(os.path.relpath(ruta, RAIZ))
    return donde


def consultar(lang, titulos):
    url = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
           f"&prop=pageprops&ppprop=disambiguation&titles=" + urllib.parse.quote("|".join(titulos)))
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=30) as r:
        q = json.load(r)["query"]
    norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
    redir = {}
    for x in q.get("redirects", []):
        redir[x["to"]] = norm.get(x["from"], x["from"])
    faltan, desamb, redirige = [], [], {}
    for x in q.get("redirects", []):
        redirige[norm.get(x["from"], x["from"])] = x["to"]
    for p in q.get("pages", {}).values():
        original = redir.get(p["title"], norm.get(p["title"], p["title"]))
        if "missing" in p or "invalid" in p:
            faltan.append(original)
        elif "disambiguation" in p.get("pageprops", {}):
            desamb.append(original)
    return faltan, desamb, redirige


def main():
    todo = "--todo" in sys.argv
    donde = reunir()
    por_lang = {}
    for lang, t in donde:
        por_lang.setdefault(lang, []).append(t)
    malos = 0
    for lang, lista in sorted(por_lang.items()):
        lista.sort()
        print(f"{lang}.wikipedia.org: {len(lista)} artículos enlazados")
        for i in range(0, len(lista), 50):
            faltan, desamb, redirige = consultar(lang, lista[i:i + 50])
            for t in faltan:
                malos += 1
                print(f"  ✘ {t}  ·  {', '.join(sorted(donde[(lang, t)]))}")
            for t in desamb:
                malos += 1
                print(f"  ? {t} (desambiguación)  ·  {', '.join(sorted(donde[(lang, t)]))}")
            if todo:
                for a, b in sorted(redirige.items()):
                    print(f"  → {a} ⇒ {b}")
            time.sleep(0.2)
    if malos:
        print(f"\n{malos} enlace(s) que no llevan a un artículo: corrígelos con el título exacto de Wikipedia")
        return 1
    print("✔ todos los enlaces a Wikipedia llevan a un artículo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
