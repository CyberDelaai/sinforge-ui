(function (SINFORGE) {
  'use strict';
  const $ = SINFORGE.$;
  // ---- UI translations (the top-right language picker). Brand names, the menu
  // and the version stay as-is; everything else switches. Translatable DOM nodes
  // carry data-i18n / data-i18n-title attributes; applyLang rewrites them. ----
  const I18N = {
    en: { l_invert: 'INVERT COLOURS', l_blend: 'BLEND', bl_smart: 'SMART', bl_normal: 'NORMAL', l_rotation: 'ROTATION', hint_dial: 'Drag to rotate · Shift snaps to 15° · double-click resets', l_tone: 'TONE', t_custom: 'CUSTOM', l_color: 'COLOUR', l_tile: 'TILE', l_wm: 'WATERMARK', wm_off: 'OFF', wm_text: 'TEXT', wm_image: 'IMAGE', b_clear: 'CLEAR', l_tint: 'TINT', l_potency: 'POTENCY', st_wm: 'Watermark loaded',
      b_gen: 'Generate a random serial', h_doc: '// DOCUMENT', h_style: '// STYLE', h_output: '// OUTPUT',
      l_blank: 'BLANK', bl_event_badge: 'EVENT BADGE',
      f_number: 'BADGE NUMBER', f_role: 'ROLE TAG', f_title: 'TITLE',
      f_name1: 'NAME — LINE 1', f_name2: 'NAME — LINE 2', f_footer: 'FOOTER LINE',
      l_photo: 'PHOTO', b_upload: 'UPLOAD', b_doggo: 'DOGGO', b_reset: 'RESET', l_zoom: 'ZOOM',
      hint_photo: 'Drag the photo to move it, scroll to zoom. Drop or paste an image anywhere.',
      l_photofx: 'PHOTO FX', l_mode: 'MODE', fx_none: 'ORIGINAL', fx_mono: 'THRESHOLD',
      fx_halftone: 'HALFTONE', fx_dither: 'DITHER', l_level: 'LEVEL', l_dot: 'DOT SIZE',
      l_scheme: 'SCHEME', c_card: 'CARD', c_ink: 'INK', c_accent: 'ACCENT',
      l_decor: 'DECOR', d_stripes: 'SIDE STRIPES', d_slashes: 'SLASHES', d_barcode: 'BARCODE', d_edge: 'EDGE LINE',
      l_fx: 'EFFECTS', e_glow: 'GLOW', e_grain: 'GRAIN', e_scan: 'SCANLINES', l_amount: 'AMOUNT',
      sw_off: 'OFF', sw_on: 'ON', l_scale: 'SCALE', b_export: 'EXPORT PNG',
      b_copy: 'COPY TO CLIPBOARD', st_copied: 'Copied to clipboard', st_copyfail: 'This browser could not copy the image.',
      st_exported: 'Exported {f}', st_photo: 'Photo loaded', st_badimg: 'That file is not an image.',
      st_fail: 'Export failed.',
      tag: 'DOCUMENT FORGE', tag_alt: 'FORGE YOUR SIN' },
    ru: { l_invert: 'ИНВЕРСИЯ ЦВЕТОВ', l_blend: 'СМЕШИВАНИЕ', bl_smart: 'УМНОЕ', bl_normal: 'ОБЫЧНОЕ', l_rotation: 'ПОВОРОТ', hint_dial: 'Тяните, чтобы повернуть · Shift — шаг 15° · двойной клик — сброс', l_tone: 'ТОН', t_custom: 'СВОЙ', l_color: 'ЦВЕТ', l_tile: 'ПЛИТКОЙ', l_wm: 'ВОДЯНОЙ ЗНАК', wm_off: 'ВЫКЛ', wm_text: 'ТЕКСТ', wm_image: 'КАРТИНКА', b_clear: 'УБРАТЬ', l_tint: 'ТОНИРОВАТЬ', l_potency: 'СИЛА', st_wm: 'Водяной знак загружен',
      b_gen: 'Сгенерировать случайный номер', h_doc: '// ДОКУМЕНТ', h_style: '// СТИЛЬ', h_output: '// ВЫВОД',
      l_blank: 'БЛАНК', bl_event_badge: 'БЕЙДЖ МЕРОПРИЯТИЯ',
      f_number: 'НОМЕР БЕЙДЖА', f_role: 'РОЛЬ', f_title: 'ОБРАЩЕНИЕ',
      f_name1: 'ИМЯ — СТРОКА 1', f_name2: 'ИМЯ — СТРОКА 2', f_footer: 'НИЖНЯЯ СТРОКА',
      l_photo: 'ФОТО', b_upload: 'ЗАГРУЗИТЬ', b_doggo: 'ДОГГО', b_reset: 'СБРОС', l_zoom: 'МАСШТАБ',
      hint_photo: 'Перетаскивайте фото, колесо — масштаб. Изображение можно бросить или вставить в любом месте.',
      l_photofx: 'ЭФФЕКТ ФОТО', l_mode: 'РЕЖИМ', fx_none: 'ОРИГИНАЛ', fx_mono: 'ПОРОГ',
      fx_halftone: 'РАСТР', fx_dither: 'ДИЗЕРИНГ', l_level: 'УРОВЕНЬ', l_dot: 'РАЗМЕР ТОЧКИ',
      l_scheme: 'СХЕМА', c_card: 'КАРТА', c_ink: 'ЧЕРНИЛА', c_accent: 'АКЦЕНТ',
      l_decor: 'ДЕКОР', d_stripes: 'БОКОВЫЕ ПОЛОСЫ', d_slashes: 'НАСЕЧКИ', d_barcode: 'ШТРИХКОД', d_edge: 'КОНТУР',
      l_fx: 'ЭФФЕКТЫ', e_glow: 'СВЕЧЕНИЕ', e_grain: 'ЗЕРНО', e_scan: 'СКАНЛАЙНЫ', l_amount: 'СИЛА',
      sw_off: 'ВЫКЛ', sw_on: 'ВКЛ', l_scale: 'МАСШТАБ', b_export: 'ЭКСПОРТ PNG',
      b_copy: 'КОПИРОВАТЬ В БУФЕР', st_copied: 'Скопировано в буфер обмена', st_copyfail: 'Браузер не смог скопировать изображение.',
      st_exported: 'Сохранено: {f}', st_photo: 'Фото загружено', st_badimg: 'Этот файл не является изображением.',
      st_fail: 'Экспорт не удался.',
      tag: 'КУЗНИЦА ДОКУМЕНТОВ', tag_alt: 'ВЫКУЙ СВОЙ SIN' },
    fr: { l_invert: 'INVERSER', l_blend: 'FUSION', bl_smart: 'AUTO', bl_normal: 'NORMAL', l_rotation: 'ROTATION', hint_dial: 'Glissez pour tourner · Maj : pas de 15° · double-clic : réinitialiser', l_tone: 'TON', t_custom: 'PERSO', l_color: 'COULEUR', l_tile: 'MOSAÏQUE', l_wm: 'FILIGRANE', wm_off: 'NON', wm_text: 'TEXTE', wm_image: 'IMAGE', b_clear: 'RETIRER', l_tint: 'TEINTER', l_potency: 'INTENSITÉ', st_wm: 'Filigrane chargé',
      b_gen: 'Générer un numéro aléatoire', h_doc: '// DOCUMENT', h_style: '// STYLE', h_output: '// SORTIE',
      l_blank: 'MODÈLE', bl_event_badge: "BADGE D'ÉVÉNEMENT",
      f_number: 'NUMÉRO DU BADGE', f_role: 'RÔLE', f_title: 'CIVILITÉ',
      f_name1: 'NOM — LIGNE 1', f_name2: 'NOM — LIGNE 2', f_footer: 'LIGNE DU BAS',
      l_photo: 'PHOTO', b_upload: 'CHARGER', b_doggo: 'DOGGO', b_reset: 'RÉINIT.', l_zoom: 'ZOOM',
      hint_photo: 'Glissez la photo pour la déplacer, molette pour zoomer. Déposez ou collez une image n’importe où.',
      l_photofx: 'EFFET PHOTO', l_mode: 'MODE', fx_none: 'ORIGINAL', fx_mono: 'SEUIL',
      fx_halftone: 'TRAME', fx_dither: 'TRAMAGE', l_level: 'NIVEAU', l_dot: 'TAILLE DU POINT',
      l_scheme: 'PALETTE', c_card: 'CARTE', c_ink: 'ENCRE', c_accent: 'ACCENT',
      l_decor: 'DÉCOR', d_stripes: 'BANDES LATÉRALES', d_slashes: 'BARRES', d_barcode: 'CODE-BARRES', d_edge: 'CONTOUR',
      l_fx: 'EFFETS', e_glow: 'HALO', e_grain: 'GRAIN', e_scan: 'LIGNES', l_amount: 'INTENSITÉ',
      sw_off: 'NON', sw_on: 'OUI', l_scale: 'ÉCHELLE', b_export: 'EXPORTER PNG',
      b_copy: 'COPIER', st_copied: 'Copié dans le presse-papiers', st_copyfail: "Ce navigateur n'a pas pu copier l'image.",
      st_exported: 'Exporté : {f}', st_photo: 'Photo chargée', st_badimg: "Ce fichier n'est pas une image.",
      st_fail: "L'export a échoué.",
      tag: 'FORGE DE DOCUMENTS', tag_alt: 'FORGE TON SIN' },
    de: { l_invert: 'FARBEN UMKEHREN', l_blend: 'MISCHMODUS', bl_smart: 'SMART', bl_normal: 'NORMAL', l_rotation: 'DREHUNG', hint_dial: 'Ziehen zum Drehen · Umschalt rastet auf 15° · Doppelklick setzt zurück', l_tone: 'TON', t_custom: 'EIGENE', l_color: 'FARBE', l_tile: 'KACHELN', l_wm: 'WASSERZEICHEN', wm_off: 'AUS', wm_text: 'TEXT', wm_image: 'BILD', b_clear: 'ENTFERNEN', l_tint: 'EINFÄRBEN', l_potency: 'STÄRKE', st_wm: 'Wasserzeichen geladen',
      b_gen: 'Zufällige Seriennummer erzeugen', h_doc: '// DOKUMENT', h_style: '// STIL', h_output: '// AUSGABE',
      l_blank: 'VORLAGE', bl_event_badge: 'EVENT-AUSWEIS',
      f_number: 'AUSWEISNUMMER', f_role: 'ROLLE', f_title: 'ANREDE',
      f_name1: 'NAME — ZEILE 1', f_name2: 'NAME — ZEILE 2', f_footer: 'FUSSZEILE',
      l_photo: 'FOTO', b_upload: 'HOCHLADEN', b_doggo: 'DOGGO', b_reset: 'ZURÜCK', l_zoom: 'ZOOM',
      hint_photo: 'Foto ziehen zum Verschieben, Mausrad zum Zoomen. Bild überall ablegen oder einfügen.',
      l_photofx: 'FOTO-FX', l_mode: 'MODUS', fx_none: 'ORIGINAL', fx_mono: 'SCHWELLE',
      fx_halftone: 'RASTER', fx_dither: 'DITHER', l_level: 'PEGEL', l_dot: 'PUNKTGRÖSSE',
      l_scheme: 'SCHEMA', c_card: 'KARTE', c_ink: 'TINTE', c_accent: 'AKZENT',
      l_decor: 'DEKOR', d_stripes: 'SEITENSTREIFEN', d_slashes: 'SCHRÄGEN', d_barcode: 'BARCODE', d_edge: 'RANDLINIE',
      l_fx: 'EFFEKTE', e_glow: 'GLÜHEN', e_grain: 'KÖRNUNG', e_scan: 'SCANLINES', l_amount: 'STÄRKE',
      sw_off: 'AUS', sw_on: 'AN', l_scale: 'GRÖSSE', b_export: 'PNG EXPORTIEREN',
      b_copy: 'IN ZWISCHENABLAGE', st_copied: 'In die Zwischenablage kopiert', st_copyfail: 'Dieser Browser konnte das Bild nicht kopieren.',
      st_exported: 'Exportiert: {f}', st_photo: 'Foto geladen', st_badimg: 'Diese Datei ist kein Bild.',
      st_fail: 'Export fehlgeschlagen.',
      tag: 'DOKUMENTENSCHMIEDE', tag_alt: 'SCHMIEDE DEINE SIN' },
    es: { l_invert: 'INVERTIR COLORES', l_blend: 'FUSIÓN', bl_smart: 'INTELIGENTE', bl_normal: 'NORMAL', l_rotation: 'ROTACIÓN', hint_dial: 'Arrastra para girar · Mayús ajusta a 15° · doble clic restablece', l_tone: 'TONO', t_custom: 'PROPIO', l_color: 'COLOR', l_tile: 'MOSAICO', l_wm: 'MARCA DE AGUA', wm_off: 'NO', wm_text: 'TEXTO', wm_image: 'IMAGEN', b_clear: 'QUITAR', l_tint: 'TEÑIR', l_potency: 'INTENSIDAD', st_wm: 'Marca de agua cargada',
      b_gen: 'Generar un número aleatorio', h_doc: '// DOCUMENTO', h_style: '// ESTILO', h_output: '// SALIDA',
      l_blank: 'PLANTILLA', bl_event_badge: 'ACREDITACIÓN',
      f_number: 'NÚMERO', f_role: 'ROL', f_title: 'TRATAMIENTO',
      f_name1: 'NOMBRE — LÍNEA 1', f_name2: 'NOMBRE — LÍNEA 2', f_footer: 'LÍNEA INFERIOR',
      l_photo: 'FOTO', b_upload: 'SUBIR', b_doggo: 'DOGGO', b_reset: 'REINICIAR', l_zoom: 'ZOOM',
      hint_photo: 'Arrastra la foto para moverla, rueda para zoom. Suelta o pega una imagen en cualquier lugar.',
      l_photofx: 'EFECTO FOTO', l_mode: 'MODO', fx_none: 'ORIGINAL', fx_mono: 'UMBRAL',
      fx_halftone: 'SEMITONO', fx_dither: 'TRAMADO', l_level: 'NIVEL', l_dot: 'TAMAÑO DE PUNTO',
      l_scheme: 'ESQUEMA', c_card: 'TARJETA', c_ink: 'TINTA', c_accent: 'ACENTO',
      l_decor: 'DECORACIÓN', d_stripes: 'FRANJAS LATERALES', d_slashes: 'BARRAS', d_barcode: 'CÓDIGO DE BARRAS', d_edge: 'CONTORNO',
      l_fx: 'EFECTOS', e_glow: 'BRILLO', e_grain: 'GRANO', e_scan: 'LÍNEAS', l_amount: 'INTENSIDAD',
      sw_off: 'NO', sw_on: 'SÍ', l_scale: 'ESCALA', b_export: 'EXPORTAR PNG',
      b_copy: 'COPIAR AL PORTAPAPELES', st_copied: 'Copiado al portapapeles', st_copyfail: 'Este navegador no pudo copiar la imagen.',
      st_exported: 'Exportado: {f}', st_photo: 'Foto cargada', st_badimg: 'Ese archivo no es una imagen.',
      st_fail: 'La exportación falló.',
      tag: 'FORJA DE DOCUMENTOS', tag_alt: 'FORJA TU SIN' },
    it: { l_invert: 'INVERTI COLORI', l_blend: 'FUSIONE', bl_smart: 'INTELLIGENTE', bl_normal: 'NORMALE', l_rotation: 'ROTAZIONE', hint_dial: 'Trascina per ruotare · Maiusc scatta di 15° · doppio clic per reimpostare', l_tone: 'TONO', t_custom: 'PERSONALE', l_color: 'COLORE', l_tile: 'RIPETI', l_wm: 'FILIGRANA', wm_off: 'NO', wm_text: 'TESTO', wm_image: 'IMMAGINE', b_clear: 'RIMUOVI', l_tint: 'TINGI', l_potency: 'INTENSITÀ', st_wm: 'Filigrana caricata',
      b_gen: 'Genera un numero casuale', h_doc: '// DOCUMENTO', h_style: '// STILE', h_output: '// OUTPUT',
      l_blank: 'MODELLO', bl_event_badge: 'PASS EVENTO',
      f_number: 'NUMERO PASS', f_role: 'RUOLO', f_title: 'TITOLO',
      f_name1: 'NOME — RIGA 1', f_name2: 'NOME — RIGA 2', f_footer: 'RIGA IN BASSO',
      l_photo: 'FOTO', b_upload: 'CARICA', b_doggo: 'DOGGO', b_reset: 'RESET', l_zoom: 'ZOOM',
      hint_photo: "Trascina la foto per spostarla, rotella per lo zoom. Rilascia o incolla un'immagine ovunque.",
      l_photofx: 'EFFETTO FOTO', l_mode: 'MODALITÀ', fx_none: 'ORIGINALE', fx_mono: 'SOGLIA',
      fx_halftone: 'MEZZETINTE', fx_dither: 'DITHERING', l_level: 'LIVELLO', l_dot: 'DIMENSIONE PUNTO',
      l_scheme: 'SCHEMA', c_card: 'CARTA', c_ink: 'INCHIOSTRO', c_accent: 'ACCENTO',
      l_decor: 'DECORI', d_stripes: 'STRISCE LATERALI', d_slashes: 'BARRE', d_barcode: 'CODICE A BARRE', d_edge: 'CONTORNO',
      l_fx: 'EFFETTI', e_glow: 'BAGLIORE', e_grain: 'GRANA', e_scan: 'SCANLINE', l_amount: 'INTENSITÀ',
      sw_off: 'NO', sw_on: 'SÌ', l_scale: 'SCALA', b_export: 'ESPORTA PNG',
      b_copy: 'COPIA NEGLI APPUNTI', st_copied: 'Copiato negli appunti', st_copyfail: "Questo browser non è riuscito a copiare l'immagine.",
      st_exported: 'Esportato: {f}', st_photo: 'Foto caricata', st_badimg: "Questo file non è un'immagine.",
      st_fail: 'Esportazione non riuscita.',
      tag: 'FORGIA DI DOCUMENTI', tag_alt: 'FORGIA IL TUO SIN' },
    ja: { l_invert: '色を反転', l_blend: 'ブレンド', bl_smart: 'スマート', bl_normal: '通常', l_rotation: '回転', hint_dial: 'ドラッグで回転 · Shiftで15°刻み · ダブルクリックでリセット', l_tone: 'トーン', t_custom: 'カスタム', l_color: '色', l_tile: 'タイル', l_wm: '透かし', wm_off: 'オフ', wm_text: 'テキスト', wm_image: '画像', b_clear: 'クリア', l_tint: '着色', l_potency: '濃さ', st_wm: '透かしを読み込みました',
      b_gen: 'ランダムな番号を生成', h_doc: '// ドキュメント', h_style: '// スタイル', h_output: '// 出力',
      l_blank: 'テンプレート', bl_event_badge: 'イベントバッジ',
      f_number: 'バッジ番号', f_role: 'ロール', f_title: '敬称',
      f_name1: '名前 — 1行目', f_name2: '名前 — 2行目', f_footer: 'フッター',
      l_photo: '写真', b_upload: 'アップロード', b_doggo: 'ドギー', b_reset: 'リセット', l_zoom: 'ズーム',
      hint_photo: '写真をドラッグで移動、ホイールでズーム。画像はどこにでもドロップまたは貼り付けできます。',
      l_photofx: '写真エフェクト', l_mode: 'モード', fx_none: 'オリジナル', fx_mono: '2値化',
      fx_halftone: 'ハーフトーン', fx_dither: 'ディザ', l_level: 'レベル', l_dot: 'ドットサイズ',
      l_scheme: '配色', c_card: 'カード', c_ink: 'インク', c_accent: 'アクセント',
      l_decor: '装飾', d_stripes: 'サイドストライプ', d_slashes: 'スラッシュ', d_barcode: 'バーコード', d_edge: '縁取り',
      l_fx: 'エフェクト', e_glow: 'グロー', e_grain: 'グレイン', e_scan: '走査線', l_amount: '強さ',
      sw_off: 'オフ', sw_on: 'オン', l_scale: 'スケール', b_export: 'PNG書き出し',
      b_copy: 'クリップボードにコピー', st_copied: 'クリップボードにコピーしました', st_copyfail: 'このブラウザでは画像をコピーできませんでした。',
      st_exported: '書き出し完了: {f}', st_photo: '写真を読み込みました', st_badimg: 'このファイルは画像ではありません。',
      st_fail: '書き出しに失敗しました。',
      tag: 'ドキュメント鍛造所', tag_alt: 'SINを鍛えろ' },
    zh: { l_invert: '反转颜色', l_blend: '混合', bl_smart: '智能', bl_normal: '正常', l_rotation: '旋转', hint_dial: '拖动旋转 · 按住 Shift 以 15° 吸附 · 双击重置', l_tone: '色调', t_custom: '自定义', l_color: '颜色', l_tile: '平铺', l_wm: '水印', wm_off: '关', wm_text: '文字', wm_image: '图片', b_clear: '清除', l_tint: '着色', l_potency: '强度', st_wm: '水印已加载',
      b_gen: '随机生成编号', h_doc: '// 证件', h_style: '// 样式', h_output: '// 输出',
      l_blank: '模板', bl_event_badge: '活动胸牌',
      f_number: '胸牌编号', f_role: '身份标签', f_title: '称谓',
      f_name1: '姓名 — 第1行', f_name2: '姓名 — 第2行', f_footer: '底部文字',
      l_photo: '照片', b_upload: '上传', b_doggo: '狗狗', b_reset: '重置', l_zoom: '缩放',
      hint_photo: '拖动照片移动，滚轮缩放。可在任意位置拖放或粘贴图片。',
      l_photofx: '照片效果', l_mode: '模式', fx_none: '原图', fx_mono: '阈值',
      fx_halftone: '半色调', fx_dither: '抖动', l_level: '色阶', l_dot: '网点大小',
      l_scheme: '配色', c_card: '卡面', c_ink: '油墨', c_accent: '强调色',
      l_decor: '装饰', d_stripes: '侧边条纹', d_slashes: '斜杠', d_barcode: '条形码', d_edge: '描边',
      l_fx: '效果', e_glow: '辉光', e_grain: '颗粒', e_scan: '扫描线', l_amount: '强度',
      sw_off: '关', sw_on: '开', l_scale: '倍率', b_export: '导出 PNG',
      b_copy: '复制到剪贴板', st_copied: '已复制到剪贴板', st_copyfail: '此浏览器无法复制图片。',
      st_exported: '已导出：{f}', st_photo: '照片已加载', st_badimg: '该文件不是图片。',
      st_fail: '导出失败。',
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
    document.dispatchEvent(new CustomEvent('sinforge:lang'));
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
