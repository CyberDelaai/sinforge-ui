(function (SINFORGE) {
  'use strict';
  const $ = SINFORGE.$;
  // ---- UI translations (the top-right language picker). Brand names, the menu
  // and the version stay as-is; everything else switches. Translatable DOM nodes
  // carry data-i18n / data-i18n-title attributes; applyLang rewrites them. ----
  const I18N = {
    en: { h_controls: '// CONTROLS', h_output: '// OUTPUT',
      hint_controls: 'Document controls will live here.',
      hint_output: 'Export settings will live here.',
      ph_title: 'NO DOCUMENT LOADED',
      ph_body: 'SINFORGE is compiling — the document workspace goes here.',
      b_export: 'EXPORT PNG',
      tag: 'DOCUMENT FORGE', tag_alt: 'FORGE YOUR SIN' },
    ru: { h_controls: '// УПРАВЛЕНИЕ', h_output: '// ВЫВОД',
      hint_controls: 'Здесь будут настройки документа.',
      hint_output: 'Здесь будут настройки экспорта.',
      ph_title: 'ДОКУМЕНТ НЕ ЗАГРУЖЕН',
      ph_body: 'SINFORGE в разработке — здесь будет рабочая область.',
      b_export: 'ЭКСПОРТ PNG',
      tag: 'КУЗНИЦА ДОКУМЕНТОВ', tag_alt: 'ВЫКУЙ СВОЙ SIN' },
    fr: { h_controls: '// COMMANDES', h_output: '// SORTIE',
      hint_controls: 'Les réglages du document seront ici.',
      hint_output: "Les réglages d'export seront ici.",
      ph_title: 'AUCUN DOCUMENT CHARGÉ',
      ph_body: "SINFORGE est en compilation — l'espace de travail arrive ici.",
      b_export: 'EXPORTER PNG',
      tag: 'FORGE DE DOCUMENTS', tag_alt: 'FORGE TON SIN' },
    de: { h_controls: '// STEUERUNG', h_output: '// AUSGABE',
      hint_controls: 'Hier kommen die Dokument-Einstellungen hin.',
      hint_output: 'Hier kommen die Export-Einstellungen hin.',
      ph_title: 'KEIN DOKUMENT GELADEN',
      ph_body: 'SINFORGE wird kompiliert — hier entsteht der Dokument-Arbeitsbereich.',
      b_export: 'PNG EXPORTIEREN',
      tag: 'DOKUMENTENSCHMIEDE', tag_alt: 'SCHMIEDE DEINE SIN' },
    es: { h_controls: '// CONTROLES', h_output: '// SALIDA',
      hint_controls: 'Aquí irán los ajustes del documento.',
      hint_output: 'Aquí irán los ajustes de exportación.',
      ph_title: 'NINGÚN DOCUMENTO CARGADO',
      ph_body: 'SINFORGE está compilando — aquí irá el área de trabajo.',
      b_export: 'EXPORTAR PNG',
      tag: 'FORJA DE DOCUMENTOS', tag_alt: 'FORJA TU SIN' },
    it: { h_controls: '// CONTROLLI', h_output: '// OUTPUT',
      hint_controls: 'Qui andranno le impostazioni del documento.',
      hint_output: "Qui andranno le impostazioni d'esportazione.",
      ph_title: 'NESSUN DOCUMENTO CARICATO',
      ph_body: "SINFORGE è in compilazione — qui ci sarà l'area di lavoro.",
      b_export: 'ESPORTA PNG',
      tag: 'FORGIA DI DOCUMENTI', tag_alt: 'FORGIA IL TUO SIN' },
    ja: { h_controls: '// コントロール', h_output: '// 出力',
      hint_controls: 'ここにドキュメント設定が入ります。',
      hint_output: 'ここにエクスポート設定が入ります。',
      ph_title: 'ドキュメント未読み込み',
      ph_body: 'SINFORGE はコンパイル中 — ここに作業エリアが入ります。',
      b_export: 'PNG書き出し',
      tag: 'ドキュメント鍛造所', tag_alt: 'SINを鍛えろ' },
    zh: { h_controls: '// 控制', h_output: '// 输出',
      hint_controls: '文档设置将在此处。',
      hint_output: '导出设置将在此处。',
      ph_title: '未加载文档',
      ph_body: 'SINFORGE 编译中 — 此处将是文档工作区。',
      b_export: '导出 PNG',
      tag: '证件锻造厂', tag_alt: '锻造你的 SIN' },
  };
  let lang = 'en';

  // Translate a key in the current language, falling back to English.
  SINFORGE.t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;

  // Rewrite every data-i18n / data-i18n-title node for the chosen language.
  SINFORGE.applyLang = function applyLang(code) {
    lang = I18N[code] ? code : 'en';
    SINFORGE.state.lang = lang;
    SINFORGE.save('sinforge:lang', lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = SINFORGE.t(el.getAttribute('data-i18n'));
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const v = SINFORGE.t(el.getAttribute('data-i18n-title'));
      if (v) el.setAttribute('title', v);
    });
    document.documentElement.lang = lang;
  };

  // Wire the picker + restore the saved language on load.
  document.addEventListener('DOMContentLoaded', () => {
    const sel = $('uiLangSel');
    const saved = (() => { try { return localStorage.getItem('sinforge:lang'); } catch (e) { return null; } })();
    const start = saved && I18N[saved] ? saved : 'en';
    if (sel) {
      sel.value = start;
      sel.addEventListener('change', () => SINFORGE.applyLang(sel.value));
    }
    SINFORGE.applyLang(start);
  });
})(window.SINFORGE);
