/* Chronus Tabula — idioma.js
   Idioma de las páginas estáticas (portada, colaborar, fuentes, aviso legal).
      El español está escrito en el HTML; cada texto lleva su clave (data-i18n para el
   contenido; data-i18n-alt, -title, -aria, -placeholder para atributos) y los textos
   de cada idioma están en i18n/<idioma>.json, un árbol por página y sección
   (index.portada.titulo, comun.abrirMapa…; ver api/traducir_interfaz.py). Al volver
   al español se restaura el texto original del HTML. El idioma elegido se guarda en
   el mismo sitio que el del mapa (localStorage 'mapamundi.lang'), así que las páginas
   y el mapa van siempre en el mismo idioma.

   Para los textos que escriben los scripts: window.idioma.t(clave, {variables}),
   después de window.idioma.listo, y el evento 'idioma' en window cuando cambia. */
(function () {
	'use strict';
	var CLAVE = 'mapamundi.lang';
	var IDIOMAS = ['es', 'en'];
	var NOMBRES = { es: 'Español', en: 'English' };
	var ATRIBUTOS = {
		'data-i18n': null,
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

	/* {a: {b: 'x'}} → {'a.b': 'x'} */
	function aplanar(o, pref, out) {
		out = out || {};
		Object.keys(o).forEach(function (k) {
			var v = o[k];
			if (v && typeof v === 'object') aplanar(v, pref + k + '.', out);
			else out[pref + k] = v;
		});
		return out;
	}

	function t(clave, vars) {
		var txt = dicc[clave] != null ? String(dicc[clave]) : clave;
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
				var e = lang !== 'es' ? dicc[el.getAttribute(sel)] : null;
				var v = e != null ? e : o[k];
				if (destino) el.setAttribute(destino, v);
				else if (el.innerHTML !== v) el.innerHTML = v;
			});
		});
		// título y descripción de la página
		var d = document.querySelector('meta[name="description"]');
		var o = originales.get(document) || { titulo: document.title, desc: d ? d.content : '' };
		originales.set(document, o);
		var ti = lang !== 'es' && dicc[pagina + '.meta.titulo'];
		var de = lang !== 'es' && dicc[pagina + '.meta.descripcion'];
		document.title = ti || o.titulo;
		if (d) d.content = de || o.desc;
		pintarBoton();
		document.documentElement.classList.remove('i18n-espera');
	}

	function cargar(l) {
		return fetch('i18n/' + l + '.json', { cache: 'no-cache' })
			.then(function (r) {
				return r.ok ? r.json() : {};
			})
			.then(function (arbol) {
				return aplanar(arbol, '');
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
