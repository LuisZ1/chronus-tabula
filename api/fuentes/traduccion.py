# -*- coding: utf-8 -*-
"""Traducción de los datos curados: catálogos por idioma y compilación localizada.

El español es el idioma FUENTE: las fichas de datos/ se escriben en español y no
llevan traducciones. Cada idioma tiene un catálogo, datos/i18n/<idioma>.json, con
una línea por texto traducido:

    "paises/egipto.nombre":                {"t": "Egypt", "src": "5f1c2a9b"}
    "conflictos/wwi.batallas.somme.nombre": {"t": "Battle of the Somme", "src": "…"}
    "txt:Faraón":                          {"t": "Pharaoh"}
    "txt:Isabel II@espana":                {"t": "Isabella II"}   (precisión para una ficha)
    "mapa:Kingdom of Castile":             {"t": "Kingdom of Castile"}

Tres tipos de clave:
  <colección>/<id>.<campo>[…]  un campo de una ficha. 'src' es la huella del texto
        español del que sale la traducción: si alguien cambia el español, deja de
        cuadrar y la traducción queda «desactualizada» (validar.py avisa).
  txt:<texto español>  textos cortos que se repiten (nombres, cargos y títulos de
        los gobernantes; bandos de las guerras y países de los acontecimientos): se traducen una vez para todas las fichas.
  mapa:<nombre del GeoJSON>  nombres de los mapas base (NAME, SUBJECTO, PARTOF), que
        vienen en inglés. Por eso el catálogo español (es.json) solo lleva claves mapa:.

compilar_idioma() produce una copia de los datos con los textos de ese idioma (lo
que falta se queda en español) y la tabla nombres_mapa; la web descarga
data/historia.json (español) o data/historia.<idioma>.json.
"""
import hashlib
import json
import os

IDIOMA_FUENTE = "es"
_AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(_AQUI))
DATOS = os.environ.get("CHRONUS_DATOS") or os.path.join(RAIZ, "datos")
I18N = os.path.join(DATOS, "i18n")

# campos de texto traducibles de cada colección (al nivel de la ficha)
CAMPOS = {
    "paises": ("nombre", "resena"),
    "conflictos": ("nombre", "descripcion", "bajas"),
    "eventos": ("nombre", "descripcion"),
    "territorios": ("nombre", "descripcion", "estatus"),
}
# sublistas con elementos traducibles: (lista, campos, cómo se identifica cada elemento)
SUBLISTAS = {
    "paises": (("nombres_periodo", ("nombre",), "desde"),),
    "conflictos": (("batallas", ("nombre", "descripcion", "bajas"), "id"),
                   ("zonas", ("nombre",), "id")),
}


def huella(texto):
    return hashlib.sha1(str(texto).encode("utf-8")).hexdigest()[:8]


def _slug(texto):
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "sin-nombre"


def id_registro(col, reg):
    """Identificador estable de una ficha. Países y conflictos tienen 'id'; eventos y
    territorios también (es el nombre de su fichero); si faltara, se deriva como el
    nombre de fichero canónico."""
    if reg.get("id"):
        return str(reg["id"])
    if col == "eventos":
        a = reg.get("anio")
        pref = (f"{abs(a)}ac" if isinstance(a, int) and a < 0 else str(a)) if a is not None else "sin-anio"
        return f"{pref}-{_slug(reg.get('nombre'))}"
    return _slug(reg.get("nombre"))


def id_elemento(el, modo, vistos):
    """Identificador de una batalla, zona o periodo dentro de su ficha."""
    if modo == "desde":
        return str(el.get("desde"))
    base = str(el.get("id") or _slug(el.get("nombre")))
    clave, n = base, 2
    while clave in vistos:  # sin 'id' y con nombre repetido: sufijo
        clave = f"{base}-{n}"
        n += 1
    vistos.add(clave)
    return clave


def unidades(d):
    """Todo texto traducible de los datos: [(clave, texto español)]. Las claves txt:
    aparecen una sola vez aunque el texto se repita en muchas fichas."""
    out, txt = [], set()
    for col in CAMPOS:
        for reg in d.get(col, []):
            if not isinstance(reg, dict):
                continue
            base = f"{col}/{id_registro(col, reg)}"
            for c in CAMPOS[col]:
                if isinstance(reg.get(c), str) and reg[c].strip():
                    out.append((f"{base}.{c}", reg[c]))
            for lista, campos, modo in SUBLISTAS.get(col, ()):
                vistos = set()
                for el in reg.get(lista) or []:
                    if not isinstance(el, dict):
                        continue
                    eid = id_elemento(el, modo, vistos)
                    for c in campos:
                        if isinstance(el.get(c), str) and el[c].strip():
                            out.append((f"{base}.{lista}.{eid}.{c}", el[c]))
            if col == "paises":
                for g in reg.get("gobernantes") or []:
                    for c in ("nombre", "cargo", "titulo"):
                        if isinstance(g.get(c), str) and g[c].strip():
                            txt.add(g[c])
            if col in ("conflictos", "eventos"):
                for p in reg.get("paises") or []:
                    if isinstance(p, str) and p.strip():
                        txt.add(p)
    out += [(f"txt:{t}", t) for t in sorted(txt)]
    return out


def es_texto_largo(clave):
    """Descripciones, reseñas y bajas (frente a nombres y textos cortos)."""
    return clave.rsplit(".", 1)[-1] in ("resena", "descripcion", "bajas", "estatus")


# ---------------------------------------------------------------- catálogos

def idiomas():
    """Idiomas con catálogo (además del español, que es la fuente)."""
    if not os.path.isdir(I18N):
        return []
    return sorted(f[:-5] for f in os.listdir(I18N) if f.endswith(".json") and f[:-5] != IDIOMA_FUENTE)


def ruta_catalogo(lang):
    return os.path.join(I18N, f"{lang}.json")


def cargar_catalogo(lang):
    ruta = ruta_catalogo(lang)
    if not os.path.exists(ruta):
        return {}
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def texto_catalogo(cat):
    """Formato canónico: una línea por clave, en orden alfabético (cada traducción
    añadida o corregida es una línea del diff)."""
    lineas = []
    for k in sorted(cat):
        v = cat[k] or {}
        v = {c: v[c] for c in ("t", "src") if v.get(c)}
        lineas.append("\t" + json.dumps(k, ensure_ascii=False) + ": " + json.dumps(v, ensure_ascii=False))
    return "{\n" + ",\n".join(lineas) + ("\n" if lineas else "") + "}\n"


def guardar_catalogo(lang, cat):
    os.makedirs(I18N, exist_ok=True)
    with open(ruta_catalogo(lang), "w", encoding="utf-8", newline="\n") as f:
        f.write(texto_catalogo(cat))


def estado(d, lang, cat=None):
    """Clasifica cada unidad: 'ok', 'falta' o 'desactualizada'; y las claves huérfanas."""
    cat = cargar_catalogo(lang) if cat is None else cat
    res = {"ok": [], "falta": [], "desactualizada": []}
    vivas = set()
    for clave, texto in unidades(d):
        vivas.add(clave)
        e = cat.get(clave)
        if not e or not e.get("t"):
            res["falta"].append((clave, texto))
        elif not clave.startswith("txt:") and e.get("src") and e["src"] != huella(texto):
            res["desactualizada"].append((clave, texto))
        else:
            res["ok"].append((clave, texto))
    # txt:<texto>@<ficha> es una precisión de txt:<texto>: vive mientras viva el texto
    res["huerfanas"] = sorted(k for k in cat if k not in vivas and not k.startswith("mapa:")
                              and not (k.startswith("txt:") and "@" in k and k.rsplit("@", 1)[0] in vivas))
    return res


# ---------------------------------------------------------------- compilación

def nombres_mapa(lang):
    """{nombre del GeoJSON: texto visible} para ese idioma."""
    return {k[5:]: v["t"] for k, v in cargar_catalogo(lang).items()
            if k.startswith("mapa:") and isinstance(v, dict) and v.get("t")}


def compilar_idioma(d, lang):
    """Copia de los datos con los textos en 'lang' (el español donde falte). Donde el
    nombre cambia se conserva el original en 'nombre_es': la web lo necesita para
    enlazar fichas entre sí (bandos de las guerras, país de un territorio, alias) y
    para el artículo de la Wikipedia en español."""
    import copy
    cat = {} if lang == IDIOMA_FUENTE else cargar_catalogo(lang)

    def tr(clave, texto):
        e = cat.get(clave)
        return e["t"] if e and e.get("t") else texto

    out = copy.deepcopy(d)
    for col in CAMPOS:
        for reg in out.get(col, []):
            if not isinstance(reg, dict):
                continue
            base = f"{col}/{id_registro(col, reg)}"
            for c in CAMPOS[col]:
                if isinstance(reg.get(c), str) and reg[c].strip():
                    nuevo = tr(f"{base}.{c}", reg[c])
                    if c == "nombre" and nuevo != reg[c]:
                        reg["nombre_es"] = reg[c]
                    reg[c] = nuevo
            for lista, campos, modo in SUBLISTAS.get(col, ()):
                vistos = set()
                for el in reg.get(lista) or []:
                    if not isinstance(el, dict):
                        continue
                    eid = id_elemento(el, modo, vistos)
                    for c in campos:
                        if isinstance(el.get(c), str) and el[c].strip():
                            nuevo = tr(f"{base}.{lista}.{eid}.{c}", el[c])
                            if c == "nombre" and nuevo != el[c]:
                                el["nombre_es"] = el[c]
                            el[c] = nuevo
            if col == "paises":
                for g in reg.get("gobernantes") or []:
                    for c in ("nombre", "cargo", "titulo"):
                        if isinstance(g.get(c), str) and g[c].strip():
                            # txt:<texto>@<id de la ficha> precisa la traducción en una ficha
                            # (Isabel II: Elizabeth II en el Reino Unido, Isabella II en España)
                            g[c] = tr(f"txt:{g[c]}@{reg.get('id')}", tr(f"txt:{g[c]}", g[c]))
            if col in ("conflictos", "eventos") and reg.get("paises") and lang != IDIOMA_FUENTE:
                vis = [tr(f"txt:{p}", p) for p in reg["paises"]]
                if vis != reg["paises"]:
                    reg["paises_vis"] = vis  # 'paises' sigue en español: lo usa el filtro
    out["idioma"] = lang
    out["nombres_mapa"] = nombres_mapa(lang)
    # las obras del registro, para rotular las fuentes de las fichas (la página de
    # fuentes tiene la referencia completa)
    import referencias
    out["referencias"] = {k: {c: v[c] for c in ("tipo", "titulo", "autor", "anio") if v.get(c)}
                          for k, v in referencias.cargar_registro().items()}
    return out
