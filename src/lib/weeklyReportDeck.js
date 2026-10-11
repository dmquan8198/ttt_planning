// Weekly boss report deck in the MoMo template look (white content background +
// logo from "Template Slide MoMo_28Aug2024.pptx"), set in Momo Trust Display.
// Built from collectWeeklyReport()'s output; every number and sentence is derived
// from it, nothing is hard-coded to one week.
//
//  1  Timeline        — phases and sprints on one axis, today marked, what each milestone is about
//  2  Từng mốc        — for each milestone: what is being done, per workstream
//  3… Chi tiết        — every open business item: where it stands, next step, blocker
//  last Kế hoạch sau  — the names of what is queued after the near-term sprints
//
// Design rules (layout side in deckText.js):
//  - one accent colour (MoMo magenta) + greys; magenta marks only what must stand out;
//  - text decides the box: widths and heights come from measured text, not fixed frames;
//  - one font weight, so hierarchy = size + colour;
//  - plain words (statuses are "Đang test", not "inTest UAT"), short phrases.
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { createCanvas, layout, lineHeight } = require('./deckText');
const { groupThemes, cut, FRIENDLY, SHORT } = require('./weeklyReportItems');

const K = {
  ink: '262626', mute: '6B6B6B', faint: 'A8A8A8', line: 'E4E4E4', white: 'FFFFFF',
  brand: 'A50064', brandMid: 'DE9CC2', g2: 'B4B4B4', g3: 'E6E6E6'
};
const BG = path.join(__dirname, '..', 'assets', 'momo-content-bg.png');
const X0 = 0.5; const X1 = 9.5; const W = X1 - X0; // content column
const BOTTOM = 5.08;

const MS_DAY = 86400000;
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY;
const addDays = (iso, n) => new Date((dayNum(iso) + n) * MS_DAY).toISOString().slice(0, 10);
const dm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const dmy = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const range = (a, b) => `${dm(a)}–${dm(b)}`;

const CATS = [
  { key: 'F', title: 'Foundation', match: (c) => c === 'TTT New - Foundation' },
  { key: 'C', title: 'Cross Service', match: (c) => c === 'TTT New - Cross Service' },
  { key: 'O', title: 'Nhóm khác', match: (c) => c !== 'TTT New - Foundation' && c !== 'TTT New - Cross Service' }
];
const isOpen = (i) => i.status !== '6.done';
// a measured layout back into styled runs with its line breaks kept
const asContent = (lay) => lay.lines.flatMap((l, i) => [...l.runs.map((r) => ({ text: r.text, color: r.color, pt: r.pt })), ...(i < lay.lines.length - 1 ? [{ text: '\n' }] : [])]);

function buildWeeklyDeck(r) {
  const warnings = [];
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9'; // 10 x 5.625 in — same canvas as the template
  p.title = `Báo cáo tuần ${dm(addDays(r.weekAgo, 1))} – ${dm(r.today)}`;
  p.company = 'MoMo';

  const today = r.today;
  const tl = r.timeline || { phases: [], sprints: [], items: [] };
  const sprints = tl.sprints.filter((s) => s.end >= addDays(today, -35));
  const byCode = (code) => tl.items.filter((i) => i.sprint === code);

  // ---------- the milestones every page talks about ----------
  const ended = sprints.filter((s) => s.end < today);
  const last = ended[ended.length - 1];
  const upcoming = sprints.filter((s) => s.end >= today);
  const groups = [];
  if (last) groups.push({ id: 'last', sprints: [last], tag: 'vừa xong' });
  if (upcoming[0]) groups.push({ id: 'next', sprints: [upcoming[0]], tag: upcoming[0].start <= today ? 'đang làm' : 'sắp làm' });
  if (upcoming[1]) groups.push({ id: 'then', sprints: [upcoming[1]], tag: 'làm tiếp theo' });
  if (upcoming.length > 2) groups.push({ id: 'later', sprints: upcoming.slice(2, 5), tag: 'sau đó' });
  groups.forEach((g) => {
    g.start = g.sprints[0].start; g.end = g.sprints[g.sprints.length - 1].end;
    g.label = g.sprints.length > 1 ? `${g.sprints[0].code}–${g.sprints[g.sprints.length - 1].code}` : g.sprints[0].code;
    g.items = g.sprints.flatMap((s) => byCode(s.code));
    // a phase whose target date falls inside this milestone is worth naming
    const ph = tl.phases.find((x) => x.target >= g.start && x.target <= g.end);
    g.phase = ph ? `mốc ${ph.code} ${dm(ph.target)}` : null;
  });

  // ---------- detail pages (computed first so every page knows the total) ----------
  const nearIds = new Set(['last', 'next', 'then']);
  const nearSprints = new Set(groups.filter((g) => nearIds.has(g.id)).flatMap((g) => g.sprints.map((s) => s.code)));
  const lateSprints = new Set(ended.map((s) => s.code)); // unfinished work from sprints that already ended
  const detailItems = tl.items.filter((i) => isOpen(i) && (nearSprints.has(i.sprint) || lateSprints.has(i.sprint)));
  const laterItems = groups.filter((g) => !nearIds.has(g.id)).flatMap((g) => g.items).filter(isOpen);

  const sprintOrder = (code) => tl.sprints.findIndex((s) => s.code === code);
  const detailRows = CATS.map((cat) => ({
    cat,
    items: detailItems.filter((i) => cat.match(i.category))
      .sort((a, b) => sprintOrder(a.sprint) - sprintOrder(b.sprint) || (a.status < b.status ? 1 : a.status > b.status ? -1 : 0) || a.name.localeCompare(b.name))
  })).filter((x) => x.items.length);

  const COL = { name: X0, now: X0 + 2.6, next: X0 + 4.7, block: X0 + 6.8 };
  const WID = { name: 2.45, now: 1.95, next: 1.95, block: X1 - (X0 + 6.8) };
  const itemRow = (it, withCat) => {
    const name = layout(cut(it.name, 90), { pt: 7.5, color: K.ink, maxW: WID.name });
    const metaText = [it.sprint, FRIENDLY[it.status], withCat ? it.category.replace('TTT New - ', '') : null].filter(Boolean).join(' · ');
    const meta = layout(metaText, { pt: 6, color: K.faint, maxW: WID.name });
    const now = layout(it.now ? cut(it.now, 80) : '—', { pt: 7.5, color: it.now ? K.ink : K.faint, maxW: WID.now });
    const next = layout(it.next ? cut(it.next, 80) : '—', { pt: 7.5, color: it.next ? K.ink : K.faint, maxW: WID.next });
    const blk = it.blockers.length
      ? layout(it.blockers.map((b) => cut(b, 46)).join('\n'), { pt: 7.5, color: K.brand, maxW: WID.block })
      : layout('Không có', { pt: 7.5, color: K.faint, maxW: WID.block });
    return { it, name, meta, now, next, blk, h: Math.max(name.h + 0.02 + meta.h, now.h, next.h, blk.h) + 0.09 };
  };
  const HEADER_TOP = 1.0; const ROWS_TOP = HEADER_TOP + 0.2;
  const detailPages = [];
  detailRows.forEach(({ cat, items }) => {
    const rows = items.map((it) => itemRow(it, cat.key === 'O'));
    let page = null; let y = ROWS_TOP;
    rows.forEach((row) => {
      if (!page || y + row.h > BOTTOM) { page = { cat, rows: [], total: items.length }; detailPages.push(page); y = ROWS_TOP; }
      page.rows.push(row); y += row.h;
    });
  });
  detailPages.forEach((pg) => { pg.part = detailPages.filter((x) => x.cat === pg.cat).indexOf(pg) + 1; pg.parts = detailPages.filter((x) => x.cat === pg.cat).length; });

  const totalSlides = 2 + detailPages.length + (laterItems.length ? 1 : 0);
  const firstDetailPage = 3;
  const laterPage = totalSlides; // the "kế hoạch sau" page is last when present

  // ---------- shared chrome ----------
  function frame(n, eyebrow, title, o = {}) {
    const s = p.addSlide();
    s.background = { path: BG };
    const c = createCanvas(p, s, warnings);
    c.text(eyebrow, { x: X0, y: 0.26, pt: 8, color: K.brand });
    const t = c.text(title, { x: X0, y: o.titleY || 0.52, pt: o.titlePt || 17, color: K.ink, maxW: W });
    c.text(`${n}/${totalSlides}`, { x: X1, y: 5.25, pt: 7, color: K.faint, align: 'r', footer: true });
    return { c, top: Math.max(o.minTop || 1.3, t.bottom + 0.2) };
  }

  const countStatus = (items) => items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
  const statusLine = (g) => {
    const n = g.items.length; if (!n) return 'chưa có nghiệp vụ';
    const cs = countStatus(g.items);
    if (g.id === 'last') {
      const finished = (cs['6.done'] || 0) + (cs['5.ready_for_staging'] || 0);
      return `${finished}/${n} đã xong${cs['4.in_test_uat'] ? ` · ${cs['4.in_test_uat']} đang test` : ''}`;
    }
    const parts = Object.entries(cs).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 3).map(([st, c]) => `${c} ${SHORT[st]}`);
    return `${n} việc: ${parts.join(' · ')}`;
  };

  // =====================================================================
  // SLIDE 1 — timeline
  // =====================================================================
  {
    const nextPhase = tl.phases.filter((ph) => ph.target >= today).sort((a, b) => (a.target < b.target ? -1 : 1))[0];
    const weeks = nextPhase ? Math.max(0, Math.ceil((dayNum(nextPhase.target) - dayNum(today)) / 7)) : null;
    const title = nextPhase ? `Mốc kế tiếp: ${nextPhase.name} (${dm(nextPhase.target)}), còn ${weeks} tuần` : 'Timeline các sprint';
    const { c, top } = frame(1, 'TIMELINE', title, { minTop: 1.2 });
    if (sprints.length) {
      const rangeStart = sprints[0].start;
      const rangeEnd = [sprints[sprints.length - 1].end, ...tl.phases.map((x) => x.target).filter((t) => t <= addDays(sprints[sprints.length - 1].end, 10))].sort().pop();
      const px = (iso) => X0 + ((dayNum(iso) - dayNum(rangeStart)) / (dayNum(addDays(rangeEnd, 1)) - dayNum(rangeStart))) * W;

      // phases: one band each, the one we are in is solid magenta
      const bandY = top + 0.28; const bandH = 0.3;
      c.text(`Hôm nay ${dm(today)}`, { x: px(today), y: top - 0.02, pt: 7, color: K.ink, align: 'c' });
      let from = rangeStart;
      tl.phases.forEach((ph) => {
        const a = from > rangeStart ? from : rangeStart; const b = ph.target < rangeEnd ? ph.target : rangeEnd;
        from = addDays(ph.target, 1);
        if (b <= a || px(b) - px(a) < 0.35) return;
        const current = a <= today && today <= b;
        c.rect({ x: px(a), y: bandY, w: px(b) - px(a) - 0.03, h: bandH, fill: current ? K.brand : K.g3 });
        const full = `${ph.code} · ${ph.name}`;
        const w = px(b) - px(a) - 0.12;
        const label = layout(full, { pt: 7.5, color: K.ink }).w <= w ? full : ph.code;
        c.text(label, { x: (px(a) + px(b) - 0.03) / 2, y: bandY + (bandH - lineHeight(7.5)) / 2, pt: 7.5, color: current ? K.white : K.ink, align: 'c' });
        c.text(`đến ${dm(ph.target)}`, { x: px(b) - 0.03, y: bandY + bandH + 0.03, pt: 6.5, color: current ? K.brand : K.faint, align: 'r' });
      });
      // sprints: ended = grey, the next one outlined in magenta, the rest outlined in grey
      const spY = bandY + bandH + 0.3; const spH = 0.26;
      sprints.forEach((s) => {
        const isEnded = s.end < today;
        const isNext = upcoming[0] && s.code === upcoming[0].code;
        const x = px(s.start); const w = px(addDays(s.end, 1)) - x - 0.03;
        c.rect({ x, y: spY, w, h: spH, fill: isEnded ? K.g3 : null, line: isEnded ? null : (isNext ? K.brand : K.g2), lw: isNext ? 1.25 : 0.75 });
        c.text(s.code, { x: x + w / 2, y: spY + (spH - lineHeight(8)) / 2, pt: 8, color: isEnded ? K.mute : (isNext ? K.brand : K.mute), align: 'c' });
        c.text(range(s.start, s.end), { x: x + w / 2, y: spY + spH + 0.03, pt: 5.5, color: K.faint, align: 'c' });
      });
      c.vline(px(today), bandY - 0.08, spY + spH + 0.22, { color: K.ink, dash: 'dash', lw: 1 });

      // what each milestone is about
      const colTop = spY + spH + 0.5;
      const cw = W / groups.length;
      groups.forEach((g, i) => {
        const x = X0 + i * cw; const maxW = cw - 0.22;
        const h = c.text(g.label, { x, y: colTop, pt: 13, color: K.ink });
        const tag = c.text([{ text: g.tag, color: g.id === 'next' ? K.brand : K.mute }, { text: `  ${range(g.start, g.end)}`, color: K.faint }], { x, y: h.bottom + 0.01, pt: 8 });
        let y = tag.bottom;
        if (g.phase) { const ph = c.text(g.phase, { x, y, pt: 8, color: K.brand }); y = ph.bottom; }
        const sl = c.text(statusLine(g), { x, y: y + 0.04, pt: 8, color: K.mute, maxW });
        y = sl.bottom + 0.08;
        const pool = g.id === 'last' ? g.items : g.items.filter(isOpen);
        const themes = groupThemes(pool.length ? pool : g.items);
        const shown = []; let used = y;
        themes.slice(0, 6).forEach((th) => {
          const lay = layout(`${cut(th.label, 40)}${th.count > 1 ? ` (${th.count})` : ''}`, { pt: 8.5, color: K.ink, maxW: maxW - 0.12 });
          if (used + lay.h + 0.06 + lineHeight(7) > BOTTOM && shown.length >= 2) return;
          if (shown.length >= 5) return;
          shown.push(th); used += lay.h + 0.06;
        });
        shown.forEach((th) => {
          c.text('•', { x, y, pt: 8.5, color: K.brand });
          const t = c.text(`${cut(th.label, 40)}${th.count > 1 ? ` (${th.count})` : ''}`, { x: x + 0.12, y, pt: 8.5, color: K.ink, maxW: maxW - 0.12 });
          y = t.bottom + 0.06;
        });
        const hiddenCount = themes.slice(shown.length).reduce((a, th) => a + th.count, 0);
        if (hiddenCount > 0) c.text(`+${hiddenCount} việc nữa, xem trang 2`, { x: x + 0.12, y, pt: 7, color: K.faint });
      });
    } else {
      c.text('Chưa có sprint nào gần đây. Thêm sprint trong app để hiển thị timeline.', { x: X0, y: top, pt: 10, color: K.mute });
    }
  }

  // =====================================================================
  // SLIDE 2 — what is being done in each milestone, per workstream
  // =====================================================================
  {
    const { c, top } = frame(2, 'TỪNG MỐC', 'Đang làm gì ở mỗi mốc', { minTop: 1.1 });
    if (groups.length) {
      const LW = 0.95; const CW = (W - LW) / CATS.length;
      CATS.forEach((cat, i) => c.text(cat.title.toUpperCase(), { x: X0 + LW + i * CW, y: top, pt: 6.5, color: K.faint }));
      let y = top + lineHeight(6.5) + 0.06;
      c.hline(X0, X1, y, { color: K.g2 });
      y += 0.08;
      // fit: drop themes per cell until every row fits above the bottom
      const cellThemes = (g, cat) => groupThemes(g.items.filter((it) => cat.match(it.category)));
      const grid = groups.map((g) => CATS.map((cat) => cellThemes(g, cat)));
      let perCell = 6;
      const heightOf = (themes, max) => {
        const shown = themes.slice(0, max);
        const lines = shown.reduce((a, th) => a + layout(`${cut(th.label, 30)}${th.count > 1 ? ` (${th.count})` : ''} — ${SHORT[th.status]}`, { pt: 7.5, color: K.ink, maxW: CW - 0.3 }).lines.length, 0);
        return lines * lineHeight(7.5) + shown.length * 0.05 + (themes.length > max ? lineHeight(6.5) + 0.04 : 0);
      };
      const rowHeights = (max) => grid.map((row) => Math.max(0.45, ...row.map((t) => heightOf(t, max))) + 0.14);
      while (perCell > 2 && y + rowHeights(perCell).reduce((a, b) => a + b, 0) > BOTTOM) perCell -= 1;
      const rh = rowHeights(perCell);
      groups.forEach((g, gi) => {
        const lab = c.text(g.label, { x: X0, y, pt: 11, color: K.ink });
        const t1 = c.text(g.tag, { x: X0, y: lab.bottom + 0.01, pt: 6.5, color: g.id === 'next' ? K.brand : K.mute });
        c.text(range(g.start, g.end), { x: X0, y: t1.bottom, pt: 6, color: K.faint });
        CATS.forEach((cat, ci) => {
          const themes = grid[gi][ci]; let cy = y; const x = X0 + LW + ci * CW;
          if (!themes.length) { c.text('—', { x, y: cy, pt: 7, color: K.faint }); return; }
          themes.slice(0, perCell).forEach((th) => {
            c.text('•', { x, y: cy, pt: 7.5, color: K.brand });
            const t = c.text([{ text: `${cut(th.label, 30)}${th.count > 1 ? ` (${th.count})` : ''}`, color: K.ink }, { text: ` — ${SHORT[th.status]}`, color: K.faint }], { x: x + 0.11, y: cy, pt: 7.5, maxW: CW - 0.3 });
            cy = t.bottom + 0.05;
          });
          if (themes.length > perCell) {
            const rest = themes.slice(perCell).reduce((a, th) => a + th.count, 0);
            c.text(`+${rest} việc nữa${!nearIds.has(g.id) ? ` (xem trang ${laterPage})` : ` (xem trang ${firstDetailPage}+)`}`, { x: x + 0.11, y: cy, pt: 6.5, color: K.faint });
          }
        });
        y += rh[gi];
        if (gi < groups.length - 1) c.hline(X0, X1, y - 0.07, { color: K.line });
      });
    }
  }

  // =====================================================================
  // DETAIL PAGES — every open item: now / next / blocker
  // =====================================================================
  detailPages.forEach((pg, idx) => {
    const n = firstDetailPage + idx;
    const title = `${pg.cat.title}: ${pg.total} nghiệp vụ đang làm${pg.parts > 1 ? ` (${pg.part}/${pg.parts})` : ''}`;
    const { c } = frame(n, 'CHI TIẾT NGHIỆP VỤ', title, { titlePt: 15, minTop: 1.0 });
    c.text('NGHIỆP VỤ', { x: COL.name, y: HEADER_TOP, pt: 6.5, color: K.faint });
    c.text('HIỆN TẠI', { x: COL.now, y: HEADER_TOP, pt: 6.5, color: K.faint });
    c.text('BƯỚC TIẾP THEO', { x: COL.next, y: HEADER_TOP, pt: 6.5, color: K.faint });
    c.text('BLOCKER', { x: COL.block, y: HEADER_TOP, pt: 6.5, color: K.faint });
    c.hline(X0, X1, HEADER_TOP + lineHeight(6.5) + 0.04, { color: K.g2 });
    let y = ROWS_TOP + 0.02;
    // the cells were measured (wrapped) when the pages were planned; draw them with exactly those line breaks
    const put = (lay, x, yy) => c.text(asContent(lay), { x, y: yy, pt: 7.5, color: K.ink });
    pg.rows.forEach((row) => {
      const nm = put(row.name, COL.name, y);
      c.text(asContent(row.meta), { x: COL.name, y: nm.bottom + 0.02, pt: 6, color: K.faint });
      put(row.now, COL.now, y); put(row.next, COL.next, y); put(row.blk, COL.block, y);
      y += row.h;
      c.hline(X0, X1, y - 0.045, { color: K.line });
    });
  });

  // =====================================================================
  // LAST — what is queued after the near-term sprints (names only, nothing is hidden)
  // =====================================================================
  if (laterItems.length) {
    const { c, top } = frame(laterPage, 'KẾ HOẠCH SAU', `Xếp sau ${groups.filter((g) => nearIds.has(g.id)).pop() ? groups.filter((g) => nearIds.has(g.id)).pop().label : ''}: ${laterItems.length} nghiệp vụ chưa bắt đầu`, { titlePt: 15, minTop: 1.0 });
    let y = top - 0.05;
    CATS.forEach((cat) => {
      const its = laterItems.filter((i) => cat.match(i.category));
      if (!its.length) return;
      const h = c.text(`${cat.title} (${its.length})`, { x: X0, y, pt: 11, color: K.ink });
      y = h.bottom + 0.03;
      const sprintCodes = [...new Set(its.map((i) => i.sprint))].sort((a, b) => sprintOrder(a) - sprintOrder(b));
      sprintCodes.forEach((code) => {
        c.text(code, { x: X0, y, pt: 8.5, color: K.brand });
        const names = its.filter((i) => i.sprint === code).map((i) => cut(i.name, 70)).join('  ·  ');
        const t = c.text(names, { x: X0 + 0.55, y, pt: 8.5, color: K.ink, maxW: W - 0.55 });
        y = t.bottom + 0.07;
      });
      y += 0.14;
    });
  }

  return p.write({ outputType: 'nodebuffer' }).then((buffer) => ({ buffer, warnings }));
}

module.exports = { buildWeeklyDeck };
