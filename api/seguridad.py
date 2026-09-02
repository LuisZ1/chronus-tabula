#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seguridad del panel de administración de Chronus Tabula.

Solo librería estándar. La contraseña se guarda como hash PBKDF2-SHA256 con
sal aleatoria (nunca en claro); los tokens de sesión son aleatorios
(secrets) y en la base solo se guarda su hash SHA-256, con caducidad
renovable de 7 días. Todo vive en la base editorial local (editorial.db),
que está en .gitignore y nunca se sube al repositorio.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

ITERACIONES = 240_000          # PBKDF2-SHA256
CADUCIDAD = timedelta(days=7)  # renovable: cada uso extiende la sesión
MIN_PASSWORD = 8


def init_seguridad(con):
    con.execute("""CREATE TABLE IF NOT EXISTS usuarios (
        usuario TEXT PRIMARY KEY,
        sal     BLOB NOT NULL,
        hash    BLOB NOT NULL,
        creado  TEXT NOT NULL)""")
    con.execute("""CREATE TABLE IF NOT EXISTS sesiones (
        token_hash TEXT PRIMARY KEY,
        usuario    TEXT NOT NULL,
        caduca     TEXT NOT NULL)""")


def _ahora():
    return datetime.now()


def _hash_password(password, sal):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal, ITERACIONES)


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hay_usuarios(con):
    init_seguridad(con)
    return con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] > 0


def crear_usuario(con, usuario, password):
    """Da de alta al administrador. Devuelve un mensaje de error o None si todo va bien."""
    init_seguridad(con)
    usuario = (usuario or "").strip()
    if not usuario:
        return "falta el nombre de usuario"
    if len(password or "") < MIN_PASSWORD:
        return f"la contraseña debe tener al menos {MIN_PASSWORD} caracteres"
    sal = secrets.token_bytes(16)
    con.execute("INSERT OR REPLACE INTO usuarios (usuario, sal, hash, creado) VALUES (?,?,?,?)",
                (usuario, sal, _hash_password(password, sal), _ahora().isoformat(timespec="seconds")))
    con.commit()
    return None


def verificar(con, usuario, password):
    init_seguridad(con)
    fila = con.execute("SELECT sal, hash FROM usuarios WHERE usuario=?", ((usuario or "").strip(),)).fetchone()
    if not fila:
        # coste constante aunque el usuario no exista (no revelar cuál falló)
        _hash_password(password or "", b"x" * 16)
        return False
    return hmac.compare_digest(_hash_password(password or "", fila[0]), fila[1])


def crear_sesion(con, usuario):
    init_seguridad(con)
    token = secrets.token_urlsafe(32)
    caduca = (_ahora() + CADUCIDAD).isoformat(timespec="seconds")
    con.execute("INSERT INTO sesiones (token_hash, usuario, caduca) VALUES (?,?,?)",
                (_hash_token(token), usuario, caduca))
    con.commit()
    return token


def validar_token(con, token):
    """Devuelve el usuario si el token es válido; renueva su caducidad y purga las sesiones vencidas."""
    if not token:
        return None
    init_seguridad(con)
    ahora = _ahora().isoformat(timespec="seconds")
    con.execute("DELETE FROM sesiones WHERE caduca < ?", (ahora,))
    fila = con.execute("SELECT usuario FROM sesiones WHERE token_hash=? AND caduca >= ?",
                       (_hash_token(token), ahora)).fetchone()
    if not fila:
        con.commit()
        return None
    con.execute("UPDATE sesiones SET caduca=? WHERE token_hash=?",
                ((_ahora() + CADUCIDAD).isoformat(timespec="seconds"), _hash_token(token)))
    con.commit()
    return fila[0]


def cerrar_sesion(con, token):
    if not token:
        return
    init_seguridad(con)
    con.execute("DELETE FROM sesiones WHERE token_hash=?", (_hash_token(token),))
    con.commit()
