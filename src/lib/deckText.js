// Text-first layout kit for the weekly report deck.
//
// Instead of drawing a fixed box and typing text into it, every container here
// is derived from the text: we measure each string with the REAL font
// (Momo Trust Display, advance widths from the .ttf), wrap it ourselves, and then
// size boxes, pills and rows to what the text needs. The pptx gets hard line
// breaks and wrap="none", so every renderer (PowerPoint, Google Slides) breaks
// lines exactly where we measured.
//
// Momo Trust Display ships a single Regular weight: emphasis comes from size and
// colour, never from bold.
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONT_FACE = 'Momo Trust Display';
const FONT_FILE = path.join(__dirname, '..', 'assets', 'fonts', 'MomoTrustDisplay-Regular.ttf');

// The font's ascent + descent is 1.3 em, so "single" spacing is airy for a deck.
// We write 0.9 to the pptx (a:spcPct) and plan with the matching 1.17 em line.
const LINE_MULT = 0.9;
const LINE_EM = 1.3 * LINE_MULT;
// renderers kern/hint slightly differently from a plain sum of advances
const SAFETY = 1.03;

let font;
function getFont() {
  if (!font) {
    const b = fs.readFileSync(FONT_FILE);
    font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return font;
}

// width in inches of `str` at `pt` points (no shaping/kerning: charToGlyph only)
function advance(str, pt) {
  const f = getFont();
  let units = 0;
  for (const ch of str) units += f.charToGlyph(ch).advanceWidth || 0;
  return (units / f.unitsPerEm) * (pt / 72) * SAFETY;
}
const lineHeight = (pt) => (pt * LINE_EM) / 72;

// content: a string or [{ text, color?, pt? }] — normalised to runs with defaults filled in
function toRuns(content, def) {
  const list = Array.isArray(content) ? content : [{ text: String(content) }];
  return list.map((r) => ({ text: String(r.text), color: r.color || def.color, pt: r.pt || def.pt }));
}

// greedy word wrap of styled runs into lines of at most maxW inches ('\n' forces a break)
function layout(content, def) {
  const runs = toRuns(content, def);
  const maxW = def.maxW === undefined ? Infinity : def.maxW;
  const tokens = [];
  runs.forEach((r) => {
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) tokens.push({ br: true });
      part.split(/(\s+)/).filter((t) => t !== '').forEach((t) => {
        tokens.push({ text: t, color: r.color, pt: r.pt, space: /^\s+$/.test(t), w: advance(t, r.pt) });
      });
    });
  });
  const lines = [[]];
  let width = 0;
  const widthOf = (line) => line.reduce((a, t) => a + t.w, 0);
  const trim = (line) => { while (line.length && line[line.length - 1].space) line.pop(); };
  tokens.forEach((t) => {
    const line = lines[lines.length - 1];
    if (t.br) { trim(line); lines.push([]); return; }
    if (t.space && line.length === 0) return; // no leading spaces
    if (!t.space && line.length > 0 && widthOf(line) + t.w > maxW) {
      trim(line);
      lines.push([t]);
      return;
    }
    line.push(t);
  });
  lines.forEach(trim);
  const out = lines.map((line) => {
    const merged = [];
    line.forEach((t) => {
      const last = merged[merged.length - 1];
      if (last && last.color === t.color && last.pt === t.pt) { last.text += t.text; last.w += t.w; } else merged.push({ ...t });
    });
    const w = merged.reduce((a, t) => a + t.w, 0);
    const pt = merged.reduce((a, t) => Math.max(a, t.pt), def.pt);
    return { runs: merged, w, h: lineHeight(pt) };
  });
  width = out.reduce((a, l) => Math.max(a, l.w), 0);
  return { lines: out, w: width, h: out.reduce((a, l) => a + l.h, 0) };
}

// Canvas: drawing helpers bound to one slide. Every text call returns its box
// ({x, y, w, h, right, bottom}) so the next element can be placed from it.
function createCanvas(pres, slide, warnings, limits = { bottom: 5.12, right: 9.6 }) {
  const C = {
    pres, slide,
    measure: (content, o) => layout(content, o),
    text(content, o) {
      const lay = layout(content, o);
      const w = lay.w + 0.04;
      const x = o.align === 'c' ? o.x - w / 2 : o.align === 'r' ? o.x - w : o.x;
      const y = o.y;
      if (lay.lines.length === 0 || lay.h === 0) return { x, y, w: 0, h: 0, right: x, bottom: y, lines: 0 };
      const runs = [];
      lay.lines.forEach((line, i) => {
        line.runs.forEach((t, j) => {
          runs.push({ text: t.text, options: { color: t.color, fontSize: t.pt, fontFace: FONT_FACE, breakLine: j === line.runs.length - 1 && i < lay.lines.length - 1 } });
        });
      });
      slide.addText(runs, {
        x, y, w, h: lay.h, margin: 0, valign: 'top', wrap: false, isTextBox: true,
        align: o.align === 'c' ? 'center' : o.align === 'r' ? 'right' : 'left',
        lineSpacingMultiple: LINE_MULT, fit: 'none'
      });
      const box = { x, y, w, h: lay.h, right: x + w, bottom: y + lay.h, lines: lay.lines.length };
      if (!o.footer && box.bottom > limits.bottom + 0.001) warnings.push(`text runs past the bottom (${box.bottom.toFixed(2)}in): "${runs.map((r) => r.text).join('').slice(0, 40)}"`);
      if (box.right > limits.right + 0.001) warnings.push(`text runs past the right edge (${box.right.toFixed(2)}in): "${runs.map((r) => r.text).join('').slice(0, 40)}"`);
      return box;
    },
    rect(o) {
      slide.addShape(o.shape ? pres.ShapeType[o.shape] : (o.round ? pres.ShapeType.roundRect : pres.ShapeType.rect), {
        x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: o.round,
        fill: o.fill ? { color: o.fill } : { type: 'none' },
        line: o.line ? { color: o.line, width: o.lw || 0.75, dashType: o.dash || 'solid' } : { type: 'none' }
      });
    },
    // a box that CARRIES its text (the text is part of the shape, so moving or resizing the box
    // moves the words with it); the caller sizes it from layout() so it hugs the text
    shapeText(label, o) {
      const pad = o.pad === undefined ? 0.05 : o.pad;
      slide.addText(String(label), {
        x: o.x, y: o.y, w: o.w, h: o.h, shape: o.round ? pres.ShapeType.roundRect : pres.ShapeType.rect, rectRadius: o.round,
        fill: o.fill ? { color: o.fill } : { type: 'none' },
        line: o.line ? { color: o.line, width: o.lw || 0.75, dashType: o.dash || 'solid' } : { type: 'none' },
        fontFace: FONT_FACE, fontSize: o.pt || 7, color: o.color, align: o.align === 'c' ? 'center' : 'left', valign: o.valign || 'middle',
        margin: [pad, pad, pad, pad], lineSpacingMultiple: LINE_MULT, fit: 'none'
      });
      return { x: o.x, y: o.y, w: o.w, h: o.h, right: o.x + o.w, bottom: o.y + o.h };
    },
    hline(x1, x2, y, o = {}) {
      slide.addShape(pres.ShapeType.line, { x: x1, y, w: x2 - x1, h: 0, line: { color: o.color || 'E6E6E6', width: o.lw || 0.75, dashType: o.dash || 'solid' } });
    },
    vline(x, y1, y2, o = {}) {
      slide.addShape(pres.ShapeType.line, { x, y: y1, w: 0, h: y2 - y1, line: { color: o.color || 'E6E6E6', width: o.lw || 0.75, dashType: o.dash || 'solid' } });
    },
    // a pill that is exactly as wide as its label plus padding
    pill(label, o) {
      const pt = o.pt || 8;
      const padX = o.padX === undefined ? 0.09 : o.padX;
      const padY = o.padY === undefined ? 0.035 : o.padY;
      const tw = advance(label, pt);
      const w = tw + 2 * padX; const h = lineHeight(pt) + 2 * padY;
      const x = o.align === 'c' ? o.x - w / 2 : o.align === 'r' ? o.x - w : o.x;
      C.rect({ x, y: o.y, w, h, fill: o.fill, line: o.line, lw: o.lw || 0.75, round: h / 2 });
      C.text(label, { x: x + w / 2, y: o.y + padY, pt, color: o.color, align: 'c' });
      return { x, y: o.y, w, h, right: x + w, bottom: o.y + h };
    }
  };
  return C;
}

module.exports = { FONT_FACE, FONT_FILE, LINE_MULT, LINE_EM, advance, lineHeight, layout, createCanvas };
