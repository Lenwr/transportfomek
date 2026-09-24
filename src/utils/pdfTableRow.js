// Split long descriptions across pages without clipping or losing text.
export function drawWrappedTableRow(pdf, values, widths, x, startY, limitY, newPage) {
  const lines = values.map((value, i) => pdf.splitTextToSize(String(value ?? ''), widths[i] - 6));
  let offset = 0;
  let y = startY;
  const count = Math.max(1, ...lines.map(column => column.length));
  while (offset < count) {
    if (y + 11 > limitY) y = newPage();
    const size = Math.min(count - offset, Math.max(1, Math.floor((limitY - y - 6) / 5)));
    const height = size * 5 + 6;
    let cx = x;
    widths.forEach((width, i) => {
      pdf.rect(cx, y, width, height);
      const chunk = lines[i].slice(offset, offset + size);
      if (chunk.length) pdf.text(chunk, cx + 3, y + 5);
      cx += width;
    });
    offset += size;
    y += height;
  }
  return y;
}
