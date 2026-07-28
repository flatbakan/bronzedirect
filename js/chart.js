// chart.js — tiny dependency-free SVG bar chart (single series, brand hue).
// Follows the mark spec: thin bars, 4px rounded ends on the baseline,
// recessive axis, text in ink tokens (not the series colour), value on hover.
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v != null) n.setAttribute(k, v); }
  (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
  return n;
}

// items: [{ label, value }].  opts: { height, color, showValues, fmtVal, labelEvery }
export function barChart(items, opts = {}) {
  const { height = 180, color = '#8a2f78', showValues = false, fmtVal = (v) => String(v), labelEvery = 1 } = opts;
  const data = items && items.length ? items : [{ label: '', value: 0 }];
  const W = 660, H = height;
  const padL = 10, padR = 10, padT = 20, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const baseY = padT + plotH;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const slot = plotW / data.length;
  const barW = Math.min(46, slot * 0.6);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: `height:auto;display:block;overflow:visible` });
  // baseline (recessive)
  svg.append(s('line', { x1: padL, y1: baseY, x2: W - padR, y2: baseY, stroke: '#e4dfea', 'stroke-width': 1 }));

  data.forEach((d, i) => {
    const val = Number(d.value) || 0;
    const h = max ? (val / max) * plotH : 0;
    const x = padL + i * slot + (slot - barW) / 2;
    const y = baseY - h;
    const g = s('g', {});
    g.append(s('title', {}, document.createTextNode(`${d.label}: ${fmtVal(val)}`)));
    g.append(s('rect', { x, y, width: barW, height: Math.max(h, val > 0 ? 2 : 0), rx: 4, ry: 4, fill: color }));
    if (showValues && val > 0) {
      g.append(s('text', { x: x + barW / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 11, fill: '#6d6579' }, document.createTextNode(fmtVal(val))));
    }
    if (i % labelEvery === 0 && d.label) {
      g.append(s('text', { x: x + barW / 2, y: baseY + 15, 'text-anchor': 'middle', 'font-size': 10, fill: '#6d6579' }, document.createTextNode(d.label)));
    }
    svg.append(g);
  });
  return svg;
}
