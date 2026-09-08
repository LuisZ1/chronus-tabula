#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Formateador canónico de los ficheros de datos/ (un fichero por entidad).

    python api/formatear.py            # reescribe los ficheros que no estén en formato canónico
    python api/formatear.py --check    # no toca nada: lista los que habría que formatear
                                       # y termina con código 1 si hay alguno (lo usa el CI)

Formato canónico = claves en orden fijo, listas cronológicas (gobernantes,
población, nombres por época, escudos, batallas) ordenadas por año, sangría
con tabuladores, saltos de línea LF y salto final. Lo define canonizar() en
api/fuentes/comun.py, y guardar_historia() lo aplica a todo lo que escribe el
pipeline (exportar.py, dividir.py). Este script existe para lo que se edita a
mano: pásalo antes de abrir un pull request (o deja que el CI te avise).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuentes"))
from comun import (COLECCIONES, DATOS, RAIZ, _leer_json, _nombre_fichero,  # noqa: E402
                   texto_canonico)


def ficheros():
    for col in COLECCIONES:
        carpeta = os.path.join(DATOS, col)
        if not os.path.isdir(carpeta):
            continue
        for fn in sorted(os.listdir(carpeta)):
            if fn.endswith(".json") and not fn.startswith("_"):
                yield col, fn, os.path.join(carpeta, fn)


def main(argv):
    comprobar = "--check" in argv
    if not os.path.isdir(DATOS):
        print(f"✘ No existe {os.path.relpath(DATOS, RAIZ)}/ (ejecuta desde la raíz del repositorio)")
        return 1
    pendientes, avisos, total = [], [], 0
    for col, fn, ruta in ficheros():
        total += 1
        rel = os.path.relpath(ruta, RAIZ).replace(os.sep, "/")
        try:
            reg = _leer_json(ruta)
        except ValueError as e:
            print(f"✘ JSON inválido en {e}")
            return 1
        with open(ruta, encoding="utf-8", newline="") as f:
            actual = f.read()
        canon = texto_canonico(col, reg)
        if actual != canon:
            pendientes.append(rel)
            if not comprobar:
                with open(ruta, "w", encoding="utf-8", newline="\n") as f:
                    f.write(canon)
        esperado = _nombre_fichero(col, reg)
        if fn != esperado and not (fn.startswith(esperado[:-5] + "-") and fn[len(esperado) - 4:-5].isdigit()):
            avisos.append(f"  ⚠ {rel}: el nombre canónico del fichero sería {esperado} "
                          "(se deriva del id, o del año y el nombre); renómbralo si acabas de crearlo")
    for a in avisos:
        print(a)
    if comprobar:
        if pendientes:
            print("\n".join(f"  ✘ {r}" for r in pendientes))
            print(f"\n✘ {len(pendientes)} de {total} ficheros no están en formato canónico. "
                  "Ejecuta:  python api/formatear.py")
            return 1
        print(f"✔ formato canónico: los {total} ficheros de datos/ están bien formateados"
              + (f" ({len(avisos)} aviso(s))" if avisos else ""))
        return 0
    if pendientes:
        print("\n".join(f"  ✎ {r}" for r in pendientes))
    print(f"✔ {len(pendientes)} fichero(s) reformateado(s) de {total}; los demás ya eran canónicos."
          + (f" ({len(avisos)} aviso(s))" if avisos else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
