// Weekly boss report deck in the MoMo template look (white content background +
// logo from "Template Slide MoMo_28Aug2024.pptx"), set in Momo Trust Display.
// Built from collectWeeklyReport()'s output; every number and sentence is derived
// from it, nothing is hard-coded to one week.
//
//  1  Timeline        — month axis, phase milestones, "today"; swimlanes (Foundation / Cross Service / …)
//                       with a box per piece of work, placed where it happens in time
//  2  Từng mốc        — for each milestone: what is being done per workstream (a table)
//  3… Chi tiết        — every open business item: where it stands + next step (tables)
//  last Kế hoạch sau  — names of what is queued after the near-term sprints (a table)
//
// Design rules (layout side in deckText.js):
//  - one accent colour (MoMo magenta) + greys; magenta marks only what must stand out;
//  - text decides the box: widths and heights come from measured text, not fixed frames;
//  - everything the author may want to edit later is a real table or a text-bearing shape
//    (no loose text boxes dropped onto boxes), so Slides/PowerPoint keeps them aligned;
//  - one font weight, so hierarchy = size + colour;
//  - plain words (statuses are "Đang test", not "inTest UAT"), short phrases.
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { createCanvas, layout, lineHeight, FONT_FACE, LINE_MULT } = require('./deckText');
const { groupThemes, cut, FRIENDLY, SHORT } = require('./weeklyReportItems');

const K = {
  ink: '262626', mute: '6B6B6B', faint: 'A8A8A8', line: 'E4E4E4', white: 'FFFFFF',
  brand: 'A50064', tint: 'F6E3EE', brandMid: 'DE9CC2', g2: 'B4B4B4', g3: 'E6E6E6'
};
const BG = path.join(__dirname, '..', 'assets', 'momo-content-bg.png');
const X0 = 0.5; const X1 = 9.5; const W = X1 - X0; // content column
const BOTTOM = 5.08;

const MS_DAY = 86400000;
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY;
const addDays = (iso, n) => new Date((dayNum(iso) + n) * MS_DAY).toISOString().slice(0, 10);
const dm = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const range = (a, b) => `${dm(a)}–${dm(b)}`;
const MONTHS = ['Thg 1', 'Thg 2', 'Thg 3', 'Thg 4', 'Thg 5', 'Thg 6', 'Thg 7', 'Thg 8', 'Thg 9', 'Thg 10', 'Thg 11', 'Thg 12'];

const CATS = [
  { key: 'F', title: 'Foundation', match: (c) => c === 'TTT New - Foundation' },
  { key: 'C', title: 'Cross Service', match: (c) => c === 'TTT New - Cross Service' },
  { key: 'O', title: 'Nhóm khác', match: (c) => c !== 'TTT New - Foundation' && c !== 'TTT New - Cross Service' }
];
const isOpen = (i) => i.status !== '6.done';

// ---------- native tables ----------
// Cells are plain text in a real table, so rows grow with their content and the author can
// retype, resize or move text without anything detaching. Widths we plan with are the column
// width minus the cell margins, a little narrower than the real thing to stay on the safe side.
const CELL_MARGIN = [0.025, 0.06, 0.025, 0.06]; // top, right, bottom, left (inches)
const rowBorder = (color) => [{ type: 'none' }, { type: 'none' }, color ? { type: 'solid', pt: 0.5, color } : { type: 'none' }, { type: 'none' }];
function cell(content, o = {}) {
  const runs = Array.isArray(content) ? content : [{ text: String(content), options: {} }];
  return {
    text: runs.map((r, i) => ({ text: r.text, options: { color: o.color || K.ink, fontSize: o.pt || 7, fontFace: FONT_FACE, breakLine: !!r.breakLine && i < runs.length - 1, ...r.options } })),
    options: {
      fontFace: FONT_FACE, fontSize: o.pt || 7, color: o.color || K.ink, valign: o.valign || 'top', align: o.align || 'left',
      margin: CELL_MARGIN, border: rowBorder(o.border), fill: o.fill ? { color: o.fill } : undefined, colspan: o.colspan, lineSpacingMultiple: LINE_MULT
    }
  };
}
// planned height of a cell holding `text` at `pt` in a column `colW` wide
function cellHeight(text, pt, colW) {
  const lay = layout(text, { pt, color: K.ink, maxW: (colW - CELL_MARGIN[1] - CELL_MARGIN[3]) * 0.96 });
  return lay.h + CELL_MARGIN[0] + CELL_MARGIN[2] + 0.015;
}

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
  const sprintOrder = (code) => tl.sprints.findIndex((s) => s.code === code);

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
  });

  // ---------- detail pages (planned first so every page knows the total) ----------
  const nearIds = new Set(['last', 'next', 'then']);
  const nearSprints = new Set(groups.filter((g) => nearIds.has(g.id)).flatMap((g) => g.sprints.map((s) => s.code)));
  const lateSprints = new Set(ended.map((s) => s.code)); // unfinished work from sprints that already ended
  const detailItems = tl.items.filter((i) => isOpen(i) && (nearSprints.has(i.sprint) || lateSprints.has(i.sprint)));
  const laterItems = groups.filter((g) => !nearIds.has(g.id)).flatMap((g) => g.items).filter(isOpen);

  const DCOL = [3.35, 1.25, 2.2, 2.2]; // nghiệp vụ | sprint · trạng thái | hiện tại | bước tiếp theo
  const D_PT = 6.5;
  const TABLE_TOP = 1.05; const HEAD_H = 0.2;
  const detailRows = CATS.map((cat) => ({
    cat,
    items: detailItems.filter((i) => cat.match(i.category))
      .sort((a, b) => sprintOrder(a.sprint) - sprintOrder(b.sprint) || (a.status < b.status ? 1 : a.status > b.status ? -1 : 0) || a.name.localeCompare(b.name))
  })).filter((x) => x.items.length);
  const detailPages = [];
  detailRows.forEach(({ cat, items }) => {
    const rows = items.map((it) => {
      const name = it.name; const state = `${it.sprint} · ${FRIENDLY[it.status]}`;
      const now = it.now ? cut(it.now, 90) : '—'; const next = it.next ? cut(it.next, 90) : '—';
      const h = Math.max(cellHeight(name, D_PT, DCOL[0]), cellHeight(state, D_PT, DCOL[1]), cellHeight(now, D_PT, DCOL[2]), cellHeight(next, D_PT, DCOL[3]));
      return { it, name, state, now, next, h };
    });
    let page = null; let y = TABLE_TOP + HEAD_H;
    rows.forEach((row) => {
      if (!page || y + row.h > BOTTOM) { page = { cat, rows: [], total: items.length }; detailPages.push(page); y = TABLE_TOP + HEAD_H; }
      page.rows.push(row); y += row.h;
    });
  });
  detailPages.forEach((pg) => { const same = detailPages.filter((x) => x.cat === pg.cat); pg.part = same.indexOf(pg) + 1; pg.parts = same.length; });

  const totalSlides = 2 + detailPages.length + (laterItems.length ? 1 : 0);
  const firstDetailPage = 3;
  const laterPage = totalSlides;

  // ---------- shared chrome ----------
  function frame(n, eyebrow, title, o = {}) {
    const s = p.addSlide();
    s.background = { path: BG };
    const c = createCanvas(p, s, warnings);
    c.text(eyebrow, { x: X0, y: 0.26, pt: 8, color: K.brand });
    const t = c.text(title, { x: X0, y: 0.52, pt: o.titlePt || 17, color: K.ink, maxW: W });
    c.text(`${n}/${totalSlides}`, { x: X1, y: 5.25, pt: 7, color: K.faint, align: 'r', footer: true });
    return { c, s, top: Math.max(o.minTop || 1.3, t.bottom + 0.2) };
  }

  // =====================================================================
  // SLIDE 1 — timeline: month axis, milestones, swimlanes with boxes in time
  // =====================================================================
  {
    const nextPhase = tl.phases.filter((ph) => ph.target >= today).sort((a, b) => (a.target < b.target ? -1 : 1))[0];
    const weeks = nextPhase ? Math.max(0, Math.ceil((dayNum(nextPhase.target) - dayNum(today)) / 7)) : null;
    const title = nextPhase ? `Mốc kế tiếp: ${nextPhase.name} (${dm(nextPhase.target)}), còn ${weeks} tuần` : 'Timeline các sprint';
    const { c, top } = frame(1, 'TIMELINE', title, { minTop: 1.0 });
    if (sprints.length) {
      const LW = 0.95; // lane label column
      const AX0 = X0 + LW; const AW = X1 - AX0;
      const rangeStart = addDays(last ? last.start : sprints[0].start, -14);
      const lastPhase = tl.phases.map((x) => x.target).filter((t) => t <= addDays(sprints[sprints.length - 1].end, 10)).sort().pop();
      const rangeEnd = [sprints[sprints.length - 1].end, lastPhase || '0000-00-00'].sort().pop();
      const spanDays = dayNum(addDays(rangeEnd, 1)) - dayNum(rangeStart);
      const px = (iso) => AX0 + ((Math.min(Math.max(dayNum(iso), dayNum(rangeStart)), dayNum(addDays(rangeEnd, 1))) - dayNum(rangeStart)) / spanDays) * AW;

      // axis: milestone labels above, the line with diamonds and month ticks, month names below
      const labelY = top - 0.02; const axisY = labelY + 0.36;
      tl.phases.filter((ph) => ph.target > rangeStart && ph.target <= rangeEnd).forEach((ph) => {
        const x = px(ph.target);
        const half = Math.max(layout(ph.name, { pt: 6.5, color: K.brand }).w, 0.4) / 2 + 0.03;
        const lx2 = Math.min(Math.max(x, X0 + half), X1 - half);
        const d = c.text(dm(ph.target), { x: lx2, y: labelY, pt: 7.5, color: K.brand, align: 'c' });
        c.text(ph.name, { x: lx2, y: d.bottom, pt: 6.5, color: K.brand, align: 'c' });
        c.rect({ x: x - 0.06, y: axisY - 0.06, w: 0.12, h: 0.12, fill: K.brand, shape: 'diamond' });
      });
      c.hline(AX0, X1, axisY, { color: K.ink, lw: 1 });
      // month ticks and names
      const first = new Date(`${rangeStart}T00:00:00Z`); let mY = first.getUTCFullYear(); let mM = first.getUTCMonth();
      for (let guard = 0; guard < 8; guard += 1) {
        const mStart = new Date(Date.UTC(mY, mM, 1)).toISOString().slice(0, 10);
        const nxt = new Date(Date.UTC(mY, mM + 1, 1)).toISOString().slice(0, 10);
        if (mStart > rangeEnd) break;
        const a = mStart < rangeStart ? rangeStart : mStart; const b = nxt > addDays(rangeEnd, 1) ? addDays(rangeEnd, 1) : nxt;
        if (mStart >= rangeStart) c.vline(px(mStart), axisY - 0.04, axisY + 0.04, { color: K.ink, lw: 1 });
        if (px(b) - px(a) > 0.45) c.text(MONTHS[mM], { x: (px(a) + px(b)) / 2, y: axisY + 0.07, pt: 8, color: K.ink, align: 'c' });
        mM += 1; if (mM > 11) { mM = 0; mY += 1; }
      }
      const lanesTop = axisY + 0.07 + lineHeight(8) + 0.12;

      // lanes: under each sprint, a box per piece of work (a theme) — placed where it happens in time
      const cols = sprints.filter((sp) => sp.end >= rangeStart);
      const lanes = CATS.map((cat) => ({ cat, items: tl.items.filter((i) => cat.match(i.category)) })).filter((l) => l.items.some((i) => cols.some((sp) => sp.code === i.sprint)));
      const PT = 6.5; const PAD = 0.035; const GAP = 0.03;
      const build = (items, perCol) => cols.map((sp) => {
        const themes = groupThemes(items.filter((i) => i.sprint === sp.code));
        const x = px(sp.start); const w = px(addDays(sp.end, 1)) - x - 0.05;
        let h = 0;
        const boxes = themes.slice(0, perCol).map((th) => {
          const label = `${cut(th.label, 34)}${th.count > 1 ? ` (${th.count})` : ''}`;
          const lay = layout(label, { pt: PT, color: K.ink, maxW: (w - 2 * PAD - 0.02) * 0.95 });
          const open = th.tasks.filter(isOpen);
          const state = !open.length ? 'done' : (open.some((t) => t.status !== '0.backlog') ? 'doing' : 'todo');
          const bh = lay.h + 2 * PAD; h += bh + GAP;
          return { x, w, h: bh, label, state };
        });
        const rest = themes.slice(perCol).reduce((acc, th) => acc + th.count, 0);
        if (rest) h += lineHeight(6) + GAP;
        return { x, w, boxes, rest, h };
      });
      // sprint codes under the months, so a box can be traced to "Từng mốc" and the detail pages
      cols.forEach((sp) => c.text(sp.code, { x: (px(sp.start) + px(addDays(sp.end, 1))) / 2, y: axisY + 0.07 + lineHeight(8) + 0.0, pt: 6, color: K.faint, align: 'c' }));
      const lanesTop2 = lanesTop + lineHeight(6) + 0.02;
      let perCol = 3; let built;
      for (;;) {
        built = lanes.map((l) => build(l.items, perCol));
        const total = built.reduce((acc, colsOfLane) => acc + Math.max(0.3, ...colsOfLane.map((cl) => cl.h)) + 0.1, 0);
        if (lanesTop2 + total <= BOTTOM - 0.08 || perCol <= 1) break;
        perCol -= 1;
      }
      // faint column rules so the sprints read as columns
      let y = lanesTop2;
      lanes.forEach((l, li) => {
        c.hline(X0, X1, y - 0.06, { color: K.g2 });
        c.text(l.cat.title, { x: X0, y, pt: 9, color: K.ink });
        built[li].forEach((cl) => {
          let by = y;
          cl.boxes.forEach((b) => {
            c.shapeText(b.label, { x: b.x, y: by, w: b.w, h: b.h, pt: PT, color: K.ink, fill: b.state === 'done' ? K.g3 : (b.state === 'doing' ? K.tint : K.white), line: b.state === 'todo' ? K.g2 : null, dash: 'dash', round: 0.05, pad: PAD });
            by += b.h + GAP;
          });
          if (cl.rest) c.text(`+${cl.rest} việc nữa`, { x: cl.x + 0.02, y: by, pt: 6, color: K.faint });
        });
        y += Math.max(0.3, ...built[li].map((cl) => cl.h)) + 0.1;
      });
      // today + legend
      c.vline(px(today), axisY - 0.12, y - 0.1, { color: K.ink, dash: 'dash', lw: 1 });
      c.text(`Hôm nay ${dm(today)}`, { x: px(today), y: axisY - 0.28, pt: 7, color: K.ink, align: 'c' });
      let lx = 0.8; // clear of the logo in the corner
      [[K.g3, null, 'đã xong'], [K.tint, null, 'đang làm'], [K.white, K.g2, 'chưa bắt đầu']].forEach(([fill, line, label]) => {
        c.rect({ x: lx, y: 5.27, w: 0.14, h: 0.085, fill, line, dash: 'dash', lw: 0.75 });
        const t = c.text(label, { x: lx + 0.19, y: 5.24, pt: 6.5, color: K.mute, footer: true });
        lx = t.right + 0.2;
      });
    } else {
      c.text('Chưa có sprint nào gần đây. Thêm sprint trong app để hiển thị timeline.', { x: X0, y: top, pt: 10, color: K.mute });
    }
  }

  // =====================================================================
  // SLIDE 2 — what is being done in each milestone, per workstream (a table)
  // =====================================================================
  {
    const { s, top } = frame(2, 'TỪNG MỐC', 'Đang làm gì ở mỗi mốc', { minTop: 1.1 });
    if (groups.length) {
      const COLW = [0.95, (W - 0.95) / 3, (W - 0.95) / 3, (W - 0.95) / 3];
      const themesOf = (g, cat) => groupThemes(g.items.filter((it) => cat.match(it.category)));
      const grid = groups.map((g) => CATS.map((cat) => themesOf(g, cat)));
      const line = (th) => `${cut(th.label, 40)}${th.count > 1 ? ` (${th.count})` : ''} — ${SHORT[th.status]}`;
      const heightOf = (themes, max, ci) => {
        const shown = themes.slice(0, max);
        const h = shown.reduce((a, th) => a + layout(`• ${line(th)}`, { pt: 7, color: K.ink, maxW: (COLW[ci + 1] - 0.12) * 0.96 }).h, 0);
        return h + (themes.length > max ? lineHeight(6.5) : 0) + CELL_MARGIN[0] + CELL_MARGIN[2] + 0.06;
      };
      let perCell = 8;
      const rowH = (max) => grid.map((row) => Math.max(0.5, ...row.map((t, ci) => heightOf(t, max, ci))));
      while (perCell > 2 && top + 0.22 + rowH(perCell).reduce((a, b) => a + b, 0) > BOTTOM) perCell -= 1;
      const heights = rowH(perCell);
      const head = [cell('', { pt: 6.5, border: K.g2 }), ...CATS.map((cat) => cell(cat.title.toUpperCase(), { pt: 6.5, color: K.faint, border: K.g2 }))];
      const body = groups.map((g, gi) => [
        cell([
          { text: g.label, options: { fontSize: 11, color: K.ink }, breakLine: true },
          { text: g.tag, options: { fontSize: 6.5, color: g.id === 'next' ? K.brand : K.mute }, breakLine: true },
          { text: range(g.start, g.end), options: { fontSize: 6, color: K.faint } }
        ], { border: gi < groups.length - 1 ? K.line : null }),
        ...CATS.map((cat, ci) => {
          const themes = grid[gi][ci];
          if (!themes.length) return cell('—', { pt: 7, color: K.faint, border: gi < groups.length - 1 ? K.line : null });
          const runs = themes.slice(0, perCell).map((th, i, arr) => ({
            text: `• ${cut(th.label, 40)}${th.count > 1 ? ` (${th.count})` : ''}`, options: { fontSize: 7, color: K.ink }, breakLine: true, _status: SHORT[th.status], _last: i === arr.length - 1
          }));
          const out = [];
          runs.forEach((rn) => {
            out.push({ text: rn.text, options: rn.options });
            out.push({ text: ` — ${rn._status}`, options: { fontSize: 7, color: K.faint }, breakLine: true });
          });
          if (themes.length > perCell) {
            const rest = themes.slice(perCell).reduce((a, th) => a + th.count, 0);
            out.push({ text: `+${rest} việc nữa (xem trang ${nearIds.has(groups[gi].id) ? `${firstDetailPage}+` : laterPage})`, options: { fontSize: 6.5, color: K.faint } });
          } else out[out.length - 1].breakLine = false;
          return cell(out, { border: gi < groups.length - 1 ? K.line : null });
        })
      ]);
      s.addTable([head, ...body], { x: X0, y: top, w: W, colW: COLW, rowH: [0.2, ...heights], fontFace: FONT_FACE, border: { type: 'none' } });
    }
  }

  // =====================================================================
  // DETAIL PAGES — every open item: where it stands + next step (tables)
  // =====================================================================
  detailPages.forEach((pg, idx) => {
    const n = firstDetailPage + idx;
    const title = `${pg.cat.title}: ${pg.total} nghiệp vụ đang làm${pg.parts > 1 ? ` (${pg.part}/${pg.parts})` : ''}`;
    const { s } = frame(n, 'CHI TIẾT NGHIỆP VỤ', title, { titlePt: 15, minTop: 1.0 });
    const head = ['NGHIỆP VỤ', 'SPRINT · TRẠNG THÁI', 'HIỆN TẠI', 'BƯỚC TIẾP THEO'].map((t) => cell(t, { pt: 6, color: K.faint, border: K.g2 }));
    const body = pg.rows.map((row) => [
      cell(row.name, { pt: D_PT, border: K.line }), cell(row.state, { pt: D_PT, color: K.mute, border: K.line }),
      cell(row.now, { pt: D_PT, color: row.it.now ? K.ink : K.faint, border: K.line }), cell(row.next, { pt: D_PT, border: K.line })
    ]);
    s.addTable([head, ...body], { x: X0, y: TABLE_TOP, w: W, colW: DCOL, rowH: [HEAD_H, ...pg.rows.map((rw) => rw.h)], fontFace: FONT_FACE, border: { type: 'none' } });
  });

  // =====================================================================
  // LAST — what is queued after the near-term sprints (names only; nothing is hidden)
  // =====================================================================
  if (laterItems.length) {
    const lastNear = groups.filter((g) => nearIds.has(g.id)).pop();
    const { s } = frame(laterPage, 'KẾ HOẠCH SAU', `Xếp sau ${lastNear ? lastNear.label : ''}: ${laterItems.length} nghiệp vụ chưa bắt đầu`, { titlePt: 15, minTop: 1.0 });
    const rows = [];
    CATS.forEach((cat) => {
      const its = laterItems.filter((i) => cat.match(i.category));
      if (!its.length) return;
      rows.push([cell(`${cat.title} (${its.length})`, { pt: 9, colspan: 2, border: K.g2 })]);
      [...new Set(its.map((i) => i.sprint))].sort((a, b) => sprintOrder(a) - sprintOrder(b)).forEach((code) => {
        rows.push([cell(code, { pt: 8, color: K.brand, border: K.line }), cell(its.filter((i) => i.sprint === code).map((i) => cut(i.name, 80)).join('  ·  '), { pt: 8, border: K.line })]);
      });
    });
    s.addTable(rows, { x: X0, y: 1.1, w: W, colW: [0.6, W - 0.6], fontFace: FONT_FACE, border: { type: 'none' } });
  }

  return p.write({ outputType: 'nodebuffer' }).then((buffer) => ({ buffer, warnings }));
}

module.exports = { buildWeeklyDeck };
