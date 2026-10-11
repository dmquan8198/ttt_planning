// Weekly boss report deck: 4 self-explanatory slides in the MoMo template look
// (white content background + logo from "Template Slide MoMo_28Aug2024.pptx"),
// set in Momo Trust Display. Built from collectWeeklyReport()'s output; every
// number and sentence is derived from it, nothing is hard-coded to one week.
//
// 1 Tổng quan & thay đổi → 2 Chi tiết nghiệp vụ → 3 Sprint & nút thắt → 4 Rủi ro & đề xuất
//
// Design rules (see deckText.js for the layout side):
//  - one accent colour (MoMo magenta) + greys; magenta marks only what must stand out;
//  - text decides the box: widths and heights come from measured text, not fixed frames;
//  - one font weight, so hierarchy = size + colour.
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { createCanvas, advance, lineHeight } = require('./deckText');

const K = {
  ink: '262626', mute: '6B6B6B', faint: 'A8A8A8', line: 'E4E4E4', white: 'FFFFFF',
  brand: 'A50064', tint: 'F3DCEA', brandMid: 'DE9CC2',
  g1: '5E5E5E', g2: 'B4B4B4', g3: 'E6E6E6'
};
const BG = path.join(__dirname, '..', 'assets', 'momo-content-bg.png');
const X0 = 0.5; const X1 = 9.5; const W = X1 - X0; // content column

const dm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const dmy = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortCat = (c) => c.replace('TTT New - ', '');
// shorten at a word boundary, never mid-word
const cut = (str, n) => (str.length <= n ? str : str.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

const STEPS = ['Tổng quan & thay đổi', 'Chi tiết nghiệp vụ', 'Sprint & nút thắt', 'Rủi ro & đề xuất'];

function buildWeeklyDeck(r) {
  const warnings = [];
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9'; // 10 x 5.625 in — same canvas as the template
  p.title = `Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}`;
  p.company = 'MoMo';

  // a slide with the shared frame: step line, title, footer. Returns { c, top }:
  // the canvas and the y where content may start (just under however many lines the title took)
  function frame(n, title) {
    const s = p.addSlide();
    s.background = { path: BG };
    const c = createCanvas(p, s, warnings);
    // where we are in the story — plain text, current step in magenta
    let x = X0;
    STEPS.forEach((label, i) => {
      const t = c.text(`${i + 1}  ${label}`, { x, y: 0.26, pt: 8, color: i + 1 === n ? K.brand : K.faint });
      x = t.right + 0.28;
    });
    const t = c.text(title, { x: X0, y: 0.56, pt: 17, color: K.ink, maxW: W });
    c.text(`Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}/${r.today.slice(0, 4)}  ·  Nguồn: TTT Planning, số liệu ${dmy(r.today)}`, { x: 0.8, y: 5.25, pt: 7, color: K.faint, footer: true });
    c.text(`${n}/4`, { x: X1, y: 5.25, pt: 7, color: K.faint, align: 'r', footer: true });
    return { c, top: Math.max(1.3, t.bottom + 0.22) };
  }

  // legend entry laid out left to right; returns the next x
  function legendItem(c, x, y, swatch, label, pt = 7.5) {
    if (swatch.dash) c.rect({ x, y: y + 0.035, w: 0.13, h: 0.085, line: swatch.dash, dash: 'dash', lw: 1 });
    else c.rect({ x, y: y + 0.035, w: 0.13, h: 0.085, fill: swatch.fill });
    const t = c.text(label, { x: x + 0.19, y, pt, color: K.mute });
    return t.right + 0.22;
  }

  // ---------- data ----------
  const prev = r.prevSnapshot; const ps = prev ? prev.by_status : {};
  const now = r.totals.byStatus;
  // focus = the stages the story is about; they get the accent colour, the rest stay grey
  const STAGES = [
    { label: 'Backlog', code: '0.backlog', phase: 'Phân tích', fill: K.g3 },
    { label: 'In Analyst', code: '1.in_analyst', phase: 'Phân tích', fill: K.g2 },
    { label: 'Ready for Dev', code: '2.ready_for_dev', phase: 'Phân tích', fill: K.g2 },
    { label: 'In Dev', code: '3.in_test', phase: 'Phát triển', fill: K.g2 },
    { label: 'inTest UAT', code: '4.in_test_uat', phase: 'Kiểm thử', fill: K.brand, focus: true },
    { label: 'Done UAT', code: '5.ready_for_staging', phase: 'Kiểm thử', fill: K.brandMid },
    { label: 'Done', code: '6.done', phase: 'Hoàn tất', fill: K.brand, focus: true }
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
    const { c, top } = frame(1, `Done tăng ${donePrev} → ${doneNow}${ratio ? ` (gấp ${ratio} lần)` : ''} trong tuần${bottleneck}`);

    // headline numbers: no frames, just number → label → note
    const kp = [
      { big: String(total), label: 'nghiệp vụ', note: `${sign(total - totalPrev)} so tuần trước · ${r.newTasksThisWeek.length} việc mới`, color: K.ink },
      { big: String(doneNow), label: `đã Done (${pct(doneNow, total)}%)`, note: `${sign(doneNow - donePrev)} so tuần trước`, color: K.brand },
      { big: `${uatPrev} → ${uatNow}`, label: 'đang chờ UAT', note: uatNow > uatPrev ? 'tăng gấp đôi, đây là điểm nghẽn' : 'so tuần trước', color: K.brand },
      { big: String(overdue.length), label: 'việc quá hạn', note: `${overdueUat} việc đang chờ UAT`, color: K.ink }
    ];
    const colW = W / kp.length;
    let y = top;
    let kpBottom = y;
    kp.forEach((k, i) => {
      const x = X0 + i * colW;
      const b = c.text(k.big, { x, y, pt: 26, color: k.color });
      const l = c.text(k.label, { x, y: b.bottom + 0.02, pt: 9, color: K.ink });
      const n = c.text(k.note, { x, y: l.bottom + 0.01, pt: 7.5, color: K.mute, maxW: colW - 0.15 });
      kpBottom = Math.max(kpBottom, n.bottom);
    });

    // pipeline: dashed outline = last week, solid = now
    const colWs = W / STAGES.length;
    let yy = kpBottom + 0.28;
    // phase labels with a thin rule under each span
    const phases = []; STAGES.forEach((st, i) => { const l = phases[phases.length - 1]; if (l && l.name === st.phase) l.to = i; else phases.push({ name: st.phase, from: i, to: i }); });
    phases.forEach((ph) => {
      const xa = X0 + ph.from * colWs + 0.05; const xb = X0 + (ph.to + 1) * colWs - 0.05;
      c.text(ph.name.toUpperCase(), { x: (xa + xb) / 2, y: yy, pt: 6.5, color: K.faint, align: 'c' });
      c.hline(xa, xb, yy + lineHeight(6.5) + 0.03, { color: K.line });
    });
    yy += lineHeight(6.5) + 0.1;
    const labelY = yy;
    STAGES.forEach((st, i) => {
      c.text(st.label, { x: X0 + (i + 0.5) * colWs, y: labelY, pt: 9, color: st.focus ? K.brand : K.ink, align: 'c' });
    });
    yy = labelY + lineHeight(9) + 0.1;

    const deltaH = lineHeight(8.5) + 0.06;
    const takeawayH = 0.7;
    const base = 5.0 - takeawayH - 0.1 - deltaH; // bar baseline: leave room for deltas + the takeaways under them
    const valH = lineHeight(11) + 0.02;
    const maxBar = Math.max(0.5, base - yy - valH);
    const maxV = Math.max(...STAGES.map((st) => Math.max(nowOf(st), prevOf(st))), 1);
    const bw = 0.4;
    STAGES.forEach((st, i) => {
      const cx = X0 + (i + 0.5) * colWs;
      const ph = (prevOf(st) / maxV) * maxBar; const nh = (nowOf(st) / maxV) * maxBar;
      const gx = cx - bw - 0.05; const nx = cx + 0.05;
      if (ph > 0.005) c.rect({ x: gx, y: base - ph, w: bw, h: ph, line: st.focus ? K.brand : K.faint, dash: 'dash', lw: 1 });
      if (nh > 0.005) c.rect({ x: nx, y: base - nh, w: bw, h: nh, fill: st.fill });
      c.text(String(prevOf(st)), { x: gx + bw / 2, y: base - ph - lineHeight(8.5) - 0.02, pt: 8.5, color: K.faint, align: 'c' });
      c.text(String(nowOf(st)), { x: nx + bw / 2, y: base - nh - lineHeight(11) - 0.02, pt: 11, color: st.focus ? K.brand : K.ink, align: 'c' });
      const d = nowOf(st) - prevOf(st);
      c.text(d === 0 ? '±0' : sign(d), { x: cx, y: base + 0.06, pt: 8.5, color: d !== 0 && st.focus ? K.brand : K.mute, align: 'c' });
    });
    c.hline(X0, X1, base, { color: K.g2 });
    // legend sits in the free corner above the shortest bars
    let lx = X0;
    lx = legendItem(c, lx, labelY + lineHeight(9) + 0.06, { dash: K.faint }, 'tuần trước');
    legendItem(c, lx, labelY + lineHeight(9) + 0.06, { fill: K.g1 }, 'hiện tại');

    // what it means: three short statements, the first words carry the colour
    const dU = doneUatNow - (ps['5.ready_for_staging'] || 0);
    const notes = [
      [{ text: `${r.doneThisWeek.length} việc lên Done. `, color: K.brand }, { text: `${moved} việc chuyển sang giai đoạn mới trong tuần.` }],
      uatNow > uatPrev
        ? [{ text: `inTest UAT ${sign(uatNow - uatPrev)}. `, color: K.brand }, { text: 'Việc xong dev đang xếp hàng chờ kiểm thử (trang 3).' }]
        : [{ text: `inTest UAT ${uatPrev} → ${uatNow}.`, color: K.ink }],
      dU < 0
        ? [{ text: `Done UAT ${sign(dU)}. `, color: K.ink }, { text: 'Do đã chuyển lên Done, không phải mất việc.' }]
        : [{ text: `Done UAT ${sign(dU)}. `, color: K.ink }, { text: `Còn ${doneUatNow} việc qua UAT chờ lên Done.` }]
    ];
    const ty = 5.0 - takeawayH;
    notes.forEach((n, i) => { c.text(n, { x: X0 + i * colW * (4 / 3), y: ty, pt: 9.5, color: K.mute, maxW: colW * (4 / 3) - 0.2 }); });
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
  const passUat = (cat) => { const g = groupOf(r.categoryStatus[cat]); return pct(g.done + g.doneUat, r.totals.byCategory[cat].total); };
  const bigAll = cats.filter((cat) => r.totals.byCategory[cat].total >= 10);
  const big = bigAll.length ? bigAll : cats;
  // "best" = the main workstream (largest category), so the headline is about where most of the work is
  const best = [...big].sort((a, b) => r.totals.byCategory[b].total - r.totals.byCategory[a].total)[0];
  const gap = (cat) => r.totals.byCategory[cat].total * (100 - passUat(cat)) / 100; // việc chưa qua UAT
  const weakest = [...big].filter((cat) => cat !== best).sort((a, b) => gap(b) - gap(a))[0] || best;
  {
    if (!best) {
      const { c, top } = frame(2, 'Chưa có nghiệp vụ nào trong hệ thống');
      c.text('Trang này sẽ hiển thị tiến độ từng nhóm khi có dữ liệu.', { x: X0, y: top, pt: 10, color: K.mute });
    } else {
      const bg = groupOf(r.categoryStatus[best]); const wg = groupOf(r.categoryStatus[weakest]);
      const { c, top } = frame(2, `${shortCat(best)} đã ${passUat(best)}% qua UAT; ${shortCat(weakest)} mới ${passUat(weakest)}% — đây là nhóm cần theo dõi nhất`);
      // five segments: the accent family = work that has passed UAT, greys = still to go
      const SEG = [
        ['Done', K.brand, K.white, (g) => g.done],
        ['Done UAT', K.brandMid, K.ink, (g) => g.doneUat],
        ['inTest UAT', K.g1, K.white, (g) => g.uat],
        ['Analyst / Dev', K.g2, K.ink, (g) => g.wip],
        ['Backlog', K.g3, K.ink, (g) => g.backlog]
      ];
      let lx = X0;
      SEG.forEach(([label, fill]) => { lx = legendItem(c, lx, top, { fill }, label); });
      const BX = 2.5; const BW = 4.4; const rowH = 0.34; const hy = top + 0.3;
      c.text('Tỷ trọng theo giai đoạn (số trong ô = số nghiệp vụ)', { x: BX, y: hy, pt: 7, color: K.faint });
      c.text('Done tuần này', { x: 7.75, y: hy, pt: 7, color: K.faint, align: 'c' });
      c.text('Quá hạn*', { x: 8.95, y: hy, pt: 7, color: K.faint, align: 'c' });
      const y0 = hy + lineHeight(7) + 0.08;
      cats.forEach((cat, i) => {
        const y = y0 + i * (rowH + 0.04);
        const tot = r.totals.byCategory[cat].total; const g = groupOf(r.categoryStatus[cat]);
        const focus = cat === best || cat === weakest;
        c.text([{ text: shortCat(cat), color: focus ? K.ink : K.mute }, { text: `  ${tot}`, color: K.faint }], { x: X0, y: y + (rowH - lineHeight(10)) / 2, pt: 10 });
        let x = BX;
        SEG.forEach(([, fill, tc, pick]) => {
          const n = pick(g); if (!n) return;
          const w = (n / tot) * BW;
          c.rect({ x, y: y + 0.03, w, h: rowH - 0.06, fill });
          if (w >= 0.24) c.text(String(n), { x: x + w / 2, y: y + (rowH - lineHeight(8.5)) / 2, pt: 8.5, color: tc, align: 'c' });
          x += w;
        });
        const dw = doneWeekBy[cat] || 0; const od = r.totals.byCategory[cat].overdue;
        c.text(dw ? `+${dw}` : '–', { x: 7.75, y: y + (rowH - lineHeight(9.5)) / 2, pt: 9.5, color: dw ? K.brand : K.faint, align: 'c' });
        c.text(od ? String(od) : '–', { x: 8.95, y: y + (rowH - lineHeight(9.5)) / 2, pt: 9.5, color: od ? K.ink : K.faint, align: 'c' });
      });
      const rowsEnd = y0 + cats.length * (rowH + 0.04);
      c.text('* Quá hạn: qua hạn, chưa Done UAT', { x: X1, y: rowsEnd + 0.01, pt: 6.5, color: K.faint, align: 'r' });

      // three short readings of the table
      const names = (cat) => r.doneThisWeek.filter((t) => t.category === cat).slice(0, 3).map((t) => t.name.replace(/^\[[^\]]+\]\s*/, '')).join(', ');
      const smalls = cats.filter((cat) => cat !== best && cat !== weakest);
      const cards = [
        [shortCat(best), `${bg.done + bg.doneUat}/${r.totals.byCategory[best].total} qua UAT; tuần này +${doneWeekBy[best] || 0} Done${doneWeekBy[best] ? ` (vd: ${names(best)})` : ''}.`],
        [shortCat(weakest), `${wg.done}/${r.totals.byCategory[weakest].total} Done; ${wg.uat} đang UAT, ${wg.wip} đang phân tích/dev, ${wg.backlog} backlog.`],
        ['Nhóm nhỏ (Done / tổng)', smalls.map((cat) => `${shortCat(cat)} ${r.categoryStatus[cat]['Done'] || 0}/${r.totals.byCategory[cat].total}`).join(' · ')]
      ];
      const cy = rowsEnd + 0.3; const cw = W / 3;
      cards.forEach(([h, t], i) => {
        const x = X0 + i * cw;
        const hh = c.text(h, { x, y: cy, pt: 10.5, color: i === 1 ? K.brand : K.ink });
        c.text(t, { x, y: hh.bottom + 0.04, pt: 9, color: K.mute, maxW: cw - 0.2 });
      });
    }
  }

  // =====================================================================
  // SLIDE 3 — sprint & nút thắt UAT
  // =====================================================================
  {
    if (!sp) {
      const { c, top } = frame(3, 'Chưa có sprint nào đang chạy hoặc vừa kết thúc');
      c.text('Thêm sprint trong app (màn Sprint Overview) để trang này hiển thị tiến độ và hàng chờ UAT.', { x: X0, y: top, pt: 10, color: K.mute });
    } else {
      const sprintDone = (sp.byStatus['Done'] || 0) + (sp.byStatus['Done UAT'] || 0);
      const { c, top } = frame(3, `${sp.code} ${sp.ended ? 'khép lại' : 'đang chạy'} với ${sprintDone}/${sp.total} việc qua UAT — ${sp.byStatus['inTest UAT'] || 0} việc còn lại đang chờ UAT và sẽ chồng lên ${ns ? ns.code : 'sprint sau'}`);
      const SW = 4.1; const NX = X1 - SW; const GX = X0 + SW; const GW = NX - GX;
      // timeline: two sprint blocks, a dashed line for today in the gap between them
      const tl = (x, code, a, b, fill, color) => {
        c.rect({ x, y: top, w: SW, h: 0.26, fill });
        c.text(`${code}  ·  ${dm(a)} – ${dm(b)}`, { x: x + SW / 2, y: top + (0.26 - lineHeight(8.5)) / 2, pt: 8.5, color, align: 'c' });
      };
      tl(X0, sp.code, sp.start, sp.end, K.g3, K.ink);
      if (ns) tl(NX, ns.code, ns.start, ns.end, K.tint, K.brand);
      c.vline(GX + GW / 2, top - 0.04, top + 0.34, { color: K.ink, dash: 'dash', lw: 1 });
      c.text(`Hôm nay ${dm(r.today)}`, { x: GX + GW / 2, y: top + 0.37, pt: 7, color: K.ink, align: 'c' });

      // each sprint: title, one line of meaning, one bar, counts underneath — no frames
      const defs = [['Done', K.brand, K.white], ['Done UAT', K.brandMid, K.ink], ['inTest UAT', K.g1, K.white], ['In Dev', K.g2, K.ink], ['Ready for Dev', K.g2, K.ink], ['In Analyst', K.g3, K.ink], ['Backlog', K.g3, K.ink]];
      const cy = top + 0.78;
      let cardsBottom = cy;
      const card = (x, head, total, byStatus, sub) => {
        const h = c.text(head, { x, y: cy, pt: 13, color: K.ink });
        const s2 = c.text(sub, { x, y: h.bottom + 0.03, pt: 9, color: K.mute, maxW: SW });
        const by = s2.bottom + 0.12; const bh = 0.34;
        let bx = x;
        defs.forEach(([lab, fill, tc]) => {
          const n = byStatus[lab] || 0; if (!n) return; const w = (n / total) * SW;
          c.rect({ x: bx, y: by, w, h: bh, fill });
          if (w >= 0.24) c.text(String(n), { x: bx + w / 2, y: by + (bh - lineHeight(10)) / 2, pt: 10, color: tc, align: 'c' });
          bx += w;
        });
        const parts = defs.filter(([lab]) => byStatus[lab]).map(([lab]) => `${lab} ${byStatus[lab]}`).join('  ·  ');
        const cnt = c.text(parts, { x, y: by + bh + 0.07, pt: 7.5, color: K.faint, maxW: SW });
        cardsBottom = Math.max(cardsBottom, cnt.bottom);
        return by + bh / 2;
      };
      const midY = card(X0, `${sp.code} — ${sp.total} việc`, sp.total, sp.byStatus, `${sprintDone}/${sp.total} qua UAT · ${sp.overdue} việc quá hạn`);
      if (ns) card(NX, `${ns.code} — ${ns.total} việc`, ns.total, ns.byStatus, `${ns.byStatus['inTest UAT'] || 0}/${ns.total} đã tới UAT · ${ns.byStatus['In Analyst'] || 0} còn đang phân tích`);
      const carry = sp.byStatus['inTest UAT'] || 0;
      if (carry && ns) {
        c.text('→', { x: GX + GW / 2, y: midY - lineHeight(16) / 2, pt: 16, color: K.brand, align: 'c' });
        c.text(`${carry} việc`, { x: GX + GW / 2, y: midY + lineHeight(16) / 2, pt: 8, color: K.brand, align: 'c' });
        c.text('chờ UAT', { x: GX + GW / 2, y: midY + lineHeight(16) / 2 + lineHeight(8), pt: 8, color: K.brand, align: 'c' });
      }

      // UAT queue now vs last week (left) and what it means (right)
      const qy = cardsBottom + 0.3;
      const qh = c.text('Hàng chờ UAT hiện tại, theo sprint của từng việc', { x: X0, y: qy, pt: 10.5, color: K.ink });
      const keys = Object.keys(r.inUatBySprint).sort();
      const maxQ = Math.max(uatNow, uatPrev, 1); const QX = X0 + 0.95; const QW = 3.1; const bh = 0.28;
      const row1 = qh.bottom + 0.1; const row2 = row1 + bh + 0.08;
      c.text('Tuần trước', { x: X0, y: row1 + (bh - lineHeight(8.5)) / 2, pt: 8.5, color: K.mute });
      c.rect({ x: QX, y: row1, w: (uatPrev / maxQ) * QW, h: bh, line: K.brand, dash: 'dash', lw: 1 });
      c.text(String(uatPrev), { x: QX + ((uatPrev / maxQ) * QW) / 2, y: row1 + (bh - lineHeight(9.5)) / 2, pt: 9.5, color: K.brand, align: 'c' });
      c.text('Hiện tại', { x: X0, y: row2 + (bh - lineHeight(8.5)) / 2, pt: 8.5, color: K.ink });
      let qx = QX;
      keys.forEach((k) => {
        const n = r.inUatBySprint[k]; const w = (n / maxQ) * QW;
        c.rect({ x: qx, y: row2, w, h: bh, fill: K.brand, line: K.white, lw: 0.75 });
        c.text(w >= 0.55 ? `${k}: ${n}` : String(n), { x: qx + w / 2, y: row2 + (bh - lineHeight(8.5)) / 2, pt: 8.5, color: K.white, align: 'c' });
        qx += w;
      });
      c.text(`${sign(uatNow - uatPrev)} so tuần trước; ${overdueUat}/${overdue.length} việc quá hạn nằm ở khâu này.`, { x: X0, y: row2 + bh + 0.1, pt: 9, color: K.mute, maxW: 4.6 });

      const rx = 5.4; const rw = X1 - rx;
      const sh = c.text('Cần biết', { x: rx, y: qy, pt: 10.5, color: K.brand });
      const bl = [];
      bl.push(`${sp.code} còn ${sp.not_done} việc chưa Done: ${sp.byStatus['inTest UAT'] || 0} chờ UAT, ${sp.byStatus['Done UAT'] || 0} chờ lên Done.`);
      if (ns) bl.push(`${ns.code} (từ ${dm(ns.start)}): ${ns.total} việc, ${ns.byStatus['In Analyst'] || 0} còn ở phân tích → thời gian dev + test sẽ gấp.`);
      bl.push(`UAT chưa giải phóng sớm thì tồn ${sp.code} và việc ${ns ? ns.code : 'mới'} tranh cùng nguồn lực kiểm thử.`);
      let by = sh.bottom + 0.08;
      bl.forEach((t) => {
        c.text('•', { x: rx, y: by, pt: 9, color: K.brand });
        const b = c.text(t, { x: rx + 0.16, y: by, pt: 9, color: K.ink, maxW: rw - 0.16 });
        by = b.bottom + 0.08;
      });
    }
  }

  // =====================================================================
  // SLIDE 4 — rủi ro & đề xuất
  // =====================================================================
  {
    if (!best) {
      const { c, top } = frame(4, 'Chưa có dữ liệu để đánh giá rủi ro');
      c.text('Trang này sẽ liệt kê rủi ro và đề xuất khi có dữ liệu.', { x: X0, y: top, pt: 10, color: K.mute });
    } else {
      const { c, top } = frame(4, `Bốn rủi ro cần quyết định — hai rủi ro đầu ảnh hưởng trực tiếp đến tiến độ ${[sp && sp.code, ns && ns.code].filter(Boolean).join('–') || 'sprint'}`);
      const csi = weakest; const wg = groupOf(r.categoryStatus[csi]);
      const topNew = Object.entries(r.newTasksThisWeek.reduce((a, t) => { a[t.category] = (a[t.category] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];
      const oldest = overdue.slice().sort((a, b) => b.days_late - a.days_late);
      const oldestSprint = overdue.map((t) => t.sprint).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0] || null;
      const rows = [
        {
          high: true, title: 'Nút thắt UAT',
          sign: `${uatNow} việc đang UAT (tuần trước ${uatPrev}); ${overdueUat}/${overdue.length} việc quá hạn nằm ở đây. (trang 3)`,
          impact: `Việc từ ${oldestSprint || 'sprint cũ'} tiếp tục trễ; ${ns ? ns.code : 'sprint sau'} khởi động khi tồn chưa xử lý.`,
          action: `Chỉ định đầu mối UAT, chốt lịch theo ngày; xử lý trước các việc ${oldestSprint || 'cũ nhất'} (trễ tới ${oldest[0] ? oldest[0].days_late : 0} ngày).`
        },
        {
          high: true, title: `${shortCat(csi)} chậm`,
          sign: `Chỉ ${wg.done}/${r.totals.byCategory[csi].total} Done (${pct(wg.done, r.totals.byCategory[csi].total)}%); ${wg.uat} đang UAT, ${wg.wip} còn phân tích/dev. (trang 2)`,
          impact: 'Nhóm lớn nhưng gần như chưa có đầu ra hoàn tất; dồn việc về cuối.',
          action: 'Rà lại thứ tự ưu tiên và nguồn lực; chia nhỏ để ra từng đợt thay vì một lần.'
        },
        {
          high: false, title: 'Phạm vi tiếp tục tăng',
          sign: `+${r.newTasksThisWeek.length} việc mới trong tuần${topNew ? `, ${topNew[1]} thuộc ${shortCat(topNew[0])}` : ''} khi sprint chưa đóng. (trang 1)`,
          impact: 'Thêm việc vào hàng đợi đã đầy, kéo dài thời gian chờ của việc hiện có.',
          action: `Đóng băng phạm vi ${ns ? ns.code : 'sprint kế'}, hoặc đổi việc mới lấy việc tương đương.`
        },
        {
          high: false, title: 'Việc qua UAT chưa lên Done',
          sign: `${doneUatNow} việc ở Done UAT; tính theo mốc Done thì ${r.risks.overdueByDone} việc quá hạn (thay vì ${overdue.length}). (trang 1)`,
          impact: 'Giá trị chưa tới người dùng; số liệu hoàn thành có thể bị hiểu thấp hơn thực tế.',
          action: 'Lên lịch release theo đợt và thống nhất mốc "Done" để báo cáo quá hạn.'
        }
      ];
      // columns; every row is as tall as its tallest cell
      const COL = { lvl: X0, risk: X0 + 1.0, impact: X0 + 4.25, action: X0 + 6.5 };
      const WID = { risk: 3.05, impact: 2.05, action: X1 - (X0 + 6.5) };
      c.text('MỨC', { x: COL.lvl, y: top, pt: 7, color: K.faint });
      c.text('RỦI RO VÀ DẤU HIỆU', { x: COL.risk, y: top, pt: 7, color: K.faint });
      c.text('NẾU KHÔNG XỬ LÝ', { x: COL.impact, y: top, pt: 7, color: K.faint });
      c.text('ĐỀ XUẤT / CẦN QUYẾT ĐỊNH', { x: COL.action, y: top, pt: 7, color: K.faint });
      let y = top + lineHeight(7) + 0.07;
      c.hline(X0, X1, y, { color: K.g2 });
      y += 0.1;
      rows.forEach((row, i) => {
        c.text(String(i + 1), { x: COL.lvl, y, pt: 18, color: row.high ? K.brand : K.mute });
        const pillY = y + lineHeight(18) + 0.02;
        c.pill(row.high ? 'CAO' : 'TRUNG BÌNH', { x: COL.lvl, y: pillY, pt: 7, color: row.high ? K.white : K.brand, fill: row.high ? K.brand : null, line: row.high ? null : K.brand });
        const t = c.text(row.title, { x: COL.risk, y, pt: 11.5, color: K.ink });
        const sg = c.text(row.sign, { x: COL.risk, y: t.bottom + 0.03, pt: 8.5, color: K.mute, maxW: WID.risk });
        const im = c.text(row.impact, { x: COL.impact, y, pt: 9, color: K.mute, maxW: WID.impact });
        const ac = c.text(row.action, { x: COL.action, y, pt: 9, color: K.ink, maxW: WID.action });
        const rowBottom = Math.max(sg.bottom, im.bottom, ac.bottom, pillY + lineHeight(7) + 0.08);
        y = rowBottom + 0.17;
        c.hline(X0, X1, y - 0.085, { color: K.line });
      });
      const soon = r.risks.dueNext7;
      c.text([
        { text: 'Cũng theo dõi: ', color: K.brand },
        { text: `${r.risks.subOverdue} subtask quá hạn${soon.length ? `; ${soon.length} việc đến hạn ≤ 7 ngày: ${soon.slice(0, 2).map((t) => `${cut(t.name, 28)} (${dm(t.due)})`).join(', ')}` : ''}.`, color: K.mute }
      ], { x: X0, y: y, pt: 8.5, maxW: W });
    }
  }

  return p.write({ outputType: 'nodebuffer' }).then((buffer) => ({ buffer, warnings }));
}

module.exports = { buildWeeklyDeck };
