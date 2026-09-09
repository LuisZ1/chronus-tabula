#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Servidor de Chronus Tabula: web estática + API de administración.

    python api/servidor.py [puerto]      # por defecto 9000

Sirve la carpeta web/ (la aplicación y el panel /admin.html) y expone la API
que usa el panel de administración:

    GET  /api/estado                     resumen general
    GET  /api/fuentes                    fuentes configuradas y su última ejecución
    POST /api/ingestas/<fuente>          lanza una ingesta  (body: {"demo": true|false})
    POST /api/ingestas/_cola             lanza todos los conectores en serie; reanuda una cola
                                         detenida (body: {"desde_cero": true} para empezar de nuevo)
    POST /api/ingestas/_detener          para la ingesta en curso entre país y país (guarda progreso)
    POST /api/ingestas/<fuente>/reiniciar olvida la pila a medias de ese conector
    GET  /api/ingestas/estado            salida en vivo de la ingesta en curso
    GET  /api/ajustes                    interruptor «solo países nuevos», cola pendiente, consultados
    POST /api/ajustes                    {"solo_nuevos": bool} | {"olvidar_cola": true}
    GET  /api/mapeo                      mapeo país ↔ OWID / Wikidata
    GET  /api/propuestas?estado=pendiente
    POST /api/propuestas/accion          {"ids": [1,2], "accion": "aprobar"|"rechazar"}
    POST /api/exportar                   aplica lo aprobado a historia.json + valida

Solo usa la librería estándar de Python: no hay nada que instalar.
La API está pensada para uso local del editor (escucha en 127.0.0.1).
"""
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from seguridad import (cerrar_sesion, crear_sesion, crear_usuario, hay_usuarios,
                       validar_token, verificar)

ENV_UTF8 = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "web")
sys.path.insert(0, os.path.join(RAIZ, "api", "fuentes"))
from comun import (cargar_historia, compilar_web, conectar, progreso_borrar, progreso_hechas,  # noqa: E402
                   consultas_hechas, pedir_parada, limpiar_parada, CODIGO_DETENIDO)

FUENTES = {
    "owid_poblacion": {
        "nombre": "Our World in Data — población",
        "descripcion": "Series de población histórica (HYDE, Gapminder, ONU) para los países con campo 'owid'.",
        "licencia": "CC BY",
        "url": "https://ourworldindata.org/grapher/population",
        "script": os.path.join(RAIZ, "api", "fuentes", "owid_poblacion.py"),
    },
    "wikidata_batallas": {
        "nombre": "Wikidata — batallas",
        "descripcion": "Todas las batallas con coordenadas y fecha en las que participó cada país con 'wikidata' (y su linaje 'wikidata_hist'), asignadas al conflicto correspondiente.",
        "licencia": "CC0",
        "url": "https://query.wikidata.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikidata_batallas.py"),
    },
    "wikidata_gobernantes": {
        "nombre": "Wikidata — gobernantes",
        "descripcion": "Jefes de Estado (P35) y de gobierno (P6) históricos para los países con campo 'wikidata' (QID).",
        "licencia": "CC0",
        "url": "https://query.wikidata.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikidata_gobernantes.py"),
    },
    "wikidata_poblacion": {
        "nombre": "Wikidata — población",
        "descripcion": "Serie de población (P1082 con fecha) para los países con campo 'wikidata' (QID). Alternativa/complemento a OWID, útil para territorios sin campo 'owid'.",
        "licencia": "CC0",
        "url": "https://query.wikidata.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikidata_poblacion.py"),
    },
    "wikipedia_resenas": {
        "nombre": "Wikipedia — reseñas",
        "descripcion": "Breve reseña (≈2 frases) de cada país con campo 'wiki', tomada del resumen de Wikipedia en español (CC BY-SA, atribuida).",
        "licencia": "CC BY-SA",
        "url": "https://es.wikipedia.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikipedia_resenas.py"),
    },
    "wikidata_escudos": {
        "nombre": "Wikidata — escudos por época",
        "descripcion": "Escudo de armas (P94) con su vigencia para los países con 'wikidata'; usa las fechas de Wikidata y, si nombres_periodo enlaza entidades históricas (Qid), también sus escudos. El mapa muestra el del año consultado.",
        "licencia": "CC0",
        "url": "https://query.wikidata.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikidata_escudos.py"),
    },
    "wikidata_banderas": {
        "nombre": "Wikidata — banderas por época",
        "descripcion": "Bandera (P41) con su vigencia para los países con 'wikidata'; usa las fechas de Wikidata y, si nombres_periodo enlaza entidades históricas (Qid), también sus banderas. El mapa muestra la del año consultado (a elección: bandera o escudo).",
        "licencia": "CC0",
        "url": "https://query.wikidata.org/",
        "script": os.path.join(RAIZ, "api", "fuentes", "wikidata_banderas.py"),
    },
}

ingesta_en_curso = threading.Lock()

# límite de intentos de login: tras 5 fallos seguidos, 30 s de espera
login_lock = threading.Lock()
login_fallos = {"n": 0, "hasta": 0.0}

# estado en vivo de la ingesta actual (protegido por estado_lock)
estado_lock = threading.Lock()
ingesta_viva = {"fid": None, "demo": False, "inicio": None, "lineas": [], "terminada": True, "ok": None,
                "deteniendo": False}

# Tope de seguridad por conector: deliberadamente enorme (7 días). La cola está
# pensada para correr desatendida durante horas o días; si algo se queda colgado,
# el botón «⏹ Detener» del panel para el conector limpiamente (entre país y país,
# guardando el progreso) y la cola puede reanudarse desde ese conector.
LIMITE_CONECTOR = 7 * 24 * 3600


def _ajustes(con):
    con.execute("CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT)")


def ajuste_leer(clave, defecto=None):
    con = conectar(); _ajustes(con)
    fila = con.execute("SELECT valor FROM ajustes WHERE clave=?", (clave,)).fetchone()
    con.close()
    return json.loads(fila[0]) if fila else defecto


def ajuste_guardar(clave, valor):
    con = conectar(); _ajustes(con)
    if valor is None:
        con.execute("DELETE FROM ajustes WHERE clave=?", (clave,))
    else:
        con.execute("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?,?)", (clave, json.dumps(valor)))
    con.commit(); con.close()


def solo_nuevos():
    """Interruptor del panel: True (por defecto) = cada conector consulta solo los
    países que nunca consultó o que no tienen esa sección validada."""
    return bool(ajuste_leer("solo_nuevos", True))


def _correr_conector(fid, cfg, demo, limite=LIMITE_CONECTOR, todos=False):
    """Lanza UN conector como subproceso y vuelca su salida a ingesta_viva.
    Registra el resultado en la tabla 'ingestas' y devuelve el estado:
    'ok' | 'detenido' (el usuario pulsó Detener) | 'tiempo' (tope) | 'error'.
    NO toca el lock ni marca 'terminada' (de eso se encarga quien llama)."""
    args = [sys.executable, cfg["script"]] + (["--demo"] if demo else []) + (["--todos"] if todos else [])
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                cwd=RAIZ, encoding="utf-8", errors="replace",
                                bufsize=1, env=ENV_UTF8)
        cancelada = threading.Event()

        def cortafuegos():
            cancelada.set()
            proc.kill()

        matar = threading.Timer(limite, cortafuegos)
        matar.start()
        for linea in proc.stdout:
            with estado_lock:
                ingesta_viva["lineas"].append(linea.rstrip())
                del ingesta_viva["lineas"][:-500]  # conservar las últimas 500
        proc.wait()
        matar.cancel()
        if cancelada.is_set():
            estado = "tiempo"
            with estado_lock:
                ingesta_viva["lineas"].append(
                    f"✘ «{fid}» superó el tope de seguridad ({limite // 86400} días) y se canceló. "
                    "Si un conector no avanza, usa «⏹ Detener» en el panel: para entre país y país, "
                    "guarda el progreso y permite reanudar.")
        elif proc.returncode == CODIGO_DETENIDO:
            estado = "detenido"
        elif proc.returncode == 0:
            estado = "ok"
        else:
            estado = "error"
    except Exception as e:  # noqa: BLE001
        estado = "error"
        with estado_lock:
            ingesta_viva["lineas"].append(f"✘ error lanzando «{fid}»: {e}")
    with estado_lock:
        salida = "\n".join(ingesta_viva["lineas"])
    con = conectar(); init_ingestas(con)
    con.execute("INSERT OR REPLACE INTO ingestas (fuente, fecha, ok, salida) VALUES (?,?,?,?)",
                (fid, datetime.now().isoformat(timespec="seconds"), int(estado == "ok"), salida[-4000:]))
    con.commit(); con.close()
    return estado


def ejecutar_ingesta(fid, cfg, demo):
    """Corre en un hilo un solo conector y libera el lock al terminar."""
    limpiar_parada()
    estado = _correr_conector(fid, cfg, demo, todos=not solo_nuevos())
    limpiar_parada()
    with estado_lock:
        ingesta_viva["terminada"] = True
        ingesta_viva["ok"] = estado == "ok"
        ingesta_viva["estado"] = estado
        ingesta_viva["deteniendo"] = False
    ingesta_en_curso.release()


# orden de la cola «ejecutar todo»: primero lo ligero; las batallas al final (lo más pesado)
ORDEN_COLA = ["wikidata_gobernantes", "wikidata_poblacion", "owid_poblacion",
              "wikipedia_resenas", "wikidata_escudos", "wikidata_banderas", "wikidata_batallas"]


def orden_cola_completo():
    return [f for f in ORDEN_COLA if f in FUENTES] + [f for f in FUENTES if f not in ORDEN_COLA]


def cola_pendiente():
    """Conectores que quedaron por ejecutar de una cola detenida/interrumpida
    (el primero es el que se detuvo a medias), o None si no hay cola a medias."""
    pend = ajuste_leer("cola_pendiente")
    pend = [f for f in (pend or []) if f in FUENTES]
    return pend or None


def ejecutar_cola(demo, desde_cero=False):
    """Corre en un hilo TODOS los conectores en serie (sin soltar el lock entre
    uno y otro), pensado para dejarlo desatendido durante horas o días. Cada
    conector reanuda su propia pila, y la cola guarda en la base editorial qué
    conectores le quedan: si se detiene (botón Detener) o se corta (cierre del
    servidor), «Reanudar cola» sigue por el conector en que se quedó, no por el
    primero. NO exporta: solo deja propuestas."""
    limpiar_parada()
    completo = orden_cola_completo()
    orden = (None if desde_cero else cola_pendiente()) or completo
    total = len(completo)
    ya_hechos = total - len(orden)
    todos = not solo_nuevos()
    resultados = {}
    detenida = False
    for n, fid in enumerate(orden):
        i = ya_hechos + n + 1
        ajuste_guardar("cola_pendiente", orden[n:])
        with estado_lock:
            ingesta_viva["cola"] = {"actual": fid, "indice": i, "total": total, "hechas": dict(resultados)}
            ingesta_viva["lineas"].append("")
            ingesta_viva["lineas"].append(f"════════ ({i}/{total}) {FUENTES[fid]['nombre']} ════════")
            del ingesta_viva["lineas"][:-500]
        resultados[fid] = _correr_conector(fid, FUENTES[fid], demo, todos=todos)
        if resultados[fid] == "detenido":
            detenida = True
            break
    limpiar_parada()
    if detenida:
        # el conector detenido sigue pendiente: la próxima cola empieza por él
        idx = orden.index(fid)
        ajuste_guardar("cola_pendiente", orden[idx:])
        mensaje = (f"⏹ Cola detenida en «{FUENTES[fid]['nombre']}» ({i}/{total}). Su progreso está guardado: "
                   "«Reanudar cola» continuará por este conector, país a país, sin repetir nada.")
    else:
        ajuste_guardar("cola_pendiente", None)
        ok_n = sum(1 for v in resultados.values() if v == "ok")
        mensaje = f"✔ Cola terminada: {ok_n}/{len(orden)} conectores OK"
    with estado_lock:
        ingesta_viva["cola"] = {"actual": None, "indice": i if orden else 0, "total": total,
                                "hechas": dict(resultados), "detenida": detenida}
        ingesta_viva["lineas"].append("")
        ingesta_viva["lineas"].append(mensaje)
        del ingesta_viva["lineas"][:-500]
        ingesta_viva["terminada"] = True
        ingesta_viva["ok"] = (not detenida) and all(v == "ok" for v in resultados.values())
        ingesta_viva["estado"] = "detenido" if detenida else ("ok" if ingesta_viva["ok"] else "error")
        ingesta_viva["deteniendo"] = False
    ingesta_en_curso.release()


def init_ingestas(con):
    con.execute("""CREATE TABLE IF NOT EXISTS ingestas (
        fuente TEXT PRIMARY KEY, fecha TEXT, ok INTEGER, salida TEXT)""")


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    # --- utilidades ---
    def end_headers(self):
        # Los estáticos se revalidan siempre (304 si no cambiaron): así una
        # versión nueva de app.js o historia.json aparece con una recarga
        # normal, sin que el navegador se quede con copias antiguas.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def json_out(self, obj, code=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def json_in(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    # --- autenticación ---
    def token_de(self):
        auth = self.headers.get("Authorization") or ""
        return auth[7:].strip() if auth.startswith("Bearer ") else None

    def autenticado(self):
        con = conectar()
        usuario = validar_token(con, self.token_de())
        con.close()
        return usuario

    def exige_login(self, ruta):
        """Toda la API exige token salvo el propio login/alta."""
        PUBLICAS = ("/api/auth/estado", "/api/auth/login", "/api/auth/crear")
        return ruta.startswith("/api/") and ruta not in PUBLICAS

    def log_message(self, fmt, *args):  # silenciar estáticos, mantener API
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    # --- rutas ---
    def do_GET(self):
        ruta, _, query = self.path.partition("?")
        if ruta == "/api/auth/estado":
            con = conectar()
            configurado = hay_usuarios(con)
            usuario = validar_token(con, self.token_de())
            con.close()
            return self.json_out({"configurado": configurado, "autenticado": bool(usuario), "usuario": usuario})
        if self.exige_login(ruta) and not self.autenticado():
            return self.json_out({"error": "no autorizado: inicia sesión"}, 401)
        if ruta == "/api/estado":
            return self.api_estado()
        if ruta == "/api/fuentes":
            return self.api_fuentes()
        if ruta == "/api/mapeo":
            return self.api_mapeo()
        if ruta == "/api/ingestas/estado":
            with estado_lock:
                foto = dict(ingesta_viva, lineas=list(ingesta_viva["lineas"]))
            return self.json_out(foto)
        if ruta == "/api/ajustes":
            return self.api_ajustes()
        if ruta == "/api/propuestas":
            params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
            return self.api_propuestas(params.get("estado", "pendiente"))
        if ruta.startswith("/api/"):
            return self.json_out({"error": "ruta desconocida"}, 404)
        return super().do_GET()

    def do_POST(self):
        ruta = self.path.split("?")[0]
        if ruta == "/api/auth/crear":
            return self.api_auth_crear()
        if ruta == "/api/auth/login":
            return self.api_auth_login()
        if self.exige_login(ruta) and not self.autenticado():
            return self.json_out({"error": "no autorizado: inicia sesión"}, 401)
        if ruta == "/api/auth/salir":
            con = conectar(); cerrar_sesion(con, self.token_de()); con.close()
            return self.json_out({"cerrada": True})
        if ruta == "/api/ajustes":
            return self.api_ajustes_guardar()
        if ruta.startswith("/api/ingestas/"):
            resto = ruta[len("/api/ingestas/"):].strip("/").split("/")
            if len(resto) == 2 and resto[1] == "reiniciar":
                return self.api_reiniciar(resto[0])
            if resto[0] == "_detener":
                return self.api_detener()
            return self.api_ingesta(resto[0])
        if ruta == "/api/propuestas/accion":
            return self.api_accion()
        if ruta == "/api/propuestas/depurar":
            return self.api_depurar()
        if ruta == "/api/exportar":
            return self.api_exportar()
        return self.json_out({"error": "ruta desconocida"}, 404)

    # --- implementación ---
    def api_auth_crear(self):
        """Alta del administrador: solo funciona la primera vez (sin usuarios)."""
        datos = self.json_in()
        con = conectar()
        if hay_usuarios(con):
            con.close()
            return self.json_out({"error": "ya existe un administrador; inicia sesión"}, 403)
        error = crear_usuario(con, datos.get("usuario"), datos.get("password"))
        if error:
            con.close()
            return self.json_out({"error": error}, 400)
        token = crear_sesion(con, datos.get("usuario").strip())
        con.close()
        self.json_out({"token": token, "usuario": datos.get("usuario").strip()})

    def api_auth_login(self):
        with login_lock:
            if time.time() < login_fallos["hasta"]:
                espera = int(login_fallos["hasta"] - time.time()) + 1
                return self.json_out({"error": f"demasiados intentos; espera {espera} s"}, 429)
        datos = self.json_in()
        con = conectar()
        if not hay_usuarios(con):
            con.close()
            return self.json_out({"error": "aún no hay administrador; crea el usuario"}, 409)
        if not verificar(con, datos.get("usuario"), datos.get("password")):
            con.close()
            with login_lock:
                login_fallos["n"] += 1
                if login_fallos["n"] >= 5:
                    login_fallos["n"] = 0
                    login_fallos["hasta"] = time.time() + 30
            time.sleep(0.4)  # frenar fuerza bruta
            return self.json_out({"error": "usuario o contraseña incorrectos"}, 401)
        with login_lock:
            login_fallos["n"] = 0
        token = crear_sesion(con, datos.get("usuario").strip())
        con.close()
        self.json_out({"token": token, "usuario": datos.get("usuario").strip()})

    def api_estado(self):
        con = conectar(); init_ingestas(con)
        estados = dict(con.execute("SELECT estado, COUNT(*) FROM propuestas GROUP BY estado").fetchall())
        con.close()
        h = cargar_historia()
        self.json_out({
            "propuestas": estados,
            "paises": len(h.get("paises", [])),
            "conflictos": len(h.get("conflictos", [])),
            "eventos": len(h.get("eventos", [])),
            "con_owid": sum(1 for p in h["paises"] if p.get("owid")),
            "con_wikidata": sum(1 for p in h["paises"] if p.get("wikidata")),
        })

    def api_fuentes(self):
        con = conectar(); init_ingestas(con)
        ultimas = {f: {"fecha": fe, "ok": bool(ok), "salida": sa}
                   for f, fe, ok, sa in con.execute("SELECT fuente, fecha, ok, salida FROM ingestas")}
        h = cargar_historia()
        totales = {
            "owid_poblacion": sum(1 for p in h["paises"] if p.get("owid")),
            "wikidata_gobernantes": sum(1 for p in h["paises"] if p.get("wikidata")),
            "wikidata_batallas": sum(1 for p in h["paises"] if p.get("wikidata") or p.get("wikidata_hist")),
        }
        progresos = {}
        for fid in FUENTES:
            n = len(progreso_hechas(con, fid))
            if n:  # pila a medias: la próxima ejecución reanudará desde aquí
                progresos[fid] = {"hechas": n, "total": totales.get(fid)}
        con.close()
        self.json_out([{**{k: v for k, v in cfg.items() if k != "script"},
                        "id": fid, "ultima": ultimas.get(fid), "progreso": progresos.get(fid)}
                       for fid, cfg in FUENTES.items()])

    def api_mapeo(self):
        h = cargar_historia()
        self.json_out([{
            "id": p["id"], "nombre": p.get("nombre", p["id"]),
            "owid": p.get("owid"), "wikidata": p.get("wikidata"),
            "gobernantes": len(p.get("gobernantes", [])),
            "poblacion": len(p.get("poblacion", [])),
            "fuentes": [f.get("id") for f in p.get("fuentes", [])],
        } for p in h["paises"] if p.get("owid") or p.get("wikidata")])

    def api_propuestas(self, estado):
        con = conectar()
        filas = con.execute(
            "SELECT id, tipo, pais, resumen, fuente, estado, creado, payload FROM propuestas "
            "WHERE estado=? ORDER BY pais, id", (estado,)).fetchall()
        con.close()
        self.json_out([{"id": f[0], "tipo": f[1], "pais": f[2], "resumen": f[3], "fuente": f[4],
                        "estado": f[5], "creado": f[6], "payload": json.loads(f[7])} for f in filas])

    def api_ajustes(self):
        """Interruptor «solo países nuevos / todos», cola a medias y cuántos países
        ha consultado ya cada conector (registro permanente)."""
        con = conectar()
        consultados = {fid: len(consultas_hechas(con, fid)) for fid in FUENTES}
        con.close()
        pend = cola_pendiente()
        self.json_out({"solo_nuevos": solo_nuevos(), "consultados": consultados,
                       "limite_dias": LIMITE_CONECTOR // 86400,
                       "cola_pendiente": pend,
                       "cola_pendiente_nombres": [FUENTES[f]["nombre"] for f in (pend or [])],
                       "cola_total": len(orden_cola_completo())})

    def api_ajustes_guardar(self):
        datos = self.json_in()
        if "solo_nuevos" in datos:
            ajuste_guardar("solo_nuevos", bool(datos["solo_nuevos"]))
        if datos.get("olvidar_cola"):
            ajuste_guardar("cola_pendiente", None)
        return self.api_ajustes()

    def api_detener(self):
        """Pide parar la ingesta en curso: el conector termina el país que tiene a
        medias, guarda y sale; la cola no pasa al siguiente conector."""
        with estado_lock:
            if ingesta_viva["terminada"]:
                return self.json_out({"error": "no hay ninguna ingesta en curso"}, 409)
            ingesta_viva["deteniendo"] = True
            ingesta_viva["lineas"].append("⏹ Parada solicitada: se termina el país en curso y se guarda…")
        pedir_parada()
        self.json_out({"deteniendo": True})

    def api_ingesta(self, fid):
        if fid == "_cola":
            return self.api_ingesta_cola()
        cfg = FUENTES.get(fid)
        if not cfg:
            return self.json_out({"error": f"fuente desconocida: {fid}"}, 404)
        if not ingesta_en_curso.acquire(blocking=False):
            return self.json_out({"error": "ya hay una ingesta en curso"}, 409)
        demo = bool(self.json_in().get("demo"))
        with estado_lock:
            ingesta_viva.update({"fid": fid, "demo": demo, "inicio": datetime.now().isoformat(timespec="seconds"),
                                 "lineas": [], "terminada": False, "ok": None, "estado": None,
                                 "cola": None, "deteniendo": False})
        threading.Thread(target=ejecutar_ingesta, args=(fid, cfg, demo), daemon=True).start()
        self.json_out({"iniciada": True, "fid": fid, "demo": demo})

    def api_ingesta_cola(self):
        """Lanza TODOS los conectores en serie (para dejarlo corriendo desatendido).
        Si hay una cola a medias, la reanuda por el conector pendiente; con
        {"desde_cero": true} la olvida y empieza por el primero."""
        if not ingesta_en_curso.acquire(blocking=False):
            return self.json_out({"error": "ya hay una ingesta en curso"}, 409)
        datos = self.json_in()
        demo = bool(datos.get("demo"))
        desde_cero = bool(datos.get("desde_cero"))
        total = len(orden_cola_completo())
        with estado_lock:
            ingesta_viva.update({"fid": "_cola", "demo": demo, "inicio": datetime.now().isoformat(timespec="seconds"),
                                 "lineas": [], "terminada": False, "ok": None, "estado": None,
                                 "deteniendo": False,
                                 "cola": {"actual": None, "indice": 0, "total": total, "hechas": {}}})
        threading.Thread(target=ejecutar_cola, args=(demo, desde_cero), daemon=True).start()
        self.json_out({"iniciada": True, "fid": "_cola", "demo": demo, "reanudada": not desde_cero and bool(cola_pendiente())})

    def api_reiniciar(self, fid):
        """Olvida el progreso guardado de la pila de llamadas de una fuente:
        la próxima ingesta empezará desde el primer país."""
        if fid not in FUENTES:
            return self.json_out({"error": f"fuente desconocida: {fid}"}, 404)
        if not ingesta_en_curso.acquire(blocking=False):
            return self.json_out({"error": "hay una ingesta en curso; espera a que termine"}, 409)
        try:
            con = conectar()
            progreso_borrar(con, fid)
            con.close()
        finally:
            ingesta_en_curso.release()
        self.json_out({"reiniciada": True, "fid": fid})

    def api_accion(self):
        datos = self.json_in()
        ids = [int(i) for i in datos.get("ids", [])]
        accion = datos.get("accion")
        if accion not in ("aprobar", "rechazar") or not ids:
            return self.json_out({"error": "se espera {ids:[…], accion:'aprobar'|'rechazar'}"}, 400)
        nuevo = "aprobada" if accion == "aprobar" else "rechazada"
        con = conectar()
        con.executemany(f"UPDATE propuestas SET estado='{nuevo}' WHERE id=? AND estado='pendiente'",
                        [(i,) for i in ids])
        con.commit()
        cambiadas = con.total_changes
        con.close()
        self.json_out({"cambiadas": cambiadas, "estado": nuevo})

    def api_depurar(self):
        """Rechaza las propuestas de batalla pendientes que caen fuera del teatro
        de operaciones de su conflicto (asignación errónea por año+país)."""
        from wikidata_batallas import encaja_geo, MARGEN_GEO
        historia = cargar_historia()
        por_id = {c["id"]: c for c in historia.get("conflictos", [])}
        con = conectar()
        filas = con.execute(
            "SELECT id, pais, resumen, payload FROM propuestas WHERE estado='pendiente' AND tipo='batalla'").fetchall()
        rechazadas = []
        for pid, pais, resumen, payload in filas:
            p = json.loads(payload)
            c = por_id.get(p.get("conflicto"))
            b = p.get("batalla", {})
            if c and isinstance(b.get("lat"), (int, float)) and not encaja_geo(b, c):
                con.execute("UPDATE propuestas SET estado='rechazada' WHERE id=?", (pid,))
                rechazadas.append(f"✘ #{pid} [{pais}] {resumen} — fuera del teatro de «{c['nombre']}»")
        con.commit(); con.close()
        self.json_out({"rechazadas": len(rechazadas), "pendientes_revisadas": len(filas),
                       "margen_grados": MARGEN_GEO, "detalle": rechazadas})

    def api_exportar(self):
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "api", "exportar.py")],
                           capture_output=True, timeout=300, cwd=RAIZ,
                           encoding="utf-8", errors="replace", env=ENV_UTF8)
        self.json_out({"ok": r.returncode == 0, "salida": (r.stdout + r.stderr).strip()})


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 9000
    # la web descarga un único historia.json: se genera aquí a partir del árbol
    # datos/ (un fichero por entidad), igual que hace el despliegue en CI
    try:
        compilar_web()
        print("✔ web/data/historia.json compilado desde datos/")
    except Exception as e:  # noqa: BLE001 — sin datos válidos no tiene sentido servir la web
        print(f"✘ No se pudo compilar historia.json: {e}")
        print("  Corrige el fichero indicado (python api/validar.py te ayuda) y vuelve a arrancar.")
        return 1
    limpiar_parada()  # una señal de parada antigua no debe frenar la primera ingesta
    srv = ThreadingHTTPServer(("127.0.0.1", puerto), Manejador)
    print(f"Chronus Tabula en marcha:")
    print(f"  · Aplicación:  http://localhost:{puerto}/")
    print(f"  · Panel admin: http://localhost:{puerto}/admin.html")
    print("(Ctrl+C para parar)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nhasta luego")


if __name__ == "__main__":
    main()
