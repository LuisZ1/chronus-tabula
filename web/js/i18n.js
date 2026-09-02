/* Sistema i18n minimalista basado en ficheros JSON en /i18n.
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
		this.dict = await res.json();
		this.lang = lang;
		localStorage.setItem('mapamundi.lang', lang);
		document.documentElement.lang = lang;
		this.apply();
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
		document.title = this.t('app.title');
	}
};
