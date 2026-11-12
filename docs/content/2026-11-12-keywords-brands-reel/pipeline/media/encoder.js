// Media encoding without ffmpeg, inside headless Chromium (file:// pages are a secure context, so WebCodecs works):
//  - PNG → WebP through a canvas (toBlob "image/webp")
//  - frames (CDP JPEG screenshots) → VP9 through VideoEncoder → webm.js muxer
//  - MP3 section (fades, level) → Opus through AudioEncoder
// Chromium here has no H.264/AAC encoder, so videos are WebM (VP9 + Opus).
const fs = require("fs");
const { writeWebm } = require("./webm");

const IN_PAGE = `
window.__enc = {
  async webp(b64, q) {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    const out = await c.convertToBlob({ type: 'image/webp', quality: q });
    const bytes = new Uint8Array(await out.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  video: null,
  async startVideo(cfg) {
    const mk = (c) => { const st = { chunks: [], error: null, w: c.width, h: c.height }; st.enc = new VideoEncoder({ output: (chunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); st.chunks.push({ ts: chunk.timestamp, key: chunk.type === 'key', d }); }, error: (e) => { st.error = String(e); } }); st.enc.configure({ codec: c.codec, width: c.width, height: c.height, bitrate: c.bitrate, framerate: cfg.fps, latencyMode: 'quality', bitrateMode: 'variable' }); return st; };
    this.video = { n: 0, fps: cfg.fps, gop: cfg.gop, outs: [mk(cfg), ...(cfg.extra || []).map((e) => mk({ ...e, codec: e.codec || cfg.codec }))] };
    return true;
  },
  async frame(b64) {
    const v = this.video;
    for (const o of v.outs) if (o.error) throw new Error(o.error);
    const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob();
    const ts = Math.round(v.n * 1e6 / v.fps), dur = Math.round(1e6 / v.fps), key = v.n % v.gop === 0;
    for (const o of v.outs) {
      const bmp = await createImageBitmap(blob, o === v.outs[0] ? {} : { resizeWidth: o.w, resizeHeight: o.h, resizeQuality: 'high' });
      const vf = new VideoFrame(bmp, { timestamp: ts, duration: dur });
      o.enc.encode(vf, { keyFrame: key }); vf.close(); bmp.close();
      while (o.enc.encodeQueueSize > 3) await new Promise((r) => o.enc.addEventListener('dequeue', r, { once: true }));
    }
    v.n++;
    return v.n;
  },
  drain() {
    const enc = (c) => { let s = ''; for (let i = 0; i < c.d.length; i += 0x8000) s += String.fromCharCode(...c.d.subarray(i, i + 0x8000)); return { ts: c.ts, key: c.key, b64: btoa(s) }; };
    return this.video.outs.map((o) => o.chunks.splice(0).map(enc));
  },
  async finishVideo() { for (const o of this.video.outs) { await o.enc.flush(); o.enc.close(); if (o.error) throw new Error(o.error); } return this.drain(); },
  async audio(mp3b64, o) {
    const bytes = Uint8Array.from(atob(mp3b64), (c) => c.charCodeAt(0));
    const sr = 48000, len = Math.round(o.length * sr);
    const probe = new OfflineAudioContext(2, sr, sr);
    const src = await probe.decodeAudioData(bytes.buffer);
    const ctx = new OfflineAudioContext(2, len, sr);
    const node = ctx.createBufferSource(); node.buffer = src;
    const g = ctx.createGain(); node.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(1, o.fadeIn);
    g.gain.setValueAtTime(1, o.length - o.fadeOut); g.gain.linearRampToValueAtTime(0.0001, o.length);
    node.start(0, o.start, o.length);
    const buf = await ctx.startRendering();
    // Level: scale RMS to the target, then a soft limiter so peaks stay below -1 dBFS.
    let s = 0, n = 0; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 4) { s += d[i] * d[i]; n++; } }
    const rms = Math.sqrt(s / n), gain = o.targetRms / rms; let peak = 0;
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { let v = d[i] * gain; const a = Math.abs(v); if (a > 0.7) v = Math.sign(v) * (0.7 + 0.19 * Math.tanh((a - 0.7) / 0.19)); d[i] = v; peak = Math.max(peak, Math.abs(v)); } }
    const chunks = []; let meta = null, err = null;
    const enc = new AudioEncoder({ output: (chunk, md) => { if (md && md.decoderConfig && md.decoderConfig.description && !meta) meta = new Uint8Array(md.decoderConfig.description); const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); chunks.push({ ts: chunk.timestamp, d }); }, error: (e) => { err = String(e); } });
    enc.configure({ codec: 'opus', sampleRate: sr, numberOfChannels: 2, bitrate: o.bitrate });
    const step = 4800;
    for (let i = 0; i < len; i += step) {
      const m = Math.min(step, len - i); const plane = new Float32Array(m * 2);
      plane.set(buf.getChannelData(0).subarray(i, i + m), 0); plane.set(buf.getChannelData(1).subarray(i, i + m), m);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / sr), data: plane });
      enc.encode(ad); ad.close();
    }
    await enc.flush(); enc.close(); if (err) throw new Error(err);
    const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    return { rms: +rms.toFixed(3), gain: +gain.toFixed(2), peak: +peak.toFixed(2), meta: meta ? b64(meta) : null, chunks: chunks.map((c) => ({ ts: c.ts, b64: b64(c.d) })) };
  },
};`;

async function install(page) {
  await page.evaluate(IN_PAGE);
}

/** PNG buffer → WebP file, encoded by Chromium on the given page (any file:// page). */
async function writeWebp(page, png, file, quality = 0.84) {
  const has = await page.evaluate(() => !!window.__enc);
  if (!has) await install(page);
  const b64 = await page.evaluate(([b, q]) => window.__enc.webp(b, q), [png.toString("base64"), quality]);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
}

/**
 * Records `frames` frames of the page: for each, calls drawFrame(f) (which must update the page), takes a CDP JPEG
 * screenshot and feeds it to VP9. Returns the encoded chunks; pass them to writeWebm.
 */
async function recordFrames(page, { width, height, fps, frames, bitrate, codec, gop, extra, onFrame, drawFrame }) {
  if (!(await page.evaluate(() => !!window.__enc))) await install(page);
  const pick = (w, h) => (w * h > 1280 * 720 ? "vp09.00.40.08" : "vp09.00.31.08");
  await page.evaluate((cfg) => window.__enc.startVideo(cfg), { codec: codec || pick(width, height), width, height, bitrate, fps, gop: gop || fps * 2, extra: (extra || []).map((e) => ({ ...e, codec: pick(e.width, e.height) })) });
  const cdp = await page.context().newCDPSession(page);
  const outs = [[], ...(extra || []).map(() => [])];
  const take = (lists) => lists.forEach((arr, i) => { for (const c of arr) outs[i].push({ ts: c.ts, key: c.key, data: Buffer.from(c.b64, "base64") }); });
  for (let f = 0; f < frames; f++) {
    await drawFrame(f);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
    await page.evaluate((b) => window.__enc.frame(b), data);
    if (onFrame) await onFrame(f);
    if (f % 48 === 47) take(await page.evaluate(() => window.__enc.drain()));
  }
  take(await page.evaluate(() => window.__enc.finishVideo()));
  await cdp.detach();
  return extra && extra.length ? outs : outs[0];
}

/** MP3 file section → Opus chunks (+ OpusHead if the encoder exposes one). */
async function encodeAudio(page, mp3File, opts) {
  if (!(await page.evaluate(() => !!window.__enc))) await install(page);
  const o = { start: 0, length: 60, fadeIn: 0.25, fadeOut: 2.5, targetRms: 0.13, bitrate: 128000, ...opts };
  const r = await page.evaluate(([b, oo]) => window.__enc.audio(b, oo), [fs.readFileSync(mp3File).toString("base64"), o]);
  return { sampleRate: 48000, channels: 2, codecPrivate: r.meta ? Buffer.from(r.meta, "base64") : null, chunks: r.chunks.map((c) => ({ ts: c.ts, data: Buffer.from(c.b64, "base64") })), level: { rms: r.rms, gain: r.gain, peak: r.peak } };
}

module.exports = { install, writeWebp, recordFrames, encodeAudio, writeWebm };
