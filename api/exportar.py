#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aplica las propuestas APROBADAS de api/editorial.db sobre data/historia.json
y ejecuta el validador. Las propuestas aplicadas pasan a estado 'exportada'.

    python api/exportar.py
"""
import json
import subprocess
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import cargar_historia, conectar, guardar_historia, RAIZ  # noqa: E402


def fusionar_fuente(reg, fuente):
    reg.setdefault("fuentes", [])
    if all(f.get("id") != fuente["id"] for f in reg["fuentes"]):
        reg["fuentes"].append(fuente)


def main():
    con = conectar()
    filas = con.execute(
        "SELECT id, tipo, pais, payload FROM propuestas WHERE estado='aprobada' ORDER BY id").fetchall()
    if not filas:
        print("(no hay propuestas aprobadas pendientes de exportar)")
        return 0
    historia = cargar_historia()
    paises = {p["id"]: p for p in historia["paises"]}
    conflictos = {c["id"]: c for c in historia.get("conflictos", [])}
    aplicadas = []
    for pid, tipo, pais_id, payload in filas:
        pais = paises.get(pais_id)
        if not pais:
            print(f"  ⚠ #{pid}: país '{pais_id}' no existe; se omite")
            continue
        datos = json.loads(payload)
        if tipo == "poblacion":
            pais["poblacion"] = datos["poblacion"]
            fusionar_fuente(pais, datos["fuente"])
        elif tipo == "gobernante":
            pais.setdefault("gobernantes", []).append(datos["gobernante"])
            pais["gobernantes"].sort(key=lambda g: g.get("desde", 0))
            fusionar_fuente(pais, datos["fuente"])
        elif tipo == "batalla":
            conflicto = conflictos.get(datos["conflicto"])
            if not conflicto:
                print(f"  ⚠ #{pid}: conflicto '{datos['conflicto']}' no existe; se omite")
                continue
            conflicto.setdefault("batallas", []).append(datos["batalla"])
            conflicto["batallas"].sort(key=lambda b: b.get("anio", 0))
            fusionar_fuente(conflicto, datos["fuente"])
        else:
            print(f"  ⚠ #{pid}: tipo desconocido '{tipo}'; se omite")
            continue
        aplicadas.append(pid)
        print(f"  ✓ #{pid} [{tipo}] → {pais_id}")

    guardar_historia(historia)
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "api", "validar.py")],
                       env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"})
    if r.returncode != 0:
        print("✘ El validador ha fallado: revisa historia.json (los cambios YA están escritos;")
        print("  usa git para descartarlos si hace falta). Las propuestas siguen 'aprobadas'.")
        return 1
    con.executemany("UPDATE propuestas SET estado='exportada' WHERE id=?", [(i,) for i in aplicadas])
    con.commit(); con.close()
    print(f"✔ {len(aplicadas)} propuesta(s) exportadas a web/data/historia.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
