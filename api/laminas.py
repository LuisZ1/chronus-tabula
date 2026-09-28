#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenera las 21 láminas de la portada (web/img/lamina/, ver PROCEDENCIA.md).

    cd web && python3 -m http.server 9100 &      # la web servida en local
    python3 api/laminas.py [carpeta_salida]      # por defecto web/img/lamina/

Necesita playwright (Chromium) y Pillow. No forma parte de la canalización de datos.
"""
import asyncio, os, sys, tempfile
from playwright.async_api import async_playwright
from PIL import Image
RAIZ=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S=tempfile.mkdtemp(prefix='laminas-')+'/'
OUT=(sys.argv[1] if len(sys.argv)>1 else os.path.join(RAIZ,'web','img','lamina'))
OUT=OUT if OUT.endswith('/') else OUT+'/'
CSS="body>*:not(#map){display:none!important} .leaflet-control-container,.leaflet-tooltip-pane,.leaflet-popup-pane{display:none!important} #map{position:fixed!important;inset:0!important}"
ANIOS=[(-500,'ac500'),(1000,'1000'),(1492,'1492'),(1650,'1650'),(1815,'1815'),(1914,'1914'),(2010,'2010')]
async def main():
    os.makedirs(OUT,exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for nombre,vw,vh,dpr,vista in (('ancho',1600,900,1.25,'44.00/14.00/4'),('movil',780,1100,1,'42.00/12.00/3.3')):
            c=await b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=dpr,locale='es-ES')
            await c.add_init_script("localStorage.setItem('mapamundi.prefs', JSON.stringify({batallas:false,eventos:false,territorios:false,zonas:true,escudos:false,nombres:true,relleno:true}))")
            await c.route(lambda u: 'arcgis' in u or 'tile' in u or 'wikipedia' in u or 'wikimedia' in u, lambda r: r.abort())
            for y,suf in ANIOS:
                pg=await c.new_page(); await pg.goto(f'http://127.0.0.1:9100/mapa.html#{y}/{vista}'); await pg.wait_for_timeout(4000)
                await pg.add_style_tag(content=CSS); await pg.wait_for_timeout(800)
                await pg.screenshot(path=f'{S}{nombre}-{suf}.png'); await pg.close()
            await c.close()
        await b.close()
    for _,suf in ANIOS:
        a=Image.open(f'{S}ancho-{suf}.png').convert('RGB'); a.save(f'{OUT}ancho-{suf}.webp',quality=80,method=6)
        a.resize((1200,675),Image.LANCZOS).save(f'{OUT}medio-{suf}.webp',quality=80,method=6)
        Image.open(f'{S}movil-{suf}.png').convert('RGB').save(f'{OUT}movil-{suf}.webp',quality=80,method=6)
asyncio.run(main())
