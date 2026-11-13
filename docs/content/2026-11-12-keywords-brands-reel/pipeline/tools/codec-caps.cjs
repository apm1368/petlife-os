const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome", args: ["--disable-gpu", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.goto("file://" + __dirname + "/blank.html");
  const r = await p.evaluate(async () => {
    const out = { ua: navigator.userAgent };
    const v = { vp9: "vp09.00.10.08", vp8: "vp8", av1: "av01.0.04M.08", h264: "avc1.42E01F", h264h: "avc1.640028" };
    for (const [k, c] of Object.entries(v)) {
      try { out["venc_" + k] = (await VideoEncoder.isConfigSupported({ codec: c, width: 1080, height: 1920, bitrate: 6e6, framerate: 30 })).supported; } catch (e) { out["venc_" + k] = "err " + e.message; }
    }
    for (const c of ["opus", "mp4a.40.2"]) {
      try { out["aenc_" + c] = (await AudioEncoder.isConfigSupported({ codec: c, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { out["aenc_" + c] = "err " + e.message; }
    }
    for (const m of ["video/mp4", "video/mp4;codecs=avc1", "video/mp4;codecs=vp9,opus", "video/mp4;codecs=av01,opus", "video/webm;codecs=vp9,opus", "audio/mp4"]) out["mr " + m] = MediaRecorder.isTypeSupported(m);
    out.mp3 = new Audio().canPlayType("audio/mpeg");
    return out;
  });
  console.log(r);
  await b.close();
})();
