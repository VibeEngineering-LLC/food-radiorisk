// #FR-107: раскладка подписи-выноски круговой диаграммы: перенос строк и размер шрифта, чтобы подпись целиком лежала внутри ширины SVG

export const CALLOUT_CHAR_W = 0.62;

export function calloutLayout({
  label,
  share,
  x,
  anchor,
  width,
  font = 15,
  lineHeight = 1.15,
  margin = 4,
  minFont = 10,
  charW = 0.62,
}) {
  const avail = anchor === 'start' ? width - x - margin : x - margin;
  const safeAvail = avail < 1 ? 1 : avail;

  const tokens = label.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length > 0) {
    tokens[tokens.length - 1] = tokens[tokens.length - 1] + ':';
  }
  tokens.push(share);

  const wrap = (f) => {
    const lines = [];
    let cur = '';
    for (const tok of tokens) {
      const cand = cur === '' ? tok : cur + ' ' + tok;
      if (cand.length * f * charW <= safeAvail) {
        cur = cand;
      } else {
        if (cur !== '') lines.push(cur);
        cur = tok;
      }
    }
    if (cur !== '') lines.push(cur);
    return lines;
  };

  let lines = wrap(font);
  let usedFont = font;
  let widest = 0;
  for (const ln of lines) {
    const w = ln.length * usedFont * charW;
    if (w > widest) widest = w;
  }

  if (widest > safeAvail && usedFont > minFont) {
    let f = Math.max(minFont, usedFont * safeAvail / widest);
    f = Math.floor(f * 10) / 10;
    usedFont = f;
    lines = wrap(usedFont);
  }

  let widthUsed = 0;
  for (const ln of lines) {
    const w = ln.length * usedFont * charW;
    if (w > widthUsed) widthUsed = w;
  }

  let xOut;
  if (anchor === 'start') {
    xOut = Math.min(x, width - margin - widthUsed);
    xOut = Math.max(margin, xOut);
  } else {
    xOut = Math.max(x, margin + widthUsed);
    xOut = Math.min(width - margin, xOut);
  }

  return {
    lines,
    font: Math.round(usedFont * 100) / 100,
    x: Math.round(xOut * 100) / 100,
    lineHeight: Math.round(usedFont * lineHeight * 100) / 100,
    width: Math.round(widthUsed * 100) / 100,
  };
}
