// node to_pdf.js <in.html> <out.pdf>  — print an HTML file to an A4 PDF with Chromium (Playwright)
const { chromium } = require('playwright');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + inp, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:9pt;color:#8a94a3;font-family:sans-serif"><span class="pageNumber"></span></div>' });
  await b.close();
})();
