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
import hashlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import cargar_historia, conectar, guardar_historia, RAIZ, HOY  # noqa: E402


def fusionar_fuente(reg, fuente):
    reg.setdefault("fuentes", [])
    if all(f.get("id") != fuente["id"] for f in reg["fuentes"]):
        reg["fuentes"].append(fuente)


def _hash_datos(p):
    canon = json.dumps({"g": p.get("gobernantes", []), "p": p.get("poblacion", []),
                        "np": p.get("nombres_periodo", [])}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(canon.encode("utf-8")).hexdigest()[:12]


def marcar_revisado(pais, secciones):
    """Estampa/actualiza el bloque 'revision'. Al aplicar propuestas aprobadas
    (revisadas por una persona en el panel), los datos quedan 'validado', con el
    hash del contenido para detectar ediciones posteriores."""
    prev = pais.get("revision") or {}
    secs = sorted(set(prev.get("secciones", [])) | set(secciones))
    pais["revision"] = {"estado": "validado", "fecha": HOY, "por": "panel-admin",
                        "hash": _hash_datos(pais), "secciones": secs}


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
    tocados = {}  # pais_id -> conjunto de secciones validadas en esta exportación
    for pid, tipo, pais_id, payload in filas:
        pais = paises.get(pais_id)
        if not pais:
            print(f"  ⚠ #{pid}: país '{pais_id}' no existe; se omite")
            continue
        datos = json.loads(payload)
        if tipo == "poblacion":
            pais["poblacion"] = datos["poblacion"]
            fusionar_fuente(pais, datos["fuente"])
            tocados.setdefault(pais_id, set()).add("poblacion")
        elif tipo == "gobernante":
            pais.setdefault("gobernantes", []).append(datos["gobernante"])
            pais["gobernantes"].sort(key=lambda g: g.get("desde", 0))
            fusionar_fuente(pais, datos["fuente"])
            tocados.setdefault(pais_id, set()).add("gobernantes")
        elif tipo == "resena":
            pais["resena"] = datos["resena"]
            fusionar_fuente(pais, datos["fuente"])
            tocados.setdefault(pais_id, set()).add("resena")
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

    # marca de validación por ficha tocada (revisada por una persona en el panel)
    for pid_, secs in tocados.items():
        marcar_revisado(paises[pid_], secs)
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
