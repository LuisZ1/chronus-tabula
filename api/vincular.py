#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convierte en vínculos los 'relacionados' de los países que nombran otra ficha.

    python api/vincular.py            # muestra qué haría, sin escribir nada
    python api/vincular.py --escribir # escribe datos/paises/*.json

'relacionados' era una lista de texto libre que mezclaba alias («Principado de
Andorra») con linaje («Corona de Castilla»). Cada nombre que corresponde sin
ambigüedad a otra ficha se convierte en un vínculo con su 'id' (ver
api/fuentes/vinculos.py) y sale de 'relacionados'; los alias sueltos se quedan.

El tipo se deduce de los años en que cada entidad aparece en los mapas
(predecesor, sucesor, parte_de, incluye) y se escribe el inverso en la otra
ficha. Es una suposición: revisa el diff (git diff datos/paises) y corrige en el
asistente del panel lo que no cuadre. Los nombres sin tipo claro o con parejas
contradictorias se listan y no se tocan.
"""
import argparse
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "fuentes"))
from comun import DATOS, RAIZ, _leer_json, compilar_web, texto_canonico  # noqa: E402
import vinculos as VI  # noqa: E402

GEOJSON_DIR = os.path.join(RAIZ, "web", "data", "geojson")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--escribir", action="store_true", help="escribe los cambios en datos/paises/")
    args = ap.parse_args()

    carpeta = os.path.join(DATOS, "paises")
    ficheros = sorted(f for f in os.listdir(carpeta) if f.endswith(".json") and not f.startswith("_"))
    paises = {}
    for fn in ficheros:
        r = _leer_json(os.path.join(carpeta, fn))
        paises[r["id"]] = (fn, r)
    lista = [r for _, r in paises.values()]
    por_nombre = VI.anios_en_mapas(GEOJSON_DIR)
    lapsos = {pid: VI.lapso(r, por_nombre) for pid, (_, r) in paises.items()}

    propuestas = {}  # (a, b) con a < b -> {origen: tipo}
    quitar = {}  # id -> nombres que salen de 'relacionados'
    sin_tipo = []
    for pid, (_, r) in sorted(paises.items()):
        for nombre in r.get("relacionados") or []:
            dest = VI.resolver(nombre, lista, excluir=pid)
            if not dest:
                continue
            ya = [v for v in r.get("vinculos") or [] if v.get("id") == dest]
            if ya:
                quitar.setdefault(pid, []).append(nombre)
                continue
            tipo = VI.sugerir_tipo(lapsos[pid], lapsos[dest])
            if not tipo:
                sin_tipo.append(f"{pid} → {nombre!r} ({dest}): sin años en los mapas o empiezan a la vez")
                continue
            par = tuple(sorted((pid, dest)))
            propuestas.setdefault(par, {})[pid] = (tipo, nombre)

    nuevos = {}  # id -> lista de vínculos añadidos
    contradicciones = []
    for (a, b), lados in sorted(propuestas.items()):
        if a in lados and b in lados and VI.INVERSO[lados[a][0]] != lados[b][0]:
            contradicciones.append(f"{a} dice «{lados[a][0]} {b}» y {b} dice «{lados[b][0]} {a}»")
            continue
        origen = a if a in lados else b
        otro = b if origen == a else a
        tipo = lados[origen][0]
        nuevos.setdefault(origen, []).append({"id": otro, "tipo": tipo})
        nuevos.setdefault(otro, []).append({"id": origen, "tipo": VI.INVERSO[tipo]})
        for lado, (_, nombre) in lados.items():
            quitar.setdefault(lado, []).append(nombre)

    cambiadas = 0
    for pid in sorted(set(nuevos) | set(quitar)):
        fn, r = paises[pid]
        r2 = dict(r)
        vs = [v for v in r.get("vinculos") or []]
        for v in nuevos.get(pid, []):
            if not any(w.get("id") == v["id"] and w.get("tipo") == v["tipo"] for w in vs):
                vs.append(v)
        if vs:
            r2["vinculos"] = sorted(vs, key=VI.orden)
        rel = [n for n in r.get("relacionados") or [] if n not in set(quitar.get(pid, []))]
        if rel:
            r2["relacionados"] = rel
        else:
            r2.pop("relacionados", None)
        antes = texto_canonico("paises", r)
        despues = texto_canonico("paises", r2)
        if antes == despues:
            continue
        cambiadas += 1
        for v in nuevos.get(pid, []):
            print(f"  {pid:28} {v['tipo']:10} {v['id']}")
        if args.escribir:
            with open(os.path.join(carpeta, fn), "w", encoding="utf-8", newline="\n") as f:
                f.write(despues)

    n_vinc = sum(len(v) for v in nuevos.values())
    print(f"\n{n_vinc} vínculo(s) en {cambiadas} ficha(s)" + ("" if args.escribir else " (simulación: usa --escribir)"))
    if contradicciones:
        print(f"\n{len(contradicciones)} pareja(s) contradictoria(s), sin tocar:")
        for c in contradicciones:
            print("  · " + c)
    if sin_tipo:
        print(f"\n{len(sin_tipo)} nombre(s) sin tipo claro, sin tocar (vincúlalos a mano en el asistente):")
        for s in sin_tipo:
            print("  · " + s)
    if args.escribir and cambiadas:
        compilar_web()
        print("\n✔ web/data/historia.json recompilado. Revisa: git diff datos/paises")
    return 0


if __name__ == "__main__":
    sys.exit(main())
