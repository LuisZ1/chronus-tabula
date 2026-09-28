/* Chronus Tabula — portada.js
   La lámina: la barra de escala cambia la captura del año (fundido), el año de
   la cartela rueda y el botón abre ese mismo año en el mapa. Al cargar, un
   único empujón 1492 → 1650 → 1492 enseña el gesto (no con «reducir
   movimiento», ni si el visitante ya ha tocado la escala). Además, los botones
   «Copiar» de los enlaces a momentos. */
(function () {
	'use strict';

	var ANIOS = [
		{ anio: -500, texto: '500 a. C.', corto: '−500', vista: '-500/35.00/30.00/3' },
		{ anio: 1000, texto: '1000', corto: '1000', vista: '1000/35.00/30.00/3' },
		{ anio: 1492, texto: '1492', corto: '1492', vista: '1492/30.00/10.00/3' },
		{ anio: 1650, texto: '1650', corto: '1650', vista: '1650/30.00/10.00/3' },
		{ anio: 1815, texto: '1815', corto: '1815', vista: '1815/30.00/10.00/3' },
		{ anio: 1914, texto: '1914', corto: '1914', vista: '1914/30.00/10.00/3' },
		{ anio: 2010, texto: '2010', corto: '2010', vista: '2010/30.00/10.00/3' }
	];
	var ALT = 'Mapa político del mundo en {a}, cada estado con su color.';

	var reducir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
	var rango = document.getElementById('escalaAnios');
	var botones = Array.prototype.slice.call(document.querySelectorAll('.escala-anios button'));
	var fotos = Array.prototype.slice.call(document.querySelectorAll('#laminaFotos picture'));
	var anioEl = document.getElementById('anioCartela');
	var abrir = document.getElementById('abrirAnio');
	var actual = 2;
	var tocado = false;

	/* carga diferida de una captura: data-srcset/data-src → srcset/src */
	function cargar(i) {
		var p = fotos[i];
		if (!p || p.dataset.cargada) return;
		p.dataset.cargada = '1';
		Array.prototype.forEach.call(p.querySelectorAll('source[data-srcset]'), function (s) {
			s.srcset = s.dataset.srcset;
		});
		var img = p.querySelector('img');
		if (img.dataset.src) img.src = img.dataset.src;
	}

	function rodarAnio(texto, dir) {
		if (anioEl.textContent === texto) return;
		if (reducir || !anioEl.animate) {
			anioEl.textContent = texto;
			return;
		}
		var sale = anioEl.animate(
			[{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(' + (-40 * dir) + '%)', opacity: 0 }],
			{ duration: 120, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
		);
		sale.onfinish = function () {
			anioEl.textContent = texto;
			anioEl.animate(
				[{ transform: 'translateY(' + (40 * dir) + '%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
				{ duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
			);
		};
	}

	function ir(i) {
		i = Math.max(0, Math.min(ANIOS.length - 1, i));
		if (i === actual) return;
		var dir = i > actual ? 1 : -1;
		var a = ANIOS[i];
		cargar(i);
		fotos.forEach(function (p, k) {
			var img = p.querySelector('img');
			img.classList.toggle('activa', k === i);
			img.alt = k === i ? ALT.replace('{a}', a.texto) : '';
		});
		rodarAnio(a.texto, dir);
		abrir.href = 'mapa.html#' + a.vista;
		abrir.textContent = 'Abrir ' + a.texto + ' en el mapa';
		rango.value = String(i);
		rango.setAttribute('aria-valuetext', a.texto);
		botones.forEach(function (b, k) {
			b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
		});
		// precargar los vecinos para que el siguiente fundido no espere
		cargar(i - 1);
		cargar(i + 1);
		actual = i;
	}

	if (rango && anioEl && abrir && fotos.length === ANIOS.length) {
		rango.addEventListener('input', function () {
			tocado = true;
			ir(parseInt(rango.value, 10));
		});
		botones.forEach(function (b) {
			b.addEventListener('click', function () {
				tocado = true;
				ir(parseInt(b.dataset.i, 10));
			});
		});

		// el resto de capturas, cuando el navegador esté libre
		var ocioso = window.requestIdleCallback || function (f) { return setTimeout(f, 1200); };
		window.addEventListener('load', function () {
			ocioso(function () {
				for (var k = 0; k < ANIOS.length; k++) cargar(k);
			});
		});

		// el empujón que enseña el gesto: una sola vez
		if (!reducir) {
			window.addEventListener('load', function () {
				cargar(3);
				setTimeout(function () {
					if (tocado || document.hidden) return;
					ir(3);
					setTimeout(function () {
						if (!tocado) ir(2);
					}, 1500);
				}, 1400);
			});
		}
	}

	/* la ayuda del mapa enlaza a index.html#controles: abrir el desplegable y llevarlo a la vista */
	function abrirControles() {
		if (location.hash !== '#controles') return;
		var d = document.getElementById('controles');
		if (!d) return;
		d.open = true;
		d.scrollIntoView({ block: 'start', behavior: reducir ? 'auto' : 'smooth' });
		var s = d.querySelector('summary');
		if (s) s.focus({ preventScroll: true });
	}
	abrirControles();
	window.addEventListener('hashchange', abrirControles);

	/* copiar enlaces a momentos: la URL absoluta de la página actual */
	function urlCompleta(rel) {
		try {
			return new URL(rel, location.href).href;
		} catch (e) {
			return rel;
		}
	}
	var ej = document.getElementById('enlaceEjemplo');
	if (ej) {
		var u = urlCompleta('mapa.html#1492/38.00/-4.00/5');
		if (/^https?:/.test(u)) ej.textContent = u.replace(/^https?:\/\//, '');
	}
	function copiarTexto(t) {
		if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
		return new Promise(function (ok, mal) {
			var ta = document.createElement('textarea');
			ta.value = t;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand('copy') ? ok() : mal();
			} catch (e) {
				mal(e);
			}
			document.body.removeChild(ta);
		});
	}
	Array.prototype.forEach.call(document.querySelectorAll('.copiar[data-copiar]'), function (b) {
		var original = b.textContent;
		b.addEventListener('click', function () {
			copiarTexto(urlCompleta(b.dataset.copiar)).then(
				function () {
					b.textContent = 'Copiado';
					b.classList.add('hecho');
				},
				function () {
					b.textContent = 'Selecciona y copia';
				}
			);
			clearTimeout(b._t);
			b._t = setTimeout(function () {
				b.textContent = original;
				b.classList.remove('hecho');
			}, 1800);
		});
	});
})();
