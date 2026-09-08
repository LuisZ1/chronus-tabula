#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compila el árbol datos/ (un fichero por entidad) en web/data/historia.json,
el único JSON que descarga la web.

    python api/compilar.py

historia.json es un ARTEFACTO GENERADO: no se edita a mano ni se versiona. Lo
regeneran automáticamente servidor.py al arrancar, exportar.py al aplicar
propuestas y el despliegue en CI antes de publicar la web. Edita siempre los
ficheros de datos/ (o usa el panel de administración).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import cargar_historia, compilar_web, COLECCIONES, RAIZ  # noqa: E402


def main():
    try:
        d = cargar_historia()
    except ValueError as e:
        print(f"✘ JSON inválido en {e}")
        return 1
    ruta = compilar_web(d)
    resumen = ", ".join(f"{len(d.get(c, []))} {c}" for c in COLECCIONES)
    tam = os.path.getsize(ruta) / 1024
    print(f"✔ {os.path.relpath(ruta, RAIZ)} generado ({tam:.0f} KB): {resumen}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
