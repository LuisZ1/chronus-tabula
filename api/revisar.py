#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Revisión de propuestas del pipeline (interfaz de terminal; el panel web llegará en F2).

    python api/revisar.py list [pendiente|aprobada|rechazada|exportada]
    python api/revisar.py ver 12
    python api/revisar.py aprobar 12 14 20-30
    python api/revisar.py rechazar 13
    python api/revisar.py aprobar-todas [--tipo poblacion] [--pais espana]
    python api/revisar.py depurar-batallas   # rechaza propuestas de batalla que
                                             # caen fuera del teatro de su conflicto
"""
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import cargar_historia, conectar  # noqa: E402


def ids_de(args):
    out = []
    for a in args:
        if "-" in a and not a.startswith("-"):
            i, f = a.split("-", 1)
            out.extend(range(int(i), int(f) + 1))
        elif a.isdigit():
            out.append(int(a))
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 0
    orden, resto = sys.argv[1], sys.argv[2:]
    con = conectar()

    if orden == "list":
        estado = resto[0] if resto else "pendiente"
        filas = con.execute(
            "SELECT id, tipo, pais, resumen, fuente FROM propuestas WHERE estado=? ORDER BY pais, id",
            (estado,)).fetchall()
        if not filas:
            print(f"(sin propuestas en estado '{estado}')")
        for f in filas:
            print(f"  #{f[0]:<4} [{f[1]}] {f[2]:<14} {f[3]}   ← {f[4]}")
        print(f"{len(filas)} propuesta(s) '{estado}'.")

    elif orden == "ver" and resto:
        f = con.execute("SELECT tipo, pais, resumen, payload, fuente, estado FROM propuestas WHERE id=?",
                        (int(resto[0]),)).fetchone()
        if not f:
            print("no existe"); return 1
        print(f"[{f[0]}] {f[1]} — {f[2]} ({f[5]})\nfuente: {f[4]}\n")
        print(json.dumps(json.loads(f[3]), ensure_ascii=False, indent=2))

    elif orden in ("aprobar", "rechazar") and resto:
        nuevo = "aprobada" if orden == "aprobar" else "rechazada"
        ids = ids_de(resto)
        con.executemany(f"UPDATE propuestas SET estado='{nuevo}' WHERE id=? AND estado='pendiente'",
                        [(i,) for i in ids])
        con.commit()
        print(f"{con.total_changes} propuesta(s) → {nuevo}")

    elif orden == "aprobar-todas":
        q, args = "UPDATE propuestas SET estado='aprobada' WHERE estado='pendiente'", []
        if "--tipo" in resto:
            q += " AND tipo=?"; args.append(resto[resto.index("--tipo") + 1])
        if "--pais" in resto:
            q += " AND pais=?"; args.append(resto[resto.index("--pais") + 1])
        con.execute(q, args); con.commit()
        print(f"{con.total_changes} propuesta(s) aprobadas")

    elif orden == "depurar-batallas":
        # re-aplica el filtro geográfico a las propuestas de batalla pendientes:
        # las que caen lejos del teatro de su conflicto se rechazan (asignación
        # errónea por coincidencia de año+país, p. ej. Cantón → guerras indias)
        from wikidata_batallas import encaja_geo, MARGEN_GEO  # noqa: E402
        historia = cargar_historia()
        por_id = {c["id"]: c for c in historia.get("conflictos", [])}
        filas = con.execute(
            "SELECT id, pais, resumen, payload FROM propuestas WHERE estado='pendiente' AND tipo='batalla'").fetchall()
        malas = []
        for pid, pais, resumen, payload in filas:
            p = json.loads(payload)
            c = por_id.get(p.get("conflicto"))
            b = p.get("batalla", {})
            if c and isinstance(b.get("lat"), (int, float)) and not encaja_geo(b, c):
                malas.append((pid, pais, resumen, c["nombre"]))
        for pid, pais, resumen, nombre_c in malas:
            con.execute("UPDATE propuestas SET estado='rechazada' WHERE id=?", (pid,))
            print(f"  ✘ #{pid} [{pais}] {resumen} — fuera del teatro de «{nombre_c}» (± {MARGEN_GEO}°)")
        con.commit()
        print(f"{len(malas)} propuesta(s) de batalla rechazadas por geografía, de {len(filas)} pendientes.")

    else:
        print(__doc__); return 1
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
