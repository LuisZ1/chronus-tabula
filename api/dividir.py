#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa un historia.json monolítico al árbol datos/ (un fichero por entidad).

    python api/dividir.py                       # desde web/data/historia.json
    python api/dividir.py ruta/a/otro.json      # desde otro fichero

Sirve para la migración inicial y para incorporar un JSON completo que alguien
haya preparado aparte. Escribe cada país, conflicto, evento y territorio en su
fichero (solo los que cambian), retira los que ya no existan y recompila
web/data/historia.json. Después, valida con:  python api/validar.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import guardar_historia, COLECCIONES, DATOS, HISTORIA, RAIZ  # noqa: E402


def main():
    origen = sys.argv[1] if len(sys.argv) > 1 else HISTORIA
    if not os.path.exists(origen):
        print(f"✘ No encuentro {origen}")
        return 1
    with open(origen, encoding="utf-8") as f:
        d = json.load(f)
    faltan = [c for c in COLECCIONES if not isinstance(d.get(c), list)]
    if faltan:
        print(f"✘ El fichero no tiene las colecciones esperadas: faltan {faltan}")
        return 1
    guardar_historia(d)
    resumen = ", ".join(f"{len(d[c])} {c}" for c in COLECCIONES)
    print(f"✔ {os.path.relpath(origen, RAIZ)} repartido en {os.path.relpath(DATOS, RAIZ)}/ ({resumen})")
    print(f"  y recompilado en {os.path.relpath(HISTORIA, RAIZ)}. Valida con: python api/validar.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
