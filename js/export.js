// Esportazione in Word (.docx) e PDF.
// - entityIndex: elenco degli argomenti di un ente (titolo + data di creazione)
// - topic: tutte le note di un argomento, con formattazione e immagini
window.SBExport = (() => {
  'use strict';

  const LIB_DOCX = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
  const LIB_PDF = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js';
  const LIB_PDF_FONTS = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js';

  const loaded = {};
  const load = src => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error('Impossibile caricare la libreria di esportazione (sei online?)')); };
    document.head.append(s);
  }));
  const ensureDocx = () => load(LIB_DOCX);
  const ensurePdf = () => load(LIB_PDF).then(() => load(LIB_PDF_FONTS));

  /* ---------- utilità ---------- */
  const pad = n => String(n).padStart(2, '0');
  const fmtDateTime = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtDateOnly = iso => fmtDateTime(iso).split(' - ')[0];
  const fmtYmd = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  const nowLabel = () => { const d = new Date(); return `${fmtDateOnly(d.toISOString())} alle ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  function noteStatus(n) {
    const parts = [];
    if (n.todo) parts.push(n.done ? 'Fatto' : 'Da fare');
    if (n.todo && n.due_date) parts.push(`Scadenza ${fmtYmd(n.due_date)}`);
    return parts.join(' · ');
  }

  /* ---------- HTML della nota → struttura neutra ---------- */
  // blocchi: p {runs, style: h2|h3|quote|null}, list {ordered, check, items[{checked, blocks}]},
  //          image {path, src}, file {name}, table {rows[[runs]]}
  // runs: {text, bold, italics, underline, strike, highlight, link} oppure {br: true}
  const BLOCK_RE = /^(DIV|P|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER)$/;

  function fmtOf(el, fmt) {
    const f = { ...fmt };
    const t = el.tagName, st = el.style || {};
    if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(st.fontWeight || '')) f.bold = true;
    if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') f.italics = true;
    if (t === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) f.underline = true;
    if (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(st.textDecoration || st.textDecorationLine || '')) f.strike = true;
    const bg = st.backgroundColor || '';
    if (t === 'MARK' || (bg && !/transparent|rgba\(0, 0, 0, 0\)/.test(bg))) f.highlight = true;
    if (t === 'A' && el.getAttribute('href')) f.link = el.getAttribute('href');
    return f;
  }

  function walk(container, baseStyle = null) {
    const out = [];
    let para = null;
    const ensure = () => para || (para = { type: 'p', style: baseStyle, runs: [] });
    const flush = () => {
      if (para) {
        while (para.runs.length && para.runs[para.runs.length - 1].br) para.runs.pop();
        if (para.runs.length && para.runs[0].text) para.runs[0].text = para.runs[0].text.replace(/^\s+/, '');
        if (para.runs.some(r => r.br || r.text.trim())) out.push(para);
      }
      para = null;
    };
    const visit = (node, fmt) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          const t = ch.textContent.replace(/​/g, '').replace(/[ \t\r\n]+/g, ' ');
          if (t && !(t === ' ' && !para)) ensure().runs.push({ text: t, ...fmt });
          continue;
        }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName.toUpperCase();
        if (tag === 'SVG' || tag === 'STYLE' || tag === 'SCRIPT') continue;
        if (tag === 'BR') { ensure().runs.push({ br: true, text: '' }); continue; }
        if (tag === 'IMG') { flush(); out.push({ type: 'image', path: ch.dataset.path || null, src: ch.getAttribute('src') || '' }); continue; }
        if (tag === 'A' && ch.dataset.path) { flush(); out.push({ type: 'file', name: ch.dataset.name || ch.textContent.trim() }); continue; }
        if (tag === 'UL' || tag === 'OL') {
          flush();
          out.push({
            type: 'list', ordered: tag === 'OL', check: ch.classList.contains('checklist'),
            items: [...ch.children].filter(li => li.tagName === 'LI')
              .map(li => ({ checked: li.dataset.checked === 'true', blocks: walk(li) }))
          });
          continue;
        }
        if (tag === 'TABLE') {
          flush();
          const rows = [...ch.querySelectorAll('tr')].map(tr => [...tr.children].map(td =>
            walk(td).filter(b => b.type === 'p').flatMap((b, i) => (i ? [{ br: true, text: '' }] : []).concat(b.runs))));
          if (rows.length) out.push({ type: 'table', rows });
          continue;
        }
        if (BLOCK_RE.test(tag)) {
          flush();
          const st = /^H[12]$/.test(tag) ? 'h2' : /^H[3-6]$/.test(tag) ? 'h3' : tag === 'BLOCKQUOTE' ? 'quote' : baseStyle;
          out.push(...walk(ch, st));
          continue;
        }
        visit(ch, fmtOf(ch, fmt));
      }
    };
    visit(container, {});
    flush();
    return out;
  }

  function htmlToBlocks(html) {
    const box = document.createElement('div');
    box.innerHTML = window.DOMPurify ? DOMPurify.sanitize(html || '') : (html || '');
    return walk(box);
  }

  // Scarica le immagini e le prepara per Word (ArrayBuffer) e PDF (data URL).
  async function loadImages(blockLists, resolveUrls) {
    const imgs = [];
    const collect = bs => bs.forEach(b => {
      if (b.type === 'image') imgs.push(b);
      if (b.type === 'list') b.items.forEach(i => collect(i.blocks));
    });
    blockLists.forEach(collect);
    const paths = [...new Set(imgs.filter(b => b.path).map(b => b.path))];
    const urlMap = paths.length && resolveUrls ? await resolveUrls(paths) : {};
    const map = new Map();
    await Promise.all(imgs.map(async b => {
      const url = b.path ? urlMap[b.path] : b.src;
      if (!url) return;
      try {
        let blob = await (await fetch(url)).blob();
        const bmp = await createImageBitmap(blob);
        if (!/^image\/(png|jpe?g)$/.test(blob.type)) {
          const c = document.createElement('canvas');
          c.width = bmp.width; c.height = bmp.height;
          c.getContext('2d').drawImage(bmp, 0, 0);
          blob = await new Promise(r => c.toBlob(r, 'image/png'));
        }
        const buffer = await blob.arrayBuffer();
        const dataURL = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        map.set(b, { buffer, dataURL, w: bmp.width, h: bmp.height });
      } catch { /* immagine non raggiungibile: verrà indicata nel documento */ }
    }));
    return map;
  }

  /* ================= PDF (pdfmake) ================= */
  const C = { text: '#0f172a', muted: '#64748b', light: '#94a3b8', accent: '#1d5bff', line: '#e5e9f0', quote: '#c9d6ff' };
  const PAGE_W = 515; // A4 meno i margini, in punti

  const pdfRuns = runs => runs.map(r => r.br ? { text: '\n' } : {
    text: r.text,
    bold: r.bold || undefined,
    italics: r.italics || undefined,
    decoration: r.strike ? 'lineThrough' : (r.underline || r.link) ? 'underline' : undefined,
    background: r.highlight ? '#fff1a8' : undefined,
    link: r.link || undefined,
    color: r.link ? C.accent : undefined
  });

  const pdfCheckbox = checked => [
    { type: 'rect', x: 0, y: 2.5, w: 9, h: 9, r: 2, lineWidth: 1, lineColor: checked ? C.accent : C.light, color: checked ? C.accent : '#ffffff' },
    ...(checked ? [{ type: 'polyline', points: [{ x: 2.2, y: 7 }, { x: 4, y: 8.8 }, { x: 7, y: 5 }], lineWidth: 1.3, lineColor: '#ffffff' }] : [])
  ];

  function pdfBlocks(blocks, imgs) {
    return blocks.map(b => {
      switch (b.type) {
        case 'p': {
          const node = { text: pdfRuns(b.runs), margin: [0, 0, 0, 4] };
          if (b.style === 'h2') return { ...node, fontSize: 14, bold: true, margin: [0, 8, 0, 4] };
          if (b.style === 'h3') return { ...node, fontSize: 12, bold: true, margin: [0, 6, 0, 3] };
          if (b.style === 'quote') return {
            table: { widths: ['*'], body: [[{ ...node, color: '#475569', margin: [8, 1, 0, 1] }]] },
            layout: { hLineWidth: () => 0, vLineWidth: i => (i === 0 ? 2.5 : 0), vLineColor: () => C.quote, paddingLeft: () => 0, paddingRight: () => 0 },
            margin: [0, 2, 0, 6]
          };
          return node;
        }
        case 'list':
          if (b.check) return {
            stack: b.items.map(it => ({
              columns: [
                { width: 13, canvas: pdfCheckbox(it.checked) },
                { width: '*', stack: pdfBlocks(it.blocks, imgs), color: it.checked ? C.light : undefined }
              ],
              columnGap: 3, margin: [0, 1, 0, 1]
            })),
            margin: [0, 0, 0, 4]
          };
          return { [b.ordered ? 'ol' : 'ul']: b.items.map(it => ({ stack: pdfBlocks(it.blocks, imgs) })), margin: [0, 0, 0, 4] };
        case 'image': {
          const im = imgs.get(b);
          if (!im) return { text: '[immagine non disponibile]', italics: true, color: C.light, margin: [0, 2, 0, 4] };
          return { image: im.dataURL, fit: [Math.min(PAGE_W, im.w * 0.75), 700], margin: [0, 4, 0, 6] };
        }
        case 'file':
          return { text: [{ text: 'Allegato: ', bold: true }, b.name], color: '#475569', fontSize: 9.5, margin: [0, 2, 0, 4] };
        case 'table': {
          const cols = Math.max(...b.rows.map(r => r.length));
          return {
            table: { body: b.rows.map((r, i) => Array.from({ length: cols }, (_, j) => ({ text: pdfRuns(r[j] || []), fontSize: 8.5, bold: i === 0 || undefined }))) },
            layout: 'lightHorizontalLines', margin: [0, 4, 0, 6]
          };
        }
        default: return { text: '' };
      }
    });
  }

  function pdfDoc({ kicker, title, subtitle, content }) {
    return {
      pageSize: 'A4',
      pageMargins: [40, 46, 40, 50],
      info: { title, creator: 'SecondBrainStep' },
      defaultStyle: { fontSize: 10, lineHeight: 1.25, color: C.text },
      footer: (cur, total) => ({
        columns: [
          { text: `${kicker} · ${title}`, color: C.light, fontSize: 8 },
          { text: `${cur} / ${total}`, alignment: 'right', color: C.light, fontSize: 8 }
        ],
        margin: [40, 18, 40, 0]
      }),
      content: [
        { text: kicker.toUpperCase(), color: C.accent, bold: true, fontSize: 8.5, characterSpacing: 0.6 },
        { text: title, fontSize: 19, bold: true, margin: [0, 3, 0, 3] },
        { text: subtitle, color: C.muted, fontSize: 9, margin: [0, 0, 0, 10] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W, y2: 0, lineWidth: 1, lineColor: C.line }], margin: [0, 0, 0, 14] },
        ...content
      ]
    };
  }

  /* ================= WORD (docx) ================= */
  const docxBorders = D => {
    const b = { style: D.BorderStyle.SINGLE, size: 4, color: 'D5DCE6' };
    return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
  };
  function docxRuns(D, runs, base = {}) {
    return runs.map((r, i) => {
      if (r.br) return new D.TextRun({ text: '', break: 1, ...base });
      const tr = new D.TextRun({
        text: r.text,
        bold: r.bold || base.bold,
        italics: r.italics || base.italics,
        underline: r.underline ? {} : undefined,
        strike: r.strike || undefined,
        highlight: r.highlight ? 'yellow' : undefined,
        size: base.size,
        color: r.link ? '1D5BFF' : base.color,
        font: base.font
      });
      return r.link ? new D.ExternalHyperlink({ link: r.link, children: [tr] }) : tr;
    });
  }

  function docxBlocks(D, blocks, imgs, ctx, level = 0, listProps = null) {
    const out = [];
    blocks.forEach((b, idx) => {
      // la prima riga di una voce di elenco riceve il pallino / numero / casella
      const lp = idx === 0 ? listProps : null;
      const contIndent = level > 0 || listProps ? { left: 360 * (level + (listProps ? 1 : 0)) } : undefined;
      switch (b.type) {
        case 'p': {
          const base = b.style === 'h2' ? { bold: true, size: 28, color: '0F172A' }
            : b.style === 'h3' ? { bold: true, size: 24, color: '0F172A' }
            : b.style === 'quote' ? { italics: true, color: '475569' } : {};
          const children = docxRuns(D, b.runs, base);
          if (lp?.check) children.unshift(new D.TextRun({ text: lp.checked ? '☒ ' : '☐ ', font: 'Segoe UI Symbol', color: lp.checked ? '1D5BFF' : '64748B' }));
          out.push(new D.Paragraph({
            children,
            heading: b.style === 'h2' ? D.HeadingLevel.HEADING_2 : b.style === 'h3' ? D.HeadingLevel.HEADING_3 : undefined,
            numbering: lp && !lp.check ? { reference: lp.ordered ? 'sb-num' : 'sb-bullet', level: Math.min(level, 3), instance: lp.instance } : undefined,
            indent: lp?.check ? { left: 360 * (level + 1), hanging: 300 }
              : b.style === 'quote' ? { left: 240 + (contIndent?.left || 0) }
              : lp ? undefined : contIndent,
            border: b.style === 'quote' ? { left: { style: D.BorderStyle.SINGLE, size: 18, color: 'C9D6FF', space: 8 } } : undefined,
            spacing: { before: b.style === 'h2' ? 200 : b.style === 'h3' ? 140 : 0, after: lp ? 40 : 100 }
          }));
          break;
        }
        case 'list': {
          const instance = b.ordered ? ++ctx.listInstance : undefined;
          for (const it of b.items) {
            const props = { ordered: b.ordered, check: b.check, checked: it.checked, instance };
            const first = it.blocks[0];
            const blocksOfItem = first && first.type === 'p' ? it.blocks : [{ type: 'p', style: null, runs: [{ text: '' }] }, ...it.blocks];
            out.push(...docxBlocks(D, blocksOfItem, imgs, ctx, level + (listProps ? 1 : 0), props));
          }
          break;
        }
        case 'image': {
          const im = imgs.get(b);
          if (!im) { out.push(new D.Paragraph({ children: [new D.TextRun({ text: '[immagine non disponibile]', italics: true, color: '94A3B8' })] })); break; }
          const maxW = 600 - (contIndent?.left || 0) / 15;
          const w = Math.min(maxW, im.w), hgt = Math.round(im.h * (w / im.w));
          out.push(new D.Paragraph({ children: [new D.ImageRun({ data: im.buffer, transformation: { width: Math.round(w), height: hgt } })], indent: contIndent, spacing: { before: 60, after: 120 } }));
          break;
        }
        case 'file':
          out.push(new D.Paragraph({ indent: contIndent, spacing: { after: 100 }, children: [
            new D.TextRun({ text: 'Allegato: ', bold: true, color: '475569', size: 20 }),
            new D.TextRun({ text: b.name, color: '475569', size: 20 })
          ] }));
          break;
        case 'table': {
          const cols = Math.max(...b.rows.map(r => r.length));
          out.push(new D.Table({
            width: { size: 100, type: D.WidthType.PERCENTAGE },
            borders: docxBorders(D),
            rows: b.rows.map((r, i) => new D.TableRow({
              children: Array.from({ length: cols }, (_, j) => new D.TableCell({
                shading: i === 0 ? { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F3F5F9' } : undefined,
                children: [new D.Paragraph({ children: docxRuns(D, r[j] || [], { size: 18, bold: i === 0 || undefined }) })]
              }))
            }))
          }));
          out.push(new D.Paragraph({ children: [], spacing: { after: 80 } }));
          break;
        }
      }
    });
    return out;
  }

  function docxDocument(D, { kicker, title, subtitle, children }) {
    const levels = (fmt, texts) => [0, 1, 2, 3].map(l => ({
      level: l, format: fmt, text: texts(l), alignment: D.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 * (l + 1), hanging: 260 } } }
    }));
    return new D.Document({
      creator: 'SecondBrainStep',
      title,
      styles: { default: { document: { run: { font: 'Calibri', size: 21, color: '0F172A' } } } },
      numbering: {
        config: [
          { reference: 'sb-bullet', levels: levels(D.LevelFormat.BULLET, l => ['•', '◦', '▪', '•'][l]) },
          { reference: 'sb-num', levels: levels(D.LevelFormat.DECIMAL, l => `%${l + 1}.`) }
        ]
      },
      sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        footers: {
          default: new D.Footer({ children: [new D.Paragraph({
            alignment: D.AlignmentType.RIGHT,
            children: [new D.TextRun({ children: [`${kicker} · ${title}    `, D.PageNumber.CURRENT, ' / ', D.PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' })]
          })] })
        },
        children: [
          new D.Paragraph({ children: [new D.TextRun({ text: kicker.toUpperCase(), bold: true, color: '1D5BFF', size: 17 })] }),
          new D.Paragraph({ spacing: { before: 40, after: 40 }, children: [new D.TextRun({ text: title, bold: true, size: 38 })] }),
          new D.Paragraph({
            spacing: { after: 240 },
            border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'E5E9F0', space: 8 } },
            children: [new D.TextRun({ text: subtitle, color: '64748B', size: 18 })]
          }),
          ...children
        ]
      }]
    });
  }

  /* ================= esportazioni ================= */

  // Indice dell'ente: titoli degli argomenti e data di creazione.
  async function entityIndex({ format, entityName, topics }) {
    const title = entityName;
    const kicker = 'Elenco argomenti';
    const subtitle = `${topics.length} argomenti · esportato il ${nowLabel()}`;
    const file = safeName(`${entityName} - elenco argomenti`);

    if (format === 'pdf') {
      await ensurePdf();
      const body = [
        [{ text: '#', bold: true, color: C.muted }, { text: 'Argomento', bold: true, color: C.muted }, { text: 'Data di creazione', bold: true, color: C.muted }],
        ...topics.map((t, i) => [{ text: String(i + 1), color: C.light }, t.title, fmtDateTime(t.created_at)])
      ];
      const content = topics.length ? [{
        table: { headerRows: 1, widths: ['auto', '*', 'auto'], body },
        layout: {
          hLineWidth: i => (i === 0 ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => C.line,
          paddingTop: () => 6, paddingBottom: () => 6, fillColor: r => (r === 0 ? '#f3f5f9' : null)
        }
      }] : [{ text: 'Nessun argomento.', color: C.muted }];
      pdfMake.createPdf(pdfDoc({ kicker, title, subtitle, content })).download(`${file}.pdf`);
      return;
    }

    await ensureDocx();
    const D = window.docx;
    const cell = (text, opts = {}) => new D.TableCell({
      shading: opts.head ? { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F3F5F9' } : undefined,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new D.Paragraph({ children: [new D.TextRun({ text, bold: opts.head, color: opts.head ? '64748B' : opts.color, size: 20 })] })]
    });
    const table = new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      columnWidths: [600, 6400, 2400],
      borders: docxBorders(D),
      rows: [
        new D.TableRow({ tableHeader: true, children: [cell('#', { head: true }), cell('Argomento', { head: true }), cell('Data di creazione', { head: true })] }),
        ...topics.map((t, i) => new D.TableRow({ children: [cell(String(i + 1), { color: '94A3B8' }), cell(t.title), cell(fmtDateTime(t.created_at))] }))
      ]
    });
    const doc = docxDocument(D, { kicker, title, subtitle, children: topics.length ? [table] : [new D.Paragraph({ children: [new D.TextRun({ text: 'Nessun argomento.', color: '64748B' })] })] });
    download(await D.Packer.toBlob(doc), `${file}.docx`);
  }

  // Argomento completo: tutte le note con data/ora, formattazione e immagini.
  async function topic({ format, entityName, topicTitle, notes, resolveUrls }) {
    const title = topicTitle;
    const kicker = entityName;
    const subtitle = `${notes.length} ${notes.length === 1 ? 'nota' : 'note'} · esportato il ${nowLabel()}`;
    const file = safeName(`${entityName} - ${topicTitle}`);
    const parsed = notes.map(n => ({ n, blocks: htmlToBlocks(n.html) }));

    if (format === 'pdf') {
      await ensurePdf();
      const imgs = await loadImages(parsed.map(p => p.blocks), resolveUrls);
      const content = [];
      parsed.forEach(({ n, blocks }, i) => {
        const status = noteStatus(n);
        const header = {
          text: [{ text: fmtDateTime(n.created_at), bold: true, color: C.accent }, status ? { text: `   ${status}`, color: n.done ? '#16a34a' : '#d97706', bold: true } : ''],
          fontSize: 9, margin: [0, i ? 4 : 0, 0, 5]
        };
        const body = pdfBlocks(blocks, imgs);
        // la data della nota non resta mai da sola in fondo alla pagina
        content.push({ stack: [header, ...body.slice(0, 1)], unbreakable: true }, ...body.slice(1));
        if (i < parsed.length - 1) content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W, y2: 0, lineWidth: 0.6, lineColor: C.line }], margin: [0, 8, 0, 8] });
      });
      if (!notes.length) content.push({ text: 'Nessuna nota.', color: C.muted });
      pdfMake.createPdf(pdfDoc({ kicker, title, subtitle, content })).download(`${file}.pdf`);
      return;
    }

    await ensureDocx();
    const D = window.docx;
    const imgs = await loadImages(parsed.map(p => p.blocks), resolveUrls);
    const ctx = { listInstance: 0 };
    const children = [];
    parsed.forEach(({ n, blocks }, i) => {
      const status = noteStatus(n);
      children.push(new D.Paragraph({
        spacing: { before: i ? 240 : 0, after: 80 },
        keepNext: true,
        children: [
          new D.TextRun({ text: fmtDateTime(n.created_at), bold: true, color: '1D5BFF', size: 18 }),
          ...(status ? [new D.TextRun({ text: `   ${status}`, bold: true, color: n.done ? '16A34A' : 'D97706', size: 18 })] : [])
        ]
      }));
      children.push(...docxBlocks(D, blocks, imgs, ctx));
      if (i < parsed.length - 1) children.push(new D.Paragraph({ children: [], border: { bottom: { style: D.BorderStyle.SINGLE, size: 4, color: 'E5E9F0', space: 6 } } }));
    });
    if (!notes.length) children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Nessuna nota.', color: '64748B' })] }));
    download(await D.Packer.toBlob(docxDocument(D, { kicker, title, subtitle, children })), `${file}.docx`);
  }

  return { entityIndex, topic, _htmlToBlocks: htmlToBlocks };
})();
