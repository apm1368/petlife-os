// Contact sheet: node sheet.cjs <out.png> <cols> <cellW> <img...>
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const [out, cols, cw, ...imgs] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome", args: ["--disable-gpu", "--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: cols * cw + 20, height: 400 } });
  const fs=require("fs");const html=`<body style="margin:0;padding:10px;background:#333;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:6px;font:12px sans-serif;color:#fff">${imgs.map((i) => `<div><img src="file://${i}" style="width:${cw}px;display:block"><div>${i.split("/").pop()}</div></div>`).join("")}</body>`;fs.writeFileSync(out+".html",html);await p.goto("file://"+out+".html");
  await p.waitForTimeout(600);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
