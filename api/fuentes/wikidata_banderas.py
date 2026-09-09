#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de banderas por época desde Wikidata (propiedad P41, imagen de la bandera).

    python api/fuentes/wikidata_banderas.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_banderas.py --demo    # datos de muestra, sin red
    python api/fuentes/wikidata_banderas.py --todos   # consultar todos los países, no solo los nuevos

Propone el campo 'banderas' [{archivo, desde, hasta}] de cada país con 'wikidata'
(fechas de Wikidata y entidades históricas de nombres_periodo). El mapa muestra,
a elección del usuario, la bandera o el escudo vigente en el año consultado. La
lógica está en _emblemas.py, compartida con wikidata_escudos.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _emblemas import ejecutar  # noqa: E402

FID = "wikidata_banderas"
DEMO = {"espana": [
    {"archivo": "Flag of Spain.svg", "desde": 1981, "hasta": None},
    {"archivo": "Flag of Spain (1945–1977).svg", "desde": 1945, "hasta": 1977},
    {"archivo": "Flag of Spain (1931–1939).svg", "desde": 1931, "hasta": 1939},
]}

if __name__ == "__main__":
    sys.exit(ejecutar(FID, "P41", "banderas", DEMO))
