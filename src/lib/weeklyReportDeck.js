// Weekly boss report deck: TWO slides, highlights only, in the MoMo template look
// (white content background + logo from "Template Slide MoMo_28Aug2024.pptx"),
// set in Momo Trust Display. Built from collectWeeklyReport()'s output; every
// number and sentence is derived from it, nothing is hard-coded to one week.
//
//  1  Tổng quan & thay đổi — headline numbers, movement vs last week, what to watch
//  2  Nghiệp vụ trọng tâm — per item: where it stands, next step, blocker
//
// Design rules (layout side in deckText.js):
//  - one accent colour (MoMo magenta) + greys; magenta marks only what must stand out;
//  - text decides the box: widths and heights come from measured text, not fixed frames;
//  - one font weight, so hierarchy = size + colour;
//  - short phrases, not sentences.
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { createCanvas, lineHeight } = require('./deckText');
const { cut } = require('./weeklyReportItems');

const K = {
  ink: '262626', mute: '6B6B6B', faint: 'A8A8A8', line: 'E4E4E4', white: 'FFFFFF',
  brand: 'A50064', brandMid: 'DE9CC2',
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
// a short PIC label: logins like "anh.nguyen80" stay as they are, long display names keep their last two words
const shortName = (full) => {
  const first = String(full || '').split(' - ')[0].trim();
  return first.includes('.') && !first.includes(' ') ? first : first.split(/\s+/).slice(-2).join(' ');
};

const STEPS = ['Tổng quan & thay đổi', 'Nghiệp vụ: hiện tại · tiếp theo · blocker'];

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
    let x = X0;
    STEPS.forEach((label, i) => {
      const t = c.text(`${i + 1}  ${label}`, { x, y: 0.26, pt: 8, color: i + 1 === n ? K.brand : K.faint });
      x = t.right + 0.28;
    });
    const t = c.text(title, { x: X0, y: 0.56, pt: 17, color: K.ink, maxW: W });
    c.text(`Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}/${r.today.slice(0, 4)}  ·  Nguồn: TTT Planning, số liệu ${dmy(r.today)}`, { x: 0.8, y: 5.25, pt: 7, color: K.faint, footer: true });
    c.text(`${n}/2`, { x: X1, y: 5.25, pt: 7, color: K.faint, align: 'r', footer: true });
    return { c, top: Math.max(1.3, t.bottom + 0.2) };
  }

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
    { label: 'Backlog', name: 'Backlog', code: '0.backlog', fill: K.g3 },
    { label: 'Analyst', name: 'In Analyst', code: '1.in_analyst', fill: K.g2 },
    { label: 'Ready\nfor Dev', name: 'Ready for Dev', code: '2.ready_for_dev', fill: K.g2 },
    { label: 'In Dev', name: 'In Dev', code: '3.in_test', fill: K.g2 },
    { label: 'inTest\nUAT', name: 'inTest UAT', code: '4.in_test_uat', fill: K.brand, focus: true },
    { label: 'Done\nUAT', name: 'Done UAT', code: '5.ready_for_staging', fill: K.brandMid },
    { label: 'Done', name: 'Done', code: '6.done', fill: K.brand, focus: true }
  ];
  const nowOf = (st) => now[st.name] || 0;
  const prevOf = (st) => ps[st.code] || 0;
  const total = r.totals.total; const totalPrev = prev ? prev.total_tasks : 0;
  const doneNow = now['Done'] || 0; const donePrev = prev ? prev.completed_tasks : 0;
  const uatNow = now['inTest UAT'] || 0; const uatPrev = ps['4.in_test_uat'] || 0;
  const overdue = r.risks.overdue;
  const overdueUat = overdue.filter((t) => t.status === 'inTest UAT').length;
  const doneWeek = r.doneThisWeek;

  // =====================================================================
  // SLIDE 1 — tổng quan & thay đổi
  // =====================================================================
  {
    const ratio = donePrev ? (doneNow / donePrev).toFixed(1).replace('.', ',') : null;
    const { c, top } = frame(1,
      `Done ${donePrev} → ${doneNow}${ratio ? ` (gấp ${ratio} lần)` : ''}${uatNow > uatPrev ? `; UAT dồn ${uatPrev} → ${uatNow}` : ''}`);

    // headline numbers: no frames, number → label → note
    const kp = [
      { big: String(total), label: 'nghiệp vụ', note: `${sign(total - totalPrev)} · ${r.newTasksThisWeek.length} mới`, color: K.ink },
      { big: String(doneNow), label: `Done · ${pct(doneNow, total)}%`, note: `${sign(doneNow - donePrev)} so tuần trước`, color: K.brand },
      { big: `${uatPrev} → ${uatNow}`, label: 'chờ UAT', note: uatNow > uatPrev ? 'điểm nghẽn' : 'so tuần trước', color: K.brand },
      { big: String(overdue.length), label: 'quá hạn', note: `${overdueUat} đang ở UAT`, color: K.ink }
    ];
    const colW = W / kp.length;
    let kpBottom = top;
    kp.forEach((k, i) => {
      const x = X0 + i * colW;
      const b = c.text(k.big, { x, y: top, pt: 26, color: k.color });
      const l = c.text(k.label, { x, y: b.bottom + 0.02, pt: 9, color: K.ink });
      const n = c.text(k.note, { x, y: l.bottom + 0.01, pt: 7.5, color: K.mute });
      kpBottom = Math.max(kpBottom, n.bottom);
    });

    // left: movement vs last week (dashed = last week, solid = now)
    const CHART_W = 5.5;
    const colWs = CHART_W / STAGES.length;
    const sectionY = kpBottom + 0.3;
    c.text('Dịch chuyển so với tuần trước', { x: X0, y: sectionY, pt: 9, color: K.ink });
    let lx = X0 + 3.0;
    lx = legendItem(c, lx, sectionY + 0.01, { dash: K.faint }, 'tuần trước', 7);
    legendItem(c, lx, sectionY + 0.01, { fill: K.g1 }, 'hiện tại', 7);
    const chartTop = sectionY + lineHeight(9) + 0.12;
    const deltaH = lineHeight(8.5) + 0.04;
    const labelH = lineHeight(7.5) * 2 + 0.04;
    const base = 4.62 - labelH - deltaH; // labels + deltas live under the baseline
    const valH = lineHeight(11) + 0.04;
    const maxBar = Math.max(0.5, base - chartTop - valH);
    const maxV = Math.max(...STAGES.map((st) => Math.max(nowOf(st), prevOf(st))), 1);
    const bw = 0.27;
    STAGES.forEach((st, i) => {
      const cx = X0 + (i + 0.5) * colWs;
      const ph = (prevOf(st) / maxV) * maxBar; const nh = (nowOf(st) / maxV) * maxBar;
      const gx = cx - bw - 0.03; const nx = cx + 0.03;
      if (ph > 0.005) c.rect({ x: gx, y: base - ph, w: bw, h: ph, line: st.focus ? K.brand : K.faint, dash: 'dash', lw: 1 });
      if (nh > 0.005) c.rect({ x: nx, y: base - nh, w: bw, h: nh, fill: st.fill });
      c.text(String(prevOf(st)), { x: gx + bw / 2, y: base - ph - lineHeight(7.5) - 0.02, pt: 7.5, color: K.faint, align: 'c' });
      c.text(String(nowOf(st)), { x: nx + bw / 2, y: base - nh - lineHeight(10) - 0.02, pt: 10, color: st.focus ? K.brand : K.ink, align: 'c' });
      c.text(st.label, { x: cx, y: base + 0.06, pt: 7.5, color: st.focus ? K.brand : K.mute, align: 'c' });
      const d = nowOf(st) - prevOf(st);
      c.text(d === 0 ? '±0' : sign(d), { x: cx, y: base + 0.06 + labelH, pt: 8.5, color: d !== 0 && st.focus ? K.brand : K.mute, align: 'c' });
    });
    c.hline(X0, X0 + CHART_W, base, { color: K.g2 });

    // right: what to watch — a few short flags
    const rx = X0 + CHART_W + 0.45; const rw = X1 - rx;
    c.text('Cần chú ý', { x: rx, y: sectionY, pt: 9, color: K.brand });
    const cats = Object.keys(r.totals.byCategory);
    const passUat = (cat) => { const cs = r.categoryStatus[cat] || {}; return pct((cs['Done'] || 0) + (cs['Done UAT'] || 0), r.totals.byCategory[cat].total); };
    const gap = (cat) => r.totals.byCategory[cat].total * (100 - passUat(cat)) / 100;
    const weakest = cats.filter((cat) => r.totals.byCategory[cat].total >= 10).sort((a, b) => gap(b) - gap(a))[0];
    const topNew = Object.entries(r.newTasksThisWeek.reduce((a, t) => { a[t.category] = (a[t.category] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];
    const flags = [];
    if (uatNow > 0) flags.push([`UAT ${uatNow} việc`, `${overdueUat}/${overdue.length} việc quá hạn nằm ở UAT`]);
    if (weakest) flags.push([shortCat(weakest), `${passUat(weakest)}% qua UAT, còn ${Math.round(gap(weakest))} việc`]);
    if (r.newTasksThisWeek.length) flags.push([`+${r.newTasksThisWeek.length} việc mới`, topNew ? `${topNew[1]} thuộc ${shortCat(topNew[0])}` : 'phạm vi tăng khi sprint chưa đóng']);
    if (r.risks.subOverdue) flags.push([`${r.risks.subOverdue} subtask`, 'đã quá hạn']);
    let fy = sectionY + lineHeight(9) + 0.1;
    flags.slice(0, 4).forEach(([head, body]) => {
      const h = c.text(head, { x: rx, y: fy, pt: 10.5, color: K.ink });
      const b = c.text(body, { x: rx, y: h.bottom + 0.01, pt: 8, color: K.mute, maxW: rw });
      fy = b.bottom + 0.1;
    });

    // bottom line: what finished this week
    const names = doneWeek.slice(0, 3).map((t) => cut(t.name.replace(/^\[[^\]]+\]\s*/, ''), 30));
    if (doneWeek.length) {
      c.text([
        { text: `Xong tuần này (${doneWeek.length}): `, color: K.brand },
        { text: names.join(' · ') + (doneWeek.length > names.length ? ` · +${doneWeek.length - names.length} việc khác` : ''), color: K.mute }
      ], { x: X0, y: 4.82, pt: 8, maxW: W });
    }
  }

  // =====================================================================
  // SLIDE 2 — nghiệp vụ trọng tâm: hiện tại · tiếp theo · blocker
  // =====================================================================
  {
    const items = r.focus ? r.focus.items : [];
    const has = (re) => items.filter((i) => i.blockers.some((b) => re.test(b))).length;
    const late = has(/^Quá hạn/); const moved = has(/^Dời lịch/); const waiting = has(/^Đang chờ/);
    const parts = [late && `${late} quá hạn`, moved && `${moved} dời lịch`, waiting && `${waiting} chờ bên liên quan`].filter(Boolean);
    const title = items.length
      ? `${items.length} nghiệp vụ cần theo dõi${parts.length ? `: ${parts.join(', ')}` : ''}`
      : 'Chưa có nghiệp vụ nào cần theo dõi đặc biệt';
    const { c, top } = frame(2, title);
    if (items.length) {
      const COL = { name: X0, now: X0 + 2.3, next: X0 + 4.85, block: X0 + 7.3 };
      const WID = { name: 2.05, now: 2.35, next: 2.3, block: X1 - (X0 + 7.3) };
      c.text('NGHIỆP VỤ', { x: COL.name, y: top, pt: 6.5, color: K.faint });
      c.text('HIỆN TẠI', { x: COL.now, y: top, pt: 6.5, color: K.faint });
      c.text('BƯỚC TIẾP THEO', { x: COL.next, y: top, pt: 6.5, color: K.faint });
      c.text('BLOCKER', { x: COL.block, y: top, pt: 6.5, color: K.faint });
      let y = top + lineHeight(6.5) + 0.06;
      c.hline(X0, X1, y, { color: K.g2 });
      y += 0.09;
      items.forEach((it) => {
        const label = it.count > 1 ? `${it.name} (${it.count} việc)` : it.name;
        const nm = c.text(cut(label, 56), { x: COL.name, y, pt: 9, color: K.ink, maxW: WID.name });
        const meta = [it.sprint, it.pic ? shortName(it.pic) : null, `hạn ${dm(it.due)}`].filter(Boolean).join(' · ');
        const mt = c.text(meta, { x: COL.name, y: nm.bottom + 0.02, pt: 6.5, color: K.faint, maxW: WID.name });
        const st = c.text(it.statusLabel, { x: COL.now, y, pt: 7, color: K.faint });
        const nw = c.text(cut(it.now || '—', 78), { x: COL.now, y: st.bottom + 0.01, pt: 8, color: K.ink, maxW: WID.now });
        const nx = c.text(cut(it.next || '—', 78), { x: COL.next, y, pt: 8, color: K.ink, maxW: WID.next });
        const bl = it.blockers.length
          ? c.text(it.blockers.map((b) => cut(b, 44)).join('\n'), { x: COL.block, y, pt: 8, color: K.brand, maxW: WID.block })
          : c.text('Không có', { x: COL.block, y, pt: 8, color: K.faint });
        const bottom = Math.max(mt.bottom, nw.bottom, nx.bottom, bl.bottom);
        y = bottom + 0.1;
        c.hline(X0, X1, y - 0.05, { color: K.line });
        y += 0.04;
      });
      const more = r.focus.more;
      c.text(`${more ? `+${more} nghiệp vụ khác cần theo dõi trong app. ` : ''}"Hiện tại" và "Bước tiếp theo" lấy từ ghi chú Status / Next action mới nhất của từng việc.`, { x: X0, y: Math.min(y + 0.02, 4.95), pt: 7, color: K.faint, maxW: W });
    }
  }

  return p.write({ outputType: 'nodebuffer' }).then((buffer) => ({ buffer, warnings }));
}

module.exports = { buildWeeklyDeck };
