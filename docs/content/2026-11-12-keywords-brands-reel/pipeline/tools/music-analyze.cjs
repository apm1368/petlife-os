// Decode MP3s in Chromium and estimate duration, loudness per 4 s and tempo (onset autocorrelation).
const fs = require("fs"), path = require("path");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
(async () => {
  const files = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome", args: ["--disable-gpu", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.route("https://a.local/**", (r) => { const f = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)); return f ? r.fulfill({ status: 200, contentType: "audio/mpeg", body: fs.readFileSync(f) }) : r.fulfill({ status: 200, contentType: "text/html", body: "<title>a</title>" }); });
  await p.goto("https://a.local/");
  for (const f of files) {
    const r = await p.evaluate(async (u) => {
      const ac = new OfflineAudioContext(1, 48000, 48000);
      const buf = await ac.decodeAudioData(await (await fetch(u)).arrayBuffer());
      const sr = buf.sampleRate, ch = buf.getChannelData(0), hop = 512;
      const env = []; let prev = 0;
      for (let i = 0; i + hop < ch.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += ch[j] * ch[j]; const e = Math.sqrt(s / hop); env.push(Math.max(0, e - prev)); prev = e; }
      const fps = sr / hop; let best = [0, 0];
      for (let bpm = 70; bpm <= 180; bpm += 0.5) { const lag = fps * 60 / bpm; let s = 0; for (let k = 0; k + lag * 4 < env.length; k++) s += env[k] * (env[Math.round(k + lag)] + 0.5 * env[Math.round(k + lag * 2)]); if (s > best[1]) best = [bpm, s]; }
      const lv = []; const w = sr * 4; for (let i = 0; i < ch.length; i += w) { let s = 0; for (let j = i; j < Math.min(ch.length, i + w); j++) s += ch[j] * ch[j]; lv.push(+Math.sqrt(s / w).toFixed(2)); }
      return { dur: +buf.duration.toFixed(1), bpm: best[0], levels: lv.join(" ") };
    }, "https://a.local/" + encodeURIComponent(f));
    console.log(path.basename(f), JSON.stringify(r));
  }
  await b.close();
})();
