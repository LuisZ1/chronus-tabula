/* Textos de la aplicación del mapa: la rama «mapa» de i18n/<idioma>.json (el mismo
   catálogo que las páginas; ver api/traducir_interfaz.py). Las claves van sin el
   prefijo: t('ui.loading') es mapa.ui.loading.
   Para añadir un idioma: crear i18n/xx.json y añadir la opción al <select>. */
const i18n = {
	lang: 'es',
	dict: {},
	supported: ['es', 'en'],

	async init() {
		const saved = localStorage.getItem('mapamundi.lang');
		const nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
		const lang = saved || (this.supported.includes(nav) ? nav : 'en');
		await this.setLang(lang);
	},

	async setLang(lang) {
		if (!this.supported.includes(lang)) lang = 'en';
		const res = await fetch(`i18n/${lang}.json`);
		this.dict = this.aplanar((await res.json()).mapa || {});
		this.lang = lang;
		localStorage.setItem('mapamundi.lang', lang);
		document.documentElement.lang = lang;
		this.apply();
	},

	/* {ui: {loading: '…'}} → {'ui.loading': '…'} */
	aplanar(o, pref = '', out = {}) {
		for (const [k, v] of Object.entries(o)) {
			if (v && typeof v === 'object') this.aplanar(v, `${pref}${k}.`, out);
			else out[pref + k] = v;
		}
		return out;
	},

	t(key) {
		return this.dict[key] !== undefined ? this.dict[key] : key;
	},

	/* Formatea un año: -500 -> "500 a. C.", 1492 -> "1492" */
	formatYear(y) {
		return y < 0 ? `${-y} ${this.t('year.bc')}` : `${y}`;
	},

	apply() {
		document.querySelectorAll('[data-i18n]').forEach(el => {
			el.textContent = this.t(el.dataset.i18n);
		});
		document.querySelectorAll('[data-i18n-title]').forEach(el => {
			el.title = this.t(el.dataset.i18nTitle);
		});
		document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
			el.placeholder = this.t(el.dataset.i18nPlaceholder);
		});
		document.querySelectorAll('[data-i18n-aria]').forEach(el => {
			el.setAttribute('aria-label', this.t(el.dataset.i18nAria));
		});
		document.title = this.t('app.title');
	}
};
