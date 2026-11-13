const fs = require("fs");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
(async () => {
  const f = process.argv[2];
  const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome", args: ["--disable-gpu"] });
  const p = await b.newPage();
  await p.route("https://a.local/**", (r) => r.request().url().endsWith(".mp3") ? r.fulfill({ status: 200, contentType: "audio/mpeg", body: fs.readFileSync(f) }) : r.fulfill({ status: 200, contentType: "text/html", body: "<title>a</title>" }));
  await p.goto("https://a.local/");
  const r = await p.evaluate(async () => {
    const ac = new OfflineAudioContext(1, 48000, 48000);
    const buf = await ac.decodeAudioData(await (await fetch("/t.mp3")).arrayBuffer());
    const sr = buf.sampleRate, ch = buf.getChannelData(0), hop = 256, fps = sr / hop;
    const env = []; let prev = 0;
    for (let i = 0; i + hop < ch.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += ch[j] * ch[j]; const e = Math.sqrt(s / hop); env.push(Math.max(0, e - prev)); prev = e; }
    let best = [0, 0, 0];
    for (let bpm = 115; bpm <= 125; bpm += 0.05) { const per = 60 / bpm; for (let ph = 0; ph < per; ph += 0.005) { let s = 0; for (let t = ph + 4; t < 70; t += per) s += env[Math.round(t * fps)] || 0; if (s > best[2]) best = [bpm, ph, s]; } }
    // strongest beat in each bar-candidate group (4 beats) to guess downbeat
    const per = 60 / best[0]; const beats = []; for (let t = best[1]; t < 16; t += per) beats.push([+t.toFixed(3), +(env[Math.round(t * fps)] || 0).toFixed(4)]);
    return { bpm: +best[0].toFixed(2), phase: +best[1].toFixed(3), beats };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
