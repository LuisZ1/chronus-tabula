/* Chronus Tabula — idioma.js
   Idioma de las páginas estáticas (portada, colaborar, fuentes, aviso legal).
   El español es el idioma fuente y está escrito en el HTML; cada texto lleva su
   clave (data-i18n-html, -alt, -title, -aria, -placeholder: las marca
   api/traducir_paginas.py) y las traducciones están en i18n/paginas.<idioma>.json.
   Al volver al español se restaura el texto original. El idioma elegido se guarda
   en el mismo sitio que el del mapa (localStorage 'mapamundi.lang'), así que las
   páginas y el mapa van siempre en el mismo idioma.

   Para los textos que escriben los scripts: window.idioma.t(clave, textoEspañol,
   {variables}) y el evento 'idioma' en window cuando cambia. */
(function () {
	'use strict';
	var CLAVE = 'mapamundi.lang';
	var IDIOMAS = ['es', 'en'];
	var NOMBRES = { es: 'Español', en: 'English' };
	var ATRIBUTOS = {
		'data-i18n-html': null,
		'data-i18n-alt': 'alt',
		'data-i18n-title': 'title',
		'data-i18n-aria': 'aria-label',
		'data-i18n-placeholder': 'placeholder'
	};
	var originales = new Map(); // elemento → {atributo: valor original}
	var dicc = {};
	var lang = 'es';
	var pagina = document.documentElement.getAttribute('data-pagina') || '';

	function guardado() {
		try {
			return localStorage.getItem(CLAVE);
		} catch (e) {
			return null;
		}
	}
	function inicial() {
		var s = guardado();
		if (IDIOMAS.indexOf(s) >= 0) return s;
		var nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
		return IDIOMAS.indexOf(nav) >= 0 ? nav : 'en';
	}

	function t(clave, es, vars) {
		var e = lang !== 'es' && dicc[clave];
		var txt = (e && (e.t || e)) || es || clave;
		if (vars)
			txt = txt.replace(/\{(\w+)\}/g, function (m, k) {
				return vars[k] != null ? vars[k] : m;
			});
		return txt;
	}

	function aplicar() {
		document.documentElement.lang = lang;
		Object.keys(ATRIBUTOS).forEach(function (sel) {
			var destino = ATRIBUTOS[sel];
			document.querySelectorAll('[' + sel + ']').forEach(function (el) {
				var o = originales.get(el) || {};
				var k = destino || 'html';
				if (!(k in o)) o[k] = destino ? el.getAttribute(destino) : el.innerHTML;
				originales.set(el, o);
				var e = lang !== 'es' && dicc[el.getAttribute(sel)];
				var v = e ? e.t : o[k];
				if (destino) el.setAttribute(destino, v);
				else if (el.innerHTML !== v) el.innerHTML = v;
			});
		});
		// título y descripción de la página
		var d = document.querySelector('meta[name="description"]');
		var o = originales.get(document) || { titulo: document.title, desc: d ? d.content : '' };
		originales.set(document, o);
		document.title = t(pagina + '.titulo', o.titulo);
		if (d) d.content = t(pagina + '.descripcion', o.desc);
		pintarBoton();
		document.documentElement.classList.remove('i18n-espera');
	}

	function cargar(l) {
		if (l === 'es') return Promise.resolve({});
		return fetch('i18n/paginas.' + l + '.json', { cache: 'no-cache' })
			.then(function (r) {
				return r.ok ? r.json() : {};
			})
			.catch(function () {
				return {};
			});
	}

	function cambiar(l) {
		if (IDIOMAS.indexOf(l) < 0) l = 'es';
		try {
			localStorage.setItem(CLAVE, l);
		} catch (e) {}
		return cargar(l).then(function (d) {
			dicc = d;
			lang = l;
			aplicar();
			window.dispatchEvent(new CustomEvent('idioma', { detail: l }));
		});
	}

	/* ---------- el botón con la bandera y su menú (como en el mapa) ---------- */
	var btn, menu, ops;
	function pintarBoton() {
		if (!btn) return;
		var actual = ops.filter(function (o) {
			return o.dataset.lang === lang;
		})[0] || ops[0];
		btn.querySelector('.bandera').textContent = actual.querySelector('.bandera').textContent;
		btn.setAttribute('aria-label', 'Idioma · Language: ' + NOMBRES[lang]);
		ops.forEach(function (o) {
			o.setAttribute('aria-selected', o === actual ? 'true' : 'false');
		});
	}
	function montarMenu() {
		btn = document.getElementById('langBtn');
		menu = document.getElementById('langMenu');
		if (!btn || !menu) return;
		ops = Array.prototype.slice.call(menu.querySelectorAll('[role=option]'));
		function abrir() {
			menu.hidden = false;
			btn.setAttribute('aria-expanded', 'true');
			(ops.filter(function (o) {
				return o.getAttribute('aria-selected') === 'true';
			})[0] || ops[0]).focus();
		}
		function cerrar(foco) {
			menu.hidden = true;
			btn.setAttribute('aria-expanded', 'false');
			if (foco) btn.focus();
		}
		function elegir(o) {
			cerrar(true);
			if (o.dataset.lang !== lang) cambiar(o.dataset.lang);
		}
		btn.addEventListener('click', function () {
			menu.hidden ? abrir() : cerrar();
		});
		btn.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				abrir();
			}
		});
		ops.forEach(function (o, i) {
			o.tabIndex = -1;
			o.addEventListener('click', function () {
				elegir(o);
			});
			o.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					elegir(o);
				} else if (e.key === 'Escape') cerrar(true);
				else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					e.preventDefault();
					ops[(i + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length].focus();
				} else if (e.key === 'Tab') cerrar();
			});
		});
		document.addEventListener('pointerdown', function (e) {
			if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) cerrar();
		});
	}

	var listo = new Promise(function (resolver) {
		function arrancar() {
			montarMenu();
			var l = inicial();
			cargar(l).then(function (d) {
				dicc = d;
				lang = l;
				aplicar();
				resolver(l);
				window.dispatchEvent(new CustomEvent('idioma', { detail: l }));
			});
		}
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
		else arrancar();
	});

	window.idioma = {
		t: t,
		cambiar: cambiar,
		listo: listo,
		get lang() {
			return lang;
		}
	};
})();
