# -*- coding: utf-8 -*-
"""Referencias: el registro de fuentes (datos/referencias.json) y la clasificación de citas.

Una cita en una ficha es {"id": …, "url"?, "licencia"?, "consultado"?, "paginas"?}. El
'id' sigue uno de estos esquemas:

    wikipedia-<idioma>:<Título del artículo>   p. ej. wikipedia-es:Imperio otomano
    wikidata:Q<número>                          p. ej. wikidata:Q12560
    libro:<clave> · articulo:<clave> · mapa:<clave> · datos:<clave> · web:<clave>
        una entrada de datos/referencias.json, que describe la obra una sola vez
        (autor, título, editorial, año, ISBN, licencia…)
    curado                                      elaboración propia contrastada

Este módulo lo usan validar.py (esquemas y registro), compilar.py (la página de
fuentes, web/data/fuentes.json) y migraciones puntuales (normalizar()).
"""
import json
import os
import re
import urllib.parse

_AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(_AQUI))
DATOS = os.environ.get("CHRONUS_DATOS") or os.path.join(RAIZ, "datos")
REGISTRO = os.path.join(DATOS, "referencias.json")

TIPOS_REGISTRO = ("libro", "articulo", "mapa", "datos", "web")
ESQUEMA = re.compile(r"^(?:wikipedia-[a-z]{2,3}:.+|wikidata:Q\d+|(?:%s):[a-z0-9-]+|curado)$" % "|".join(TIPOS_REGISTRO))
WIKI_URL = re.compile(r"^https?://([a-z]{2,3})\.(?:m\.)?wikipedia\.org/wiki/([^?#]+)")
WD_URL = re.compile(r"wikidata\.org/wiki/(Q\d+)")


def cargar_registro():
    if not os.path.exists(REGISTRO):
        return {}
    with open(REGISTRO, encoding="utf-8") as f:
        return json.load(f)


def texto_registro(reg):
    """Formato canónico: entradas por orden de clave, campos en orden fijo, tabs."""
    orden = ["tipo", "titulo", "autor", "traductor", "editorial", "coleccion", "anio", "edicion",
             "isbn", "url", "licencia", "uso", "datos", "nota"]
    out = {}
    for k in sorted(reg):
        v = reg[k]
        pos = {c: i for i, c in enumerate(orden)}
        out[k] = {c: v[c] for c in sorted(v, key=lambda c: (pos.get(c, len(orden)), c))}
    return json.dumps(out, ensure_ascii=False, indent="\t") + "\n"


def titulo_wiki(crudo):
    return urllib.parse.unquote(crudo).replace("_", " ").split("#")[0].strip()


def url_wiki(lang, titulo):
    return f"https://{lang}.wikipedia.org/wiki/" + urllib.parse.quote(titulo.replace(" ", "_"), safe="()',:!-")


def clasificar(cita):
    """(tipo, clave) de una cita ya normalizada: tipo ∈ wikipedia, wikidata, libro,
    articulo, mapa, datos, web, curado; clave identifica la fuente concreta
    (wikipedia-es:Título, Q123, libro:clave…)."""
    i = (cita or {}).get("id", "")
    if i.startswith("wikipedia-"):
        return "wikipedia", i
    if i.startswith("wikidata:"):
        return "wikidata", i[len("wikidata:"):]
    if i == "curado":
        return "curado", "curado"
    t = i.split(":", 1)[0]
    if t in TIPOS_REGISTRO:
        return t, i
    return None, i


# ------------------------------------------------------------ fuentes de los mapas

def cita_de_texto(txt):
    """Convierte el texto libre 'fuente' de una corrección de fronteras en una cita."""
    s = str(txt or "").strip()
    m = WIKI_URL.match(s)
    if m:
        t = titulo_wiki(m.group(2))
        return {"id": f"wikipedia-{m.group(1)}:{t}", "url": url_wiki(m.group(1), t)}
    if "natural earth" in s.lower():
        return {"id": "mapa:natural-earth"}
    if "euratlas" in s.lower():
        return {"id": "mapa:euratlas"}
    if s.startswith(("revisiones/", "api/", "comprobación")):
        return {"id": "curado"}
    if s.startswith("http"):
        return {"id": "web:" + re.sub(r"[^a-z0-9]+", "-", urllib.parse.urlparse(s).netloc.lower()).strip("-"), "url": s}
    return {"id": "curado"}


# ------------------------------------------------------------ migración

LIBROS = {
    "breve historia del imperio otomano": "libro:romero-imperio-otomano",
    "breve historia de inglaterra": "libro:jenkins-inglaterra",
    "el imperio romano 31 a.c.-235 d.c.": "libro:le-gall-le-glay-imperio-romano",
    "breve historia de la china milenaria": "libro:doval-china-milenaria",
    "herodiano - historia del imperio romano": "libro:herodiano-historia",
    "heródoto, historias, libros vi-ix": "libro:herodoto-historia-vi-ix",
    "breve historia de la república popular china (1949-2019)": "libro:iecc-republica-popular-china",
    "juan de mariana, historia general de españa (1601)": "libro:mariana-historia-general-espana",
}


def normalizar(cita):
    """Devuelve la cita con el 'id' en uno de los esquemas (o None si no sabe)."""
    c = dict(cita)
    i = str(c.get("id", "")).strip()
    url = str(c.get("url", "") or "")
    low = i.lower()
    nuevo = None
    if ESQUEMA.match(i) and not i.startswith(TIPOS_REGISTRO):
        nuevo = i
    elif low.startswith("libro:"):
        nuevo = LIBROS.get(low[6:].strip())
    elif low.startswith("openstax"):
        nuevo = "libro:openstax-world-history-1"
    elif low.startswith("owid"):
        nuevo = "datos:owid-poblacion"
    elif low.startswith("onu:estados") or "member-states" in url:
        nuevo = "web:onu-estados-miembros"
    elif low.startswith("onu") and "67/19" in i:
        nuevo = "web:onu-resolucion-67-19"
    elif low.startswith("natural-earth"):
        nuevo = "mapa:natural-earth"
    elif low == "curado":
        nuevo = "curado"
    elif low.startswith("britannica:messenian"):
        nuevo = "articulo:britannica-guerras-mesenias"
    else:
        m = WIKI_URL.match(url)
        wd = WD_URL.search(url)
        mw = re.match(r"^wikipedia \((\w+)\):\s*(.+)$", i, re.I)
        if m:
            nuevo = f"wikipedia-{m.group(1)}:{titulo_wiki(m.group(2))}"
        elif mw:
            nuevo = f"wikipedia-{mw.group(1).lower()}:{mw.group(2).strip()}"
        elif wd:
            nuevo = f"wikidata:{wd.group(1)}"
        elif re.match(r"^wikidata:q\d+$", low):
            nuevo = "wikidata:Q" + low.split(":q")[1]
    if not nuevo:
        return None
    c["id"] = nuevo
    if nuevo.startswith("wikipedia-"):
        lang, t = nuevo[len("wikipedia-"):].split(":", 1)
        c.setdefault("url", url_wiki(lang, t))
        c.setdefault("licencia", "CC BY-SA")
    elif nuevo.startswith("wikidata:"):
        c.setdefault("url", "https://www.wikidata.org/wiki/" + nuevo.split(":")[1])
        c.setdefault("licencia", "CC0")
    elif nuevo.split(":")[0] in TIPOS_REGISTRO:
        # la obra se describe en el registro: la cita solo guarda cuándo y dónde
        for k in ("url", "licencia"):
            c.pop(k, None)
    return c


# ------------------------------------------------------------ página de fuentes

TIPOS_DATO = {
    "fronteras": "Fronteras",
    "estados": "Estados y entidades",
    "gobernantes": "Gobernantes",
    "poblacion": "Población",
    "guerras": "Guerras y batallas",
    "acontecimientos": "Acontecimientos",
    "territorios": "Territorios menores",
    "emblemas": "Escudos y banderas",
}
_GOB = re.compile(r"heads.of.state|rulers|presidentes|jefes|monarc|kings|reyes|emperadores|list.of|anexo:|sultan|califas|faraones",
                  re.I)
_POB = re.compile(r"demograph|demograf|poblaci|population", re.I)


def _dato_pais(cita, pais):
    i, u = cita.get("id", ""), cita.get("url", "") or ""
    if i.startswith("datos:owid") or _POB.search(i + " " + u):
        return "poblacion"
    if _GOB.search(i + " " + u):
        return "gobernantes"
    if i.startswith("wikipedia-"):
        # el artículo de un gobernante de la ficha (p. ej. «Murad II» en el Imperio otomano)
        t = i.split(":", 1)[1].lower()
        for g in pais.get("gobernantes") or []:
            n = str(g.get("nombre") or "").lower()
            if n and (t == n or t.startswith(n + " ") or n.startswith(t)):
                return "gobernantes"
    if i.startswith("wikidata:") and i.split(":")[1] not in (pais.get("wikidata"), pais.get("wikidata_hist")):
        return "gobernantes"  # los Qid de personas los añade la extracción de gobernantes
    return "estados"


def _anio_pais(p):
    anios = [g.get("desde") for g in p.get("gobernantes") or [] if isinstance(g.get("desde"), int)]
    anios += [x.get("desde") for x in p.get("nombres_periodo") or [] if isinstance(x.get("desde"), int)]
    return min(anios) if anios else 2020


def citas_de(d, raiz=RAIZ):
    """[(cita, dato, (colección, id, nombre, año))] de las fichas y de las correcciones de
    fronteras, con el tipo de dato de cada cita."""
    import glob
    out = []
    for p in d.get("paises", []):
        ref = ("paises", p.get("id"), p.get("nombre"), _anio_pais(p))
        for c in p.get("fuentes") or []:
            out.append((c, _dato_pais(c, p), ref))
        n_emb = len(p.get("escudos") or []) + len(p.get("banderas") or [])
        for _ in range(n_emb):
            out.append(({"id": "datos:wikimedia-commons"}, "emblemas", ref))
    for c0 in d.get("conflictos", []):
        ref = ("conflictos", c0.get("id"), c0.get("nombre"), c0.get("inicio"))
        for c in c0.get("fuentes") or []:
            out.append((c, "guerras", ref))
        for b in c0.get("batallas") or []:
            for c in b.get("fuentes") or []:
                out.append((c, "guerras", ref))
    for e in d.get("eventos", []):
        ref = ("eventos", e.get("id"), e.get("nombre"), e.get("anio"))
        for c in e.get("fuentes") or []:
            out.append((c, "acontecimientos", ref))
    for t in d.get("territorios", []):
        ref = ("territorios", t.get("id"), t.get("nombre"), t.get("desde"))
        for c in t.get("fuentes") or []:
            out.append((c, "territorios", ref))
    # correcciones de fronteras: la 'fuente' de cada operación y los atlas que citan sus motivos
    for ruta in sorted(glob.glob(os.path.join(raiz, "api", "correcciones", "*.json"))):
        with open(ruta, encoding="utf-8") as f:
            spec = json.load(f)
        for clave, ops in (spec.get("mapas") or {}).items():
            mapa = clave.partition("<")[0]
            m = re.match(r"world_(bc)?(\d+)\.geojson", mapa)
            anio = (-int(m.group(2)) if m.group(1) else int(m.group(2))) if m else None
            ref = ("mapas", mapa, None, anio)
            for op in ops:
                # una 'fuente' puede enumerar varias URL (separadas por «;» o «·») y
                # añadir notas: cada parte es una cita
                partes = re.split(r"\s*[;·]\s*", op.get("fuente") or "")
                for f in dict.fromkeys(filter(None, partes)):
                    out.append((cita_de_texto(f), "fronteras", ref))
                txt = f"{op.get('motivo', '')} {op.get('region', '')}".lower()
                if "euratlas" in txt:
                    out.append(({"id": "mapa:euratlas"}, "fronteras", ref))
                if "natural earth" in txt or "ne50m" in txt:
                    out.append(({"id": "mapa:natural-earth"}, "fronteras", ref))
            if "roma" in os.path.basename(ruta):
                for k in ("mapa:truttafario-imperio-romano", "mapa:sobrehistoria-imperio-romano",
                          "mapa:jcdonceld-imperio-romano", "mapa:orbis-stanford"):
                    out.append(({"id": k}, "fronteras", ref))
    # mapas base: cada uno de los que vienen de historical-basemaps (los demás se crean a
    # partir de ellos con api/corregir_mapas.py y llevan otra 'base')
    carpeta = os.path.join(raiz, "web", "data", "geojson")
    if os.path.isdir(carpeta):
        for fn in sorted(os.listdir(carpeta)):
            m = re.match(r"world_(bc)?(\d+)\.geojson$", fn)
            if not m:
                continue
            with open(os.path.join(carpeta, fn), encoding="utf-8") as f:
                cab = f.read(4000)
            b = re.search(r'"correcciones":\{"base":"([^"]+)"', cab)
            if b and b.group(1) != fn:
                continue
            anio = -int(m.group(2)) if m.group(1) else int(m.group(2))
            out.append(({"id": "mapa:historical-basemaps"}, "fronteras", ("mapas", fn, None, anio)))
    return out


def compilar_fuentes(d, raiz=RAIZ, lang="es"):
    """(resumen + obras, listas de Wikipedia y Wikidata) para web/data/fuentes*.json.
    'd' son los datos ya en ese idioma (nombres de las fichas); los textos del registro
    (uso, notas, licencias) se traducen con el catálogo del idioma."""
    reg = cargar_registro()
    if lang != "es":
        import traduccion
        cat = traduccion.cargar_catalogo(lang)
        reg = {k: {c: ((cat.get(f"referencias/{k}.{c}") or {}).get("t") or val
                       if c in traduccion.CAMPOS_REFERENCIA else val)
                   for c, val in v.items()} for k, v in reg.items()}
    obras, wiki, wd = {}, {}, {}
    curado = 0
    fichas = set()

    def anota(e, dato, ref, maximo):
        e["n"] += 1
        e["d"].add(dato)
        r = [ref[0], ref[1], ref[2], ref[3]]
        if r not in e["f"] and len(e["f"]) < maximo:
            e["f"].append(r)

    for cita, dato, ref in citas_de(d, raiz):
        tipo, clave = clasificar(cita)
        if ref[0] != "mapas":
            fichas.add((ref[0], ref[1]))
        if tipo == "curado":
            curado += 1
        elif tipo == "wikipedia":
            e = wiki.setdefault(clave, {"n": 0, "d": set(), "f": []})
            anota(e, dato, ref, 3)
        elif tipo == "wikidata":
            e = wd.setdefault(clave, {"n": 0, "d": set(), "f": []})
            anota(e, dato, ref, 2)
        elif tipo in TIPOS_REGISTRO and clave in reg:
            e = obras.setdefault(clave, {"n": 0, "d": set(), "f": []})
            anota(e, dato, ref, 400)
    lista_obras = []
    for clave, info in sorted(reg.items(), key=lambda kv: (TIPOS_REGISTRO.index(kv[1]["tipo"]), kv[1]["titulo"].lower())):
        e = obras.get(clave, {"n": 0, "d": set(), "f": []})
        datos = sorted(set(info.get("datos", [])) | e["d"], key=list(TIPOS_DATO).index)
        lista_obras.append({"id": clave, **{k: v for k, v in info.items() if k != "datos"},
                            "datos": datos, "citas": e["n"], "fichas": e["f"]})
    por_lang = {}
    filas_wiki = []
    for clave, e in sorted(wiki.items(), key=lambda kv: kv[0].lower()):
        lang, titulo = clave[len("wikipedia-"):].split(":", 1)
        por_lang[lang] = por_lang.get(lang, 0) + 1
        filas_wiki.append([lang, titulo, e["n"], sorted(e["d"], key=list(TIPOS_DATO).index), e["f"]])
    filas_wd = [[q, e["n"], sorted(e["d"], key=list(TIPOS_DATO).index), e["f"]]
                for q, e in sorted(wd.items(), key=lambda kv: int(kv[0][1:]))]
    cuenta = {t: sum(1 for o in lista_obras if o["tipo"] == t) for t in TIPOS_REGISTRO}
    por_dato = {k: {"etiqueta": v, "citas": 0} for k, v in TIPOS_DATO.items()}
    for cita, dato, ref in citas_de(d, raiz):
        por_dato[dato]["citas"] += 1
    resumen = {
        "libros": cuenta["libro"],
        "articulos": cuenta["articulo"] + len(filas_wiki),
        "articulos_wikipedia": len(filas_wiki),
        "articulos_otros": cuenta["articulo"],
        "mapas": cuenta["mapa"],
        "datos": cuenta["datos"],
        "webs": cuenta["web"],
        "wikidata": len(filas_wd),
        "wikipedia_idiomas": dict(sorted(por_lang.items(), key=lambda kv: -kv[1])),
        "curado": curado,
        "citas": sum(e["n"] for e in wiki.values()) + sum(e["n"] for e in wd.values())
                 + sum(e["n"] for e in obras.values()) + curado,
        "fichas": len(fichas),
    }
    principal = {"resumen": resumen, "tipos_dato": por_dato, "obras": lista_obras}
    listas = {"wikipedia": filas_wiki, "wikidata": filas_wd}
    return principal, listas
