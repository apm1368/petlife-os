// node vcheck.cjs <file.webm> <out.png> [t1,t2..] — checks duration, seeks, screenshots frames side by side, decodes audio if any.
const fs = require("fs");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const [file, out, ts = "1,10,20"] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome", args: ["--disable-gpu", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });
  const html = out + ".html";
  fs.writeFileSync(html, `<body style="margin:0;background:#222"><div id="row" style="display:flex;gap:4px"></div></body>`);
  const p = await b.newPage({ viewport: { width: 1600, height: 500 } });
  await p.goto("file://" + html);
  const b64 = fs.readFileSync(file).toString("base64");
  const r = await p.evaluate(async ({ src, times, b64 }) => {
    const v = document.createElement("video"); v.src = src; v.muted = true; v.preload = "auto";
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("video error " + (v.error && v.error.message))); });
    const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight, frames: [] };
    for (const t of times) {
      v.currentTime = t; await new Promise((res) => (v.onseeked = res));
      const c = document.createElement("canvas"); const k = 380 / Math.max(v.videoWidth, v.videoHeight) * (v.videoWidth > v.videoHeight ? 1 : 1);
      c.width = Math.round(v.videoWidth * (v.videoWidth > v.videoHeight ? 380 / v.videoWidth : 260 / v.videoWidth)); c.height = Math.round(c.width * v.videoHeight / v.videoWidth);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); document.getElementById("row").appendChild(c);
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i]; info.frames.push([t, Math.round(sum / (d.length / 4))]);
    }
    try { const ab = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer; const ac = new OfflineAudioContext(2, 48000, 48000); const a = await ac.decodeAudioData(ab); let pk = 0; const ch = a.getChannelData(0); for (let i = 0; i < ch.length; i += 16) pk = Math.max(pk, Math.abs(ch[i])); info.audio = { duration: +a.duration.toFixed(2), channels: a.numberOfChannels, peak: +pk.toFixed(2) }; } catch (e) { info.audio = "none (" + e.message.slice(0, 40) + ")"; }
    return info;
  }, { src: "file://" + file, times: ts.split(",").map(Number), b64 });
  await p.screenshot({ path: out });
  console.log(JSON.stringify(r));
  await b.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
