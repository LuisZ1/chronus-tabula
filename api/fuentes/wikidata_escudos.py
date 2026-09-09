#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingesta de escudos por época desde Wikidata (propiedad P94, escudo de armas).

    python api/fuentes/wikidata_escudos.py           # consulta real (SPARQL)
    python api/fuentes/wikidata_escudos.py --demo    # datos de muestra, sin red
    python api/fuentes/wikidata_escudos.py --todos   # consultar todos los países, no solo los nuevos

Propone el campo 'escudos' [{archivo, desde, hasta}] de cada país con 'wikidata'
(fechas de Wikidata y entidades históricas de nombres_periodo). La lógica está en
_emblemas.py, compartida con el conector de banderas (wikidata_banderas.py).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _emblemas import ejecutar  # noqa: E402

FID = "wikidata_escudos"
DEMO = {"espana": [
    {"archivo": "Escudo de España (mazonado).svg", "desde": 1981, "hasta": None},
    {"archivo": "Escudo de España 1945-1977.svg", "desde": 1939, "hasta": 1977},
]}

if __name__ == "__main__":
    sys.exit(ejecutar(FID, "P94", "escudos", DEMO))
