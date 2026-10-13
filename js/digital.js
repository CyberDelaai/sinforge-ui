(function (SINFORGE) {
  'use strict';
  // ---- DIGITAL mode: the card as a digital document shared from a device over
  // the air — a matrix grid behind it (glyph columns, a grid, a perspective
  // floor, motes), a glow + holo brackets around the card and a wireless HUD
  // (the emitter's readout bottom-left, the link log bottom-right). One still
  // scene, painted by the same code on the stage (the backdrop canvas behind
  // the card) and in the PNG: compose(card) paints it around the card
  // the renderer drew — the renderer itself never knows about the mode. The
  // on/off flag is S.out.digital. ----
  const $ = SINFORGE.$;
  const t = SINFORGE.t;
  const S = SINFORGE.state;

  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF';
  const CYAN = '#00f0ff';
  const MONO = '"JetBrains Mono", monospace';
  const STAGE_U = 0.7;                 // the stage's unit size (an export's grows with the card)

  let stage, cv, doc;
  let queued = false;

  // ---- helpers ----
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  // The scene's colour follows the card: its accent, else its ink, when bright
  // enough to read on the dark backdrop; the app's cyan otherwise. As "r,g,b".
  function tintOf() {
    const c = [S.style.accent, S.style.ink].find((h) => /^#[0-9a-f]{6}$/i.test(h) && luma(rgb(h)) >= 70) || CYAN;
    return rgb(c).join(',');
  }
  // the active blank's outline bounds, as fractions of the card canvas (the
  // canvas has room around the shape for the glow halo)
  function shapeBox() {
    const B = SINFORGE.blanks[S.blank], xs = B.outline.map((p) => p[0]), ys = B.outline.map((p) => p[1]);
    return { x0: Math.min(...xs) / B.w, y0: Math.min(...ys) / B.h, x1: Math.max(...xs) / B.w, y1: Math.max(...ys) / B.h };
  }
  // the card's shape as drawn inside the stage (the canvas is letterboxed:
  // object-fit contain + min-height), in the stage's padding-box px
  function stageCard() {
    const r = doc.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!doc.width || !r.width) return null;
    const f = Math.min(r.width / doc.width, r.height / doc.height);
    const w = doc.width * f, h = doc.height * f;
    const x = r.left - s.left - stage.clientLeft + (r.width - w) / 2, y = r.top - s.top - stage.clientTop + (r.height - h) / 2;
    const b = shapeBox();
    return { x0: x + b.x0 * w, y0: y + b.y0 * h, x1: x + b.x1 * w, y1: y + b.y1 * h };
  }

  // ---- the scene: a W×H area at unit size u, seeded so it never shifts
  // between paints ----
  function scene(ctx, W, H, u) {
    const rand = SINFORGE.gfx.rng(SINFORGE.gfx.hash(S.doc.number || 'sinforge'));
    const r = (a, b) => a + rand() * (b - a);
    const cols = [];
    for (let x = 6 * u; x < W + 40 * u; x += 18 * u) {
      cols.push({ x, y: r(-0.2, 1.2) * H, n: 6 + Math.floor(r(0, 10)), g: [...Array(16)].map(() => GLYPHS[Math.floor(r(0, GLYPHS.length))]) });
    }
    const motes = [...Array(Math.round(W * H / (14000 * u * u)))].map(() => ({ x: r(0, W), y: r(0, H), s: r(1, 2.6), a: r(0.25, 0.6) }));
    return { ctx, W, H, u, rgb: tintOf(), cols, motes };
  }
  const col = (sc, a) => `rgba(${sc.rgb},${a})`;

  // ---- backdrop layers, far to near ----
  function drawRain(sc) {
    const { ctx, H, u } = sc, pitch = 16 * u;
    ctx.font = `${13 * u}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    sc.cols.forEach((c) => {
      for (let i = 0; i < c.n; i++) {
        const y = c.y - i * pitch;
        if (y < -pitch || y > H + pitch) continue;
        ctx.fillStyle = col(sc, i ? 0.22 * (1 - i / c.n) : 0.55);
        ctx.fillText(c.g[i & 15], c.x, y);
      }
    });
  }
  function drawGrid(sc) {
    const { ctx, W, H, u } = sc, step = 46 * u;
    const x0 = -step, y0 = -step;
    ctx.strokeStyle = col(sc, 0.07);
    ctx.lineWidth = u;
    ctx.beginPath();
    for (let x = x0; x < W + step; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = y0; y < H + step; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    // crossings
    ctx.fillStyle = col(sc, 0.22);
    for (let x = x0; x < W + step; x += step) {
      for (let y = y0; y < H + step; y += step) ctx.fillRect(x - u, y - u, 2 * u, 2 * u);
    }
  }
  // a perspective floor from the horizon down
  function drawFloor(sc) {
    const { ctx, W, H, u } = sc;
    const hz = H * 0.62, vx = W / 2;
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, col(sc, 0));
    g.addColorStop(1, col(sc, 0.35));
    ctx.strokeStyle = g;
    ctx.lineWidth = u;
    ctx.beginPath();
    for (let i = -14; i <= 14; i++) { ctx.moveTo(vx + i * 6 * u, hz); ctx.lineTo(vx + i * W * 0.16, H + 40 * u); }
    for (let i = 0; i < 14; i++) {
      const z = (i + 0.5) / 14, y = hz + (H - hz) * z * z;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
    // horizon glow
    const hg = ctx.createLinearGradient(0, hz - 30 * u, 0, hz + 6 * u);
    hg.addColorStop(0, col(sc, 0));
    hg.addColorStop(1, col(sc, 0.12));
    ctx.fillStyle = hg;
    ctx.fillRect(0, hz - 30 * u, W, 36 * u);
  }
  function drawMotes(sc) {
    const { ctx, u } = sc;
    sc.motes.forEach((m) => {
      ctx.fillStyle = col(sc, m.a);
      ctx.fillRect(m.x, m.y, m.s * u, m.s * u);
    });
  }
  function drawBackdrop(sc) {
    drawRain(sc);
    drawGrid(sc);
    drawFloor(sc);
    drawMotes(sc);
  }

  // ---- over the backdrop: holo brackets around the card's shape (b: its
  // bounds in scene px) and the HUD in the bottom corners ----
  function drawOverlay(sc, b) {
    const { ctx, W, H, u } = sc;
    const o = 12 * u, l = 28 * u, th = 3 * u;
    ctx.fillStyle = col(sc, 0.8);
    [[b.x0 - o, b.y0 - o, 1, 1], [b.x1 + o, b.y0 - o, -1, 1], [b.x0 - o, b.y1 + o, 1, -1], [b.x1 + o, b.y1 + o, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.fillRect(sx > 0 ? x : x - l, sy > 0 ? y : y - th, l, th);
      ctx.fillRect(sx > 0 ? x : x - th, sy > 0 ? y : y - l, th, l);
    });
    const fs = 15 * u, lh = fs * 1.45, pad = 22 * u, base = H - pad;
    ctx.save();
    ctx.shadowColor = col(sc, 0.5);
    ctx.shadowBlur = 6 * u;
    // the emitter: antenna arcs + a dot, its readout beside
    const ax = pad + 18 * u, ay = base - 8 * u;
    ctx.strokeStyle = col(sc, 0.85);
    ctx.lineWidth = 2.5 * u;
    [7, 13, 19].forEach((r) => { ctx.beginPath(); ctx.arc(ax, ay, r * u, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke(); });
    ctx.fillStyle = col(sc, 0.85);
    ctx.beginPath(); ctx.arc(ax, ay, 2.2 * u, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${fs}px ${MONO}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('NFC-7 · CH 11', ax + 30 * u, base - lh);
    ctx.fillText('-42 dBm', ax + 30 * u, base);
    // the link log of a finished transfer
    ctx.textAlign = 'right';
    const lines = [t('dg_seek') + ' · NFC-7', t('dg_hand') + ' · AES-4096 ✓', t('dg_rx') + ' [' + '█'.repeat(12) + '] 100%', t('dg_ok')];
    lines.forEach((s, i) => ctx.fillText('> ' + s, W - pad, base - (lines.length - 1 - i) * lh));
    ctx.restore();
  }

  // ---- the stage: the scene on the backdrop canvas, behind the card ----
  function paint() {
    queued = false;
    if (!S.out.digital) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = stage.clientWidth, H = stage.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sc = scene(ctx, W, H, STAGE_U);
    stage.style.setProperty('--digi-rgb', sc.rgb);
    drawBackdrop(sc);
    const b = stageCard();
    if (b) drawOverlay(sc, b);
  }
  function schedule() {
    if (queued || !S.out.digital) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  // ---- export: the scene around a rendered card ----
  // margins around the card, in units of u (the scene's unit size)
  const M = { side: 150, top: 130, bottom: 210 };
  const unitOf = (cw, ch) => Math.min(cw, ch) / 640;
  function exportSize(cw, ch) {
    const u = unitOf(cw, ch);
    return { w: Math.round(cw + 2 * M.side * u), h: Math.round(ch + (M.top + M.bottom) * u) };
  }
  // card: the canvas SINFORGE.render drew → a new canvas with the whole scene
  function compose(card) {
    const cw = card.width, ch = card.height, u = unitOf(cw, ch), { w: W, h: H } = exportSize(cw, ch);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.5);
    bg.addColorStop(0, '#0a0d16');
    bg.addColorStop(1, '#030307');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const sc = scene(ctx, W, H, u);
    drawBackdrop(sc);
    // the card's glow: shadows only (the card itself drawn far off-canvas,
    // its shadow shifted back in), then the card on top
    const cx = M.side * u, cy = M.top * u;
    [[10, 0.45], [28, 0.18]].forEach(([blur, a]) => {
      ctx.save();
      ctx.shadowColor = col(sc, a);
      ctx.shadowBlur = blur * u;
      ctx.shadowOffsetX = W + cw;
      ctx.drawImage(card, cx - W - cw, cy);
      ctx.restore();
    });
    ctx.drawImage(card, cx, cy);
    const b = shapeBox();
    drawOverlay(sc, { x0: cx + b.x0 * cw, y0: cy + b.y0 * ch, x1: cx + b.x1 * cw, y1: cy + b.y1 * ch });
    return out;
  }

  // ---- public ----
  SINFORGE.digital = {
    compose,
    exportSize,
    set(on) {
      S.out.digital = !!on;
      SINFORGE.save('sinforge:out', JSON.stringify(S.out));
      stage.classList.toggle('digital', S.out.digital);
      $('digiBtn').setAttribute('aria-pressed', String(S.out.digital));
      document.dispatchEvent(new CustomEvent('sinforge:digital'));
      schedule();
    },
    // the card changed or moved (after each preview render): repaint
    sync: schedule,
    init() {
      stage = $('stage'); doc = $('docCanvas'); cv = $('digiBg');
      $('digiBtn').addEventListener('click', () => SINFORGE.digital.set(!S.out.digital));
      if (window.ResizeObserver) new ResizeObserver(schedule).observe(stage);
      document.addEventListener('sinforge:lang', schedule);
      if (S.out.digital) SINFORGE.digital.set(true);
    },
  };
})(window.SINFORGE);
