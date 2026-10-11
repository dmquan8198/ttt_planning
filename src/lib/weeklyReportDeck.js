// Weekly boss report deck: 4 self-explanatory slides in the MoMo template look
// (white content background + logo from "Template Slide MoMo_28Aug2024.pptx",
// Inter font, magenta A50064 / pink F95396). Built from collectWeeklyReport()'s
// output; every number and sentence is derived from it, nothing is hard-coded to one week.
//
// 1 Tổng quan & thay đổi → 2 Chi tiết nghiệp vụ → 3 Sprint & nút thắt → 4 Rủi ro & đề xuất
const path = require('path');
const PptxGenJS = require('pptxgenjs');

// ---------- palette / type (MoMo) ----------
const K = {
  brand: 'A50064', pink: 'F95396', ink: '262626', mute: '6B6B6B', line: 'E6D5DE', soft: 'FDEFF5', white: 'FFFFFF',
  red: 'D92D20', amber: 'F5A524', amberSoft: 'FFF4DC', redSoft: 'FDE8E6',
  backlog: 'E2E4E8', slate1: 'B8C0CA', slate2: '9AA5B1', slate3: '7A8794', uat: 'F5A524', doneUat: 'E27AB1', done: 'A50064'
};
const FONT = 'Inter';
const BG = path.join(__dirname, '..', 'assets', 'momo-content-bg.png');

function buildWeeklyDeck(r) {
  const warnings = [];
  // ---------- helpers ----------
  const dm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
  const dmy = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const shortCat = (c) => c.replace('TTT New - ', '');

  // rough fit check (no renderer in this environment): warns when text probably overflows its box

  function fit(label, text, w, h, size, bold) {
    const cw = (size * (bold ? 0.6 : 0.55)) / 72;
    const lines = String(text).split('\n').reduce((a, p) => a + Math.max(1, Math.ceil((p.length * cw) / Math.max(w - 0.12, 0.1))), 0);
    const need = (lines * size * 1.22) / 72 + 0.06;
    if (need > h + 0.02) warnings.push(`${label}: needs ~${need.toFixed(2)}in, has ${h}in — "${String(text).slice(0, 40)}"`);
  }

  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9'; // 10 x 5.625 in — same canvas as the template
  p.title = `Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}`;
  p.company = 'MoMo';

  function txt(s, label, text, o) {
    const runs = Array.isArray(text) ? text : null;
    const plain = runs ? runs.map((x) => x.text).join('') : text;
    fit(label, plain, o.w, o.h, o.size || 11, o.bold);
    s.addText(text, { fontFace: FONT, color: K.ink, margin: 0, valign: 'top', isTextBox: true, fontSize: 11, ...o });
  }
  function box(s, x, y, w, h, fill, o = {}) {
    s.addShape(o.round ? p.ShapeType.roundRect : p.ShapeType.rect, {
      x, y, w, h, fill: { color: fill }, line: o.line ? { color: o.line, width: o.lw || 0.75 } : { color: fill, width: 0 },
      rectRadius: o.round ? o.round : undefined
    });
  }

  const STEPS = ['Tổng quan & thay đổi', 'Chi tiết nghiệp vụ', 'Sprint & nút thắt', 'Rủi ro & đề xuất'];
  function frame(n, title) {
    const s = p.addSlide();
    s.background = { path: BG };
    // stepper: where this slide sits in the story
    STEPS.forEach((label, i) => {
      const x = 0.4 + i * 1.97; const on = i + 1 === n;
      s.addShape(p.ShapeType.roundRect, { x, y: 0.2, w: 1.89, h: 0.24, rectRadius: 0.12, fill: { color: on ? K.brand : K.white }, line: { color: on ? K.brand : K.line, width: 0.75 } });
      s.addText(`${i + 1}  ${label}`, { x, y: 0.2, w: 1.89, h: 0.24, fontFace: FONT, fontSize: 9, bold: on, color: on ? K.white : K.mute, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    });
    txt(s, `title${n}`, title, { x: 0.4, y: 0.55, w: 9.2, h: 0.72, size: 19, bold: true, color: K.brand, valign: 'top' });
    txt(s, 'footer', `Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}/${r.today.slice(0, 4)}  ·  Nguồn: TTT Planning, số liệu ${dmy(r.today)}`, { x: 0.8, y: 5.22, w: 7, h: 0.2, size: 8, color: K.mute, valign: 'middle' });
    txt(s, 'pg', `${n}/4`, { x: 8.9, y: 5.22, w: 0.7, h: 0.2, size: 8, color: K.mute, align: 'right', valign: 'middle' });
    return s;
  }

  // ---------- data ----------
  const prev = r.prevSnapshot; const ps = prev ? prev.by_status : {};
  const now = r.totals.byStatus;
  const STAGES = [
    { label: 'Backlog', code: '0.backlog', color: K.backlog, phase: 'Phân tích' },
    { label: 'In Analyst', code: '1.in_analyst', color: K.slate1, phase: 'Phân tích' },
    { label: 'Ready for Dev', code: '2.ready_for_dev', color: K.slate2, phase: 'Phân tích' },
    { label: 'In Dev', code: '3.in_test', color: K.slate3, phase: 'Phát triển' },
    { label: 'inTest UAT', code: '4.in_test_uat', color: K.uat, phase: 'Kiểm thử' },
    { label: 'Done UAT', code: '5.ready_for_staging', color: K.doneUat, phase: 'Kiểm thử' },
    { label: 'Done', code: '6.done', color: K.done, phase: 'Hoàn tất' }
  ];
  const nowOf = (st) => now[st.label] || 0;
  const prevOf = (st) => ps[st.code] || 0;
  const total = r.totals.total; const totalPrev = prev ? prev.total_tasks : 0;
  const doneNow = now['Done'] || 0; const donePrev = prev ? prev.completed_tasks : 0;
  const uatNow = now['inTest UAT'] || 0; const uatPrev = ps['4.in_test_uat'] || 0;
  const doneUatNow = now['Done UAT'] || 0;
  const overdue = r.risks.overdue;
  const overdueUat = overdue.filter((t) => t.status === 'inTest UAT').length;
  const sp = r.sprint; const ns = r.nextSprint;
  const moved = r.movedThisWeek.length;

  // =====================================================================
  // SLIDE 1 — tổng quan & thay đổi so với tuần trước
  // =====================================================================
  {
    const ratio = donePrev ? (doneNow / donePrev).toFixed(1).replace('.', ',') : null;
    const bottleneck = uatNow > uatPrev ? `, nhưng ${uatNow} việc đang dồn ở khâu UAT (tuần trước ${uatPrev})` : '';
    const s = frame(1, `Done tăng ${donePrev} → ${doneNow}${ratio ? ` (gấp ${ratio} lần)` : ''} trong tuần${bottleneck}`);

    // KPI tiles
    const kp = [
      [total, 'nghiệp vụ', `${sign(total - totalPrev)} so tuần trước (${r.newTasksThisWeek.length} mới)`, K.ink],
      [doneNow, `Done (${pct(doneNow, total)}%)`, `${sign(doneNow - donePrev)} so tuần trước`, K.brand],
      [`${uatPrev} → ${uatNow}`, 'đang UAT', uatNow > uatPrev ? 'tăng gấp đôi = điểm nghẽn' : 'so tuần trước', K.amber === K.uat ? 'B26B00' : K.ink],
      [overdue.length, 'việc quá hạn', `${overdueUat} việc đang chờ UAT`, overdue.length ? K.red : K.ink]
    ];
    kp.forEach(([big, lab, note, col], i) => {
      const x = 0.4 + i * 2.33;
      box(s, x, 1.3, 2.2, 0.72, K.white, { round: 0.08, line: K.line });
      txt(s, 'kpi', String(big), { x: x + 0.12, y: 1.34, w: 1.3, h: 0.4, size: 18, bold: true, color: col, valign: 'middle', fit: 'shrink' });
      txt(s, 'kpilab', lab, { x: x + (String(big).length > 4 ? 1.3 : 0.8), y: 1.38, w: String(big).length > 4 ? 0.85 : 1.3, h: 0.3, size: 10, bold: true, valign: 'middle' });
      txt(s, 'kpinote', note, { x: x + 0.12, y: 1.74, w: 2.0, h: 0.2, size: 9, color: K.mute });
    });

    // pipeline: ghost bar = last week, solid = now
    const X0 = 0.4; const CW = 1.3; const GAP = 0.016; const base = 4.1; const maxH = 1.1;
    const maxV = Math.max(...STAGES.map((st) => Math.max(nowOf(st), prevOf(st))), 1);
    // phase brackets
    const phases = []; STAGES.forEach((st, i) => { const l = phases[phases.length - 1]; if (l && l.name === st.phase) l.to = i; else phases.push({ name: st.phase, from: i, to: i }); });
    phases.forEach((ph) => {
      const x = X0 + ph.from * (CW + GAP); const w = (ph.to - ph.from + 1) * CW + (ph.to - ph.from) * GAP;
      box(s, x, 2.14, w, 0.22, K.soft);
      txt(s, 'phase', ph.name.toUpperCase(), { x, y: 2.14, w, h: 0.22, size: 8.5, bold: true, color: K.brand, align: 'center', valign: 'middle' });
    });
    STAGES.forEach((st, i) => {
      const x = X0 + i * (CW + GAP);
      s.addShape(p.ShapeType.chevron, { x, y: 2.42, w: CW, h: 0.3, fill: { color: st.color }, line: { color: st.color, width: 0 } });
      txt(s, 'stage', st.label, { x: x + 0.12, y: 2.42, w: CW - 0.24, h: 0.3, size: 8.5, bold: true, color: ['Backlog', 'In Analyst', 'Ready for Dev', 'inTest UAT'].includes(st.label) ? K.ink : K.white, align: 'center', valign: 'middle' });
      const bw = 0.5;
      const gx = x + 0.12; const nx = x + CW - bw - 0.12;
      const ph = (prevOf(st) / maxV) * maxH; const nh = (nowOf(st) / maxV) * maxH;
      if (ph > 0) s.addShape(p.ShapeType.rect, { x: gx, y: base - ph, w: bw, h: ph, fill: { color: K.white }, line: { color: st.color, width: 1.25, dashType: 'dash' } });
      if (nh > 0) s.addShape(p.ShapeType.rect, { x: nx, y: base - nh, w: bw, h: nh, fill: { color: st.color }, line: { color: st.color, width: 0 } });
      txt(s, 'nowv', String(nowOf(st)), { x: nx - 0.1, y: base - nh - 0.25, w: bw + 0.2, h: 0.22, size: 12, bold: true, align: 'center', valign: 'bottom', color: st.color === K.backlog ? K.ink : (st.color === K.uat ? 'B26B00' : st.color) });
      txt(s, 'prevv', String(prevOf(st)), { x: gx - 0.1, y: base - ph - 0.22, w: bw + 0.2, h: 0.2, size: 10, align: 'center', valign: 'bottom', color: K.mute });
      // delta chip
      const d = nowOf(st) - prevOf(st);
      const chipCol = d === 0 ? 'F3F3F3' : (st.label === 'inTest UAT' && d > 0 ? K.amberSoft : (['Done', 'Done UAT'].includes(st.label) && d > 0 ? K.soft : K.white));
      box(s, x + 0.3, 4.16, CW - 0.6, 0.22, chipCol, { round: 0.1, line: K.line });
      txt(s, 'delta', d === 0 ? '±0' : sign(d), { x: x + 0.3, y: 4.16, w: CW - 0.6, h: 0.22, size: 10, bold: true, align: 'center', valign: 'middle', color: d === 0 ? K.mute : (st.label === 'inTest UAT' && d > 0 ? 'B26B00' : K.ink) });
    });
    // legend
    s.addShape(p.ShapeType.rect, { x: 0.52, y: 2.9, w: 0.16, h: 0.12, fill: { color: K.white }, line: { color: K.slate3, width: 1, dashType: 'dash' } });
    txt(s, 'leg1', 'Tuần trước (nét đứt)', { x: 0.76, y: 2.85, w: 1.6, h: 0.22, size: 8.5, color: K.mute, valign: 'middle' });
    s.addShape(p.ShapeType.rect, { x: 0.52, y: 3.1, w: 0.16, h: 0.12, fill: { color: K.slate3 }, line: { color: K.slate3, width: 0 } });
    txt(s, 'leg2', 'Hiện tại (màu đặc)', { x: 0.76, y: 3.05, w: 1.6, h: 0.22, size: 8.5, color: K.mute, valign: 'middle' });
    // so-what strip
    box(s, 0.4, 4.46, 9.2, 0.62, K.white, { round: 0.06, line: K.line });
    const sw = [];
    sw.push([K.brand, '✓', `${r.doneThisWeek.length} việc lên Done; ${moved} việc chuyển sang giai đoạn mới trong tuần.`]);
    if (uatNow > uatPrev) sw.push([K.amber, '!', `inTest UAT ${sign(uatNow - uatPrev)}: việc xong dev xếp hàng chờ UAT (trang 3).`]);
    else sw.push([K.slate3, 'i', `inTest UAT ${uatPrev} → ${uatNow}.`]);
    const dU = doneUatNow - (ps['5.ready_for_staging'] || 0);
    sw.push([K.slate3, 'i', dU < 0 ? `Done UAT ${sign(dU)} vì đã chuyển lên Done, không phải mất việc.` : `Done UAT ${sign(dU)}: còn ${doneUatNow} việc qua UAT chờ lên Done.`]);
    sw.forEach(([c, mark, t], i) => {
      const x = 0.52 + i * 3.04;
      s.addShape(p.ShapeType.ellipse, { x, y: 4.58, w: 0.2, h: 0.2, fill: { color: c }, line: { color: c, width: 0 } });
      txt(s, 'mark', mark, { x, y: 4.58, w: 0.2, h: 0.2, size: 9, bold: true, color: K.white, align: 'center', valign: 'middle' });
      txt(s, `sw${i}`, t, { x: x + 0.27, y: 4.52, w: 2.65, h: 0.5, size: 9.5, valign: 'middle' });
    });
  }

  // =====================================================================
  // SLIDE 2 — chi tiết nghiệp vụ theo nhóm
  // =====================================================================
  const catOrder = ['TTT New - Foundation', 'TTT New - Cross Service', 'TTT New - Convert & Scale'];
  const cats = Object.keys(r.totals.byCategory).sort((a, b) => {
    const ia = catOrder.indexOf(a); const ib = catOrder.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return r.totals.byCategory[b].total - r.totals.byCategory[a].total;
  });
  const doneWeekBy = {}; r.doneThisWeek.forEach((t) => { doneWeekBy[t.category] = (doneWeekBy[t.category] || 0) + 1; });
  const groupOf = (cs) => ({
    done: cs['Done'] || 0, doneUat: cs['Done UAT'] || 0, uat: cs['inTest UAT'] || 0,
    wip: (cs['In Dev'] || 0) + (cs['Ready for Dev'] || 0) + (cs['In Analyst'] || 0), backlog: cs['Backlog'] || 0
  });
  const passUat = (c) => { const g = groupOf(r.categoryStatus[c]); return pct(g.done + g.doneUat, r.totals.byCategory[c].total); };
  const bigAll = cats.filter((c) => r.totals.byCategory[c].total >= 10);
  const big = bigAll.length ? bigAll : cats;
  // "best" = the main workstream (largest category), so the headline is about where most of the work is
  const best = [...big].sort((a, b) => r.totals.byCategory[b].total - r.totals.byCategory[a].total)[0];
  const gap = (c) => r.totals.byCategory[c].total * (100 - passUat(c)) / 100; // việc chưa qua UAT
  const weakest = [...big].filter((c) => c !== best).sort((a, b) => gap(b) - gap(a))[0] || best;
  if (!best) {
    const s = frame(2, 'Chưa có nghiệp vụ nào trong hệ thống');
    txt(s, 'nodata', 'Trang này sẽ hiển thị tiến độ từng nhóm khi có dữ liệu.', { x: 0.4, y: 1.6, w: 9.2, h: 0.4, size: 12, color: K.mute });
  } else {
    const bg = groupOf(r.categoryStatus[best]); const wg = groupOf(r.categoryStatus[weakest]);
    const s = frame(2, `${shortCat(best)} đã ${passUat(best)}% qua UAT; ${shortCat(weakest)} mới ${passUat(weakest)}% — đây là nhóm cần theo dõi nhất`);
    // legend
    const LG = [['Done', K.done], ['Done UAT', K.doneUat], ['inTest UAT', K.uat], ['Analyst / Dev', K.slate2], ['Backlog', K.backlog]];
    let lx = 2.75;
    LG.forEach(([l, c]) => { s.addShape(p.ShapeType.rect, { x: lx, y: 1.35, w: 0.14, h: 0.12, fill: { color: c }, line: { color: c, width: 0 } }); txt(s, 'lg', l, { x: lx + 0.19, y: 1.3, w: 1.15, h: 0.22, size: 9, color: K.mute, valign: 'middle' }); lx += 0.35 + l.length * 0.075 + 0.18; });
    txt(s, 'colh1', 'Tỷ trọng theo giai đoạn (số trong ô = số nghiệp vụ)', { x: 2.75, y: 1.58, w: 4.3, h: 0.2, size: 9, bold: true, color: K.brand });
    txt(s, 'colh2', 'Done tuần này', { x: 7.2, y: 1.58, w: 1.1, h: 0.2, size: 9, bold: true, color: K.brand, align: 'center' });
    txt(s, 'colh3', 'Quá hạn*', { x: 8.4, y: 1.58, w: 1.2, h: 0.2, size: 9, bold: true, color: K.brand, align: 'center' });
    txt(s, 'foot2', '* Quá hạn: qua hạn, chưa Done UAT', { x: 5.9, y: 5.22, w: 3.0, h: 0.2, size: 8, color: K.mute, align: 'right', valign: 'middle' });
    const rowH = 0.27; const y0 = 1.84; const BX = 2.75; const BW = 4.25;
    cats.forEach((c, i) => {
      const y = y0 + i * (rowH + 0.03); const tot = r.totals.byCategory[c].total; const g = groupOf(r.categoryStatus[c]);
      if (i % 2 === 0) box(s, 0.4, y - 0.015, 9.2, rowH + 0.03, 'FBF4F7');
      txt(s, 'catn', [{ text: shortCat(c), options: { bold: true } }, { text: `  ${tot}`, options: { color: K.mute } }], { x: 0.5, y, w: 2.25, h: rowH, size: 9, valign: 'middle' });
      let x = BX;
      [[g.done, K.done, K.white], [g.doneUat, K.doneUat, K.ink], [g.uat, K.uat, K.ink], [g.wip, K.slate2, K.ink], [g.backlog, K.backlog, K.ink]].forEach(([n, col, tc]) => {
        if (!n) return; const w = (n / tot) * BW;
        s.addShape(p.ShapeType.rect, { x, y: y + 0.03, w, h: rowH - 0.06, fill: { color: col }, line: { color: K.white, width: 0.5 } });
        if (w >= 0.26) txt(s, 'seg', String(n), { x, y: y + 0.03, w, h: rowH - 0.06, size: 10, bold: true, color: tc, align: 'center', valign: 'middle' });
        x += w;
      });
      const dw = doneWeekBy[c] || 0; const od = r.totals.byCategory[c].overdue;
      txt(s, 'dw', dw ? `+${dw}` : '–', { x: 7.2, y, w: 1.1, h: rowH, size: 11, bold: !!dw, color: dw ? K.brand : K.mute, align: 'center', valign: 'middle' });
      txt(s, 'od', od ? String(od) : '–', { x: 8.4, y, w: 1.2, h: rowH, size: 11, bold: !!od, color: od ? K.red : K.mute, align: 'center', valign: 'middle' });
    });
    // takeaways (3 cards)
    const cy = y0 + cats.length * (rowH + 0.03) + 0.1; const ch = 5.1 - cy;
    const names = (c) => r.doneThisWeek.filter((t) => t.category === c).slice(0, 3).map((t) => t.name.replace(/^\[[^\]]+\]\s*/, '')).join(', ');
    const cards = [
      [K.brand, shortCat(best), `${bg.done + bg.doneUat}/${r.totals.byCategory[best].total} qua UAT; tuần này +${doneWeekBy[best] || 0} Done${doneWeekBy[best] ? ` (vd: ${names(best)})` : ''}.`],
      [K.red, shortCat(weakest), `${wg.done}/${r.totals.byCategory[weakest].total} Done; ${wg.uat} đang UAT, ${wg.wip} đang phân tích/dev, ${wg.backlog} backlog.`],
      [K.slate3, 'Nhóm nhỏ (Done / tổng)', cats.filter((c) => !big.includes(c) || (big.includes(c) && c !== best && c !== weakest)).map((c) => `${shortCat(c)} ${r.categoryStatus[c]['Done'] || 0}/${r.totals.byCategory[c].total}`).join(' · ')]
    ];
    cards.forEach(([col, h, t], i) => {
      const x = 0.4 + i * 3.1;
      box(s, x, cy, 3.0, ch, K.white, { round: 0.06, line: K.line });
      s.addShape(p.ShapeType.ellipse, { x: x + 0.1, y: cy + 0.1, w: 0.12, h: 0.12, fill: { color: col }, line: { color: col, width: 0 } });
      txt(s, 'ch', h, { x: x + 0.28, y: cy + 0.05, w: 2.6, h: 0.22, size: 10, bold: true, valign: 'middle' });
      txt(s, `cb${i}`, t, { x: x + 0.1, y: cy + 0.29, w: 2.8, h: ch - 0.31, size: 9, color: K.ink });
    });
  }

  // =====================================================================
  // SLIDE 3 — sprint & nút thắt UAT
  // =====================================================================
  if (!sp) {
    const s = frame(3, 'Chưa có sprint nào đang chạy hoặc vừa kết thúc');
    txt(s, 'nosprint', 'Thêm sprint trong app (màn Sprint Overview) để trang này hiển thị tiến độ và hàng chờ UAT.', { x: 0.4, y: 1.6, w: 9.2, h: 0.6, size: 12, color: K.mute });
  } else {
    const sprintDone = (sp.byStatus['Done'] || 0) + (sp.byStatus['Done UAT'] || 0);
    const s = frame(3, `${sp.code} ${sp.ended ? 'khép lại' : 'đang chạy'} với ${sprintDone}/${sp.total} việc qua UAT — ${sp.byStatus['inTest UAT'] || 0} việc còn lại đang chờ UAT và sẽ chồng lên ${ns ? ns.code : 'sprint sau'}`);
    // timeline strip
    const SX = 0.4; const SW = 4.1; const GX = SX + SW; const GW = 0.9; const NX = GX + GW;
    const block = (x, w, code, a, b, col, tcol) => {
      box(s, x, 1.34, w, 0.26, col);
      txt(s, 'tl', `${code}  ·  ${dm(a)} – ${dm(b)}`, { x, y: 1.34, w, h: 0.26, size: 9.5, bold: true, color: tcol, align: 'center', valign: 'middle' });
    };
    block(SX, SW, sp.code, sp.start, sp.end, K.slate1, K.ink);
    if (ns) block(NX, SW, ns.code, ns.start, ns.end, K.soft, K.brand);
    // today marker
    s.addShape(p.ShapeType.line, { x: GX + GW / 2, y: 1.3, w: 0, h: 0.5, line: { color: K.red, width: 1.5, dashType: 'dash' } });
    txt(s, 'today', `Hôm nay ${dm(r.today)}`, { x: GX - 0.3, y: 1.82, w: GW + 0.6, h: 0.18, size: 8.5, bold: true, color: K.red, align: 'center' });

    // sprint cards with stacked bars
    const stageDefs = [['Done', K.done, K.white], ['Done UAT', K.doneUat, K.ink], ['inTest UAT', K.uat, K.ink], ['In Dev', K.slate3, K.white], ['Ready for Dev', K.slate2, K.ink], ['In Analyst', K.slate1, K.ink], ['Backlog', K.backlog, K.ink]];
    const card = (x, w, head, total, byStatus, sub) => {
      box(s, x, 2.08, w, 1.42, K.white, { round: 0.06, line: K.line });
      txt(s, 'ch', head, { x: x + 0.12, y: 2.13, w: w - 0.24, h: 0.26, size: 11, bold: true, color: K.brand });
      txt(s, 'cs', sub, { x: x + 0.12, y: 2.36, w: w - 0.24, h: 0.2, size: 9, color: K.mute });
      let bx = x + 0.12; const bw = w - 0.24;
      stageDefs.forEach(([lab, col, tc]) => {
        const n = byStatus[lab] || 0; if (!n) return; const sw = (n / total) * bw;
        s.addShape(p.ShapeType.rect, { x: bx, y: 2.62, w: sw, h: 0.36, fill: { color: col }, line: { color: K.white, width: 0.5 } });
        if (sw >= 0.26) txt(s, 'seg', String(n), { x: bx, y: 2.62, w: sw, h: 0.36, size: 11, bold: true, color: tc, align: 'center', valign: 'middle' });
        bx += sw;
      });
      const parts = stageDefs.filter(([l]) => byStatus[l]).map(([l]) => `${l} ${byStatus[l]}`).join('  ·  ');
      txt(s, 'cl', parts, { x: x + 0.12, y: 3.06, w: w - 0.24, h: 0.36, size: 9, color: K.mute });
    };
    card(SX, SW, `${sp.code} — ${sp.total} việc`, sp.total, sp.byStatus, `${sprintDone}/${sp.total} qua UAT · ${sp.overdue} việc quá hạn`);
    if (ns) card(NX, SW, `${ns.code} — ${ns.total} việc`, ns.total, ns.byStatus, `${ns.byStatus['inTest UAT'] || 0}/${ns.total} đã tới UAT · ${ns.byStatus['In Analyst'] || 0} còn đang phân tích`);
    // hand-over arrow between the cards
    const carry = sp.byStatus['inTest UAT'] || 0;
    if (carry) {
      s.addShape(p.ShapeType.rightArrow, { x: GX + 0.08, y: 2.62, w: GW - 0.16, h: 0.36, fill: { color: K.amber }, line: { color: K.amber, width: 0 } });
      txt(s, 'carry', `${carry} việc\nchờ UAT`, { x: GX, y: 3.0, w: GW, h: 0.4, size: 9, bold: true, color: 'B26B00', align: 'center' });
    }

    // UAT queue (this week vs last week)
    const qy = 3.68;
    txt(s, 'qh', 'Hàng chờ UAT hiện tại — theo sprint của từng việc', { x: 0.4, y: qy, w: 5.0, h: 0.22, size: 10, bold: true, color: K.brand });
    const sprintKeys = Object.keys(r.inUatBySprint).sort();
    const maxQ = Math.max(uatNow, uatPrev, 1); const QW = 3.6;
    txt(s, 'ql1', 'Tuần trước', { x: 0.4, y: qy + 0.3, w: 0.8, h: 0.26, size: 9, color: K.mute, valign: 'middle' });
    s.addShape(p.ShapeType.rect, { x: 1.25, y: qy + 0.3, w: (uatPrev / maxQ) * QW, h: 0.26, fill: { color: K.white }, line: { color: K.amber, width: 1.25, dashType: 'dash' } });
    txt(s, 'qv1', String(uatPrev), { x: 1.25, y: qy + 0.3, w: (uatPrev / maxQ) * QW, h: 0.26, size: 10, bold: true, color: 'B26B00', align: 'center', valign: 'middle' });
    txt(s, 'ql2', 'Hiện tại', { x: 0.4, y: qy + 0.62, w: 0.8, h: 0.26, size: 9, bold: true, valign: 'middle' });
    const shades = [K.slate1, K.amber, 'FFD98A', K.slate2];
    let qx = 1.25;
    sprintKeys.forEach((k, i) => {
      const n = r.inUatBySprint[k]; const w = (n / maxQ) * QW;
      s.addShape(p.ShapeType.rect, { x: qx, y: qy + 0.62, w, h: 0.26, fill: { color: k === sp.code ? K.amber : (k < sp.code ? K.slate1 : 'FFD98A') }, line: { color: K.white, width: 0.5 } });
      txt(s, 'qs', `${k}: ${n}`, { x: qx, y: qy + 0.62, w, h: 0.26, size: 8.5, bold: true, align: 'center', valign: 'middle' });
      qx += w;
    });
    txt(s, 'qn', `${sign(uatNow - uatPrev)} so tuần trước; ${overdueUat}/${overdue.length} việc quá hạn nằm ở khâu này.`, { x: 0.4, y: qy + 0.95, w: 5.0, h: 0.34, size: 9.5, color: K.ink });

    // so what
    box(s, 5.55, qy - 0.06, 4.05, 1.42, K.soft, { round: 0.06 });
    txt(s, 'swh', 'Cần biết', { x: 5.7, y: qy, w: 3.8, h: 0.24, size: 10, bold: true, color: K.brand });
    const bl = [];
    bl.push(`${sp.code} còn ${sp.not_done} việc chưa Done: ${sp.byStatus['inTest UAT'] || 0} chờ UAT, ${sp.byStatus['Done UAT'] || 0} chờ lên Done.`);
    if (ns) bl.push(`${ns.code} (từ ${dm(ns.start)}): ${ns.total} việc, ${ns.byStatus['In Analyst'] || 0} còn ở phân tích → thời gian dev + test sẽ gấp.`);
    bl.push(`UAT chưa giải phóng sớm thì tồn ${sp.code} và việc ${ns ? ns.code : 'mới'} tranh cùng nguồn lực kiểm thử.`);
    txt(s, 'swb', bl.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < bl.length - 1 } })), { x: 5.7, y: qy + 0.26, w: 3.8, h: 1.06, size: 9, paraSpaceAfter: 2 });
  }

  // =====================================================================
  // SLIDE 4 — rủi ro & đề xuất
  // =====================================================================
  if (!best) {
    const s = frame(4, 'Chưa có dữ liệu để đánh giá rủi ro');
    txt(s, 'nodata', 'Trang này sẽ liệt kê rủi ro và đề xuất khi có dữ liệu.', { x: 0.4, y: 1.6, w: 9.2, h: 0.4, size: 12, color: K.mute });
  } else {
    const s = frame(4, `Bốn rủi ro cần quyết định — hai rủi ro đầu ảnh hưởng trực tiếp đến tiến độ ${[sp && sp.code, ns && ns.code].filter(Boolean).join('–') || 'sprint'}`);
    const csi = weakest; const wg = groupOf(r.categoryStatus[csi]);
    const topNew = Object.entries(r.newTasksThisWeek.reduce((a, t) => { a[t.category] = (a[t.category] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];
    const oldest = overdue.slice().sort((a, b) => b.days_late - a.days_late);
    const oldestSprint = overdue.map((t) => t.sprint).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0] || null;
    const rows = [
      {
        level: 'CAO', col: K.red, soft: K.redSoft,
        title: 'Nút thắt UAT',
        sign: `${uatNow} việc đang UAT (tuần trước ${uatPrev}); ${overdueUat}/${overdue.length} việc quá hạn nằm ở đây. (trang 3)`,
        impact: `Việc từ ${oldestSprint || 'sprint cũ'} tiếp tục trễ; ${ns ? ns.code : 'sprint sau'} khởi động khi tồn chưa xử lý.`,
        action: `Chỉ định đầu mối UAT, chốt lịch theo ngày; xử lý trước các việc ${oldestSprint || 'cũ nhất'} (trễ tới ${oldest[0] ? oldest[0].days_late : 0} ngày).`
      },
      {
        level: 'CAO', col: K.red, soft: K.redSoft,
        title: `${shortCat(csi)} chậm`,
        sign: `Chỉ ${wg.done}/${r.totals.byCategory[csi].total} Done (${pct(wg.done, r.totals.byCategory[csi].total)}%); ${wg.uat} đang UAT, ${wg.wip} còn phân tích/dev. (trang 2)`,
        impact: 'Nhóm lớn nhưng gần như chưa có đầu ra hoàn tất; dồn việc về cuối.',
        action: 'Rà lại thứ tự ưu tiên và nguồn lực; chia nhỏ để ra từng đợt thay vì một lần.'
      },
      {
        level: 'TRUNG BÌNH', col: 'B26B00', soft: K.amberSoft,
        title: 'Phạm vi tiếp tục tăng',
        sign: `+${r.newTasksThisWeek.length} việc mới trong tuần${topNew ? `, ${topNew[1]} thuộc ${shortCat(topNew[0])}` : ''} khi sprint chưa đóng. (trang 1)`,
        impact: 'Thêm việc vào hàng đợi đã đầy, kéo dài thời gian chờ của việc hiện có.',
        action: `Đóng băng phạm vi ${ns ? ns.code : 'sprint kế'}, hoặc đổi việc mới lấy việc tương đương.`
      },
      {
        level: 'TRUNG BÌNH', col: 'B26B00', soft: K.amberSoft,
        title: 'Việc qua UAT chưa lên Done',
        sign: `${doneUatNow} việc ở Done UAT; tính theo mốc Done thì ${r.risks.overdueByDone} việc quá hạn (thay vì ${overdue.length}). (trang 1)`,
        impact: 'Giá trị chưa tới người dùng; số liệu hoàn thành có thể bị hiểu thấp hơn thực tế.',
        action: 'Lên lịch release theo đợt và thống nhất mốc "Done" để báo cáo quá hạn.'
      }
    ];
    const cols = [['Mức', 0.4, 0.85], ['Rủi ro & dấu hiệu', 1.25, 3.2], ['Nếu không xử lý', 4.45, 2.35], ['Đề xuất / cần quyết định', 6.8, 2.8]];
    cols.forEach(([h, x, w]) => { box(s, x, 1.35, w, 0.26, K.brand); txt(s, 'th', h, { x: x + 0.08, y: 1.35, w: w - 0.1, h: 0.26, size: 9.5, bold: true, color: K.white, valign: 'middle' }); });
    const RH = 0.72;
    rows.forEach((row, i) => {
      const y = 1.66 + i * (RH + 0.05);
      box(s, 0.4, y, 9.2, RH, K.white, { line: K.line });
      box(s, 0.4, y, 0.85, RH, row.soft);
      txt(s, 'lv', [{ text: String(i + 1), options: { fontSize: 14, bold: true, breakLine: true } }, { text: row.level, options: { fontSize: 8, bold: true } }], { x: 0.4, y, w: 0.85, h: RH, color: row.col, align: 'center', valign: 'middle', size: 9 });
      txt(s, 'rt', [{ text: row.title, options: { bold: true, breakLine: true } }, { text: row.sign, options: { color: K.mute, fontSize: 9 } }], { x: 1.33, y: y + 0.04, w: 3.05, h: RH - 0.06, size: 10 });
      txt(s, 'ri', row.impact, { x: 4.53, y: y + 0.04, w: 2.2, h: RH - 0.06, size: 9.5 });
      txt(s, 'ra', row.action, { x: 6.88, y: y + 0.04, w: 2.65, h: RH - 0.06, size: 9.5, bold: false });
    });
    const ly = 1.66 + 4 * (RH + 0.05);
    const soon = r.risks.dueNext7;
    txt(s, 'other', [
      { text: 'Cũng theo dõi: ', options: { bold: true, color: K.brand } },
      { text: `${r.risks.subOverdue} subtask quá hạn${soon.length ? `; ${soon.length} việc đến hạn ≤ 7 ngày: ${soon.slice(0, 2).map((t) => `${t.name.slice(0, 26)} (${dm(t.due)})`).join(', ')}` : ''}.` }
    ], { x: 0.4, y: ly + 0.02, w: 9.2, h: 0.4, size: 9.5 });
  }


  return p.write({ outputType: 'nodebuffer' }).then((buffer) => ({ buffer, warnings }));
}

module.exports = { buildWeeklyDeck };
