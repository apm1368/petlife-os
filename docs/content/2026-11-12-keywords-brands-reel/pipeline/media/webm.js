// Minimal WebM (Matroska) writer for WebCodecs output: one VP9 video track, optional Opus audio track.
// Writes SeekHead + Info + Tracks + Clusters (one per video keyframe) + Cues, with known sizes, so browsers can
// seek and show the duration. No dependencies.
const fs = require("fs");

function idBytes(hex) {
  return Buffer.from(hex, "hex");
}

function vint(n) {
  // EBML variable-size integer (data size). Smallest width that fits; all-ones values are reserved.
  for (let w = 1; w <= 8; w++) {
    if (n < 2 ** (7 * w) - 1) {
      const b = Buffer.alloc(w);
      let v = n;
      for (let i = w - 1; i >= 0; i--) {
        b[i] = v % 256;
        v = Math.floor(v / 256);
      }
      b[0] |= 1 << (8 - w);
      return b;
    }
  }
  throw new Error("vint too large");
}

function uintBytes(n, width) {
  const w = width || Math.max(1, Math.ceil(Math.log2(n + 1) / 8));
  const b = Buffer.alloc(w);
  let v = n;
  for (let i = w - 1; i >= 0; i--) {
    b[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return b;
}

const el = (hex, payload) => Buffer.concat([idBytes(hex), vint(payload.length), payload]);
const uint = (hex, n, width) => el(hex, uintBytes(n, width));
const str = (hex, s) => el(hex, Buffer.from(s, "utf8"));
const f64 = (hex, x) => {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(x);
  return el(hex, b);
};

/**
 * @param {string} file output path
 * @param {{width:number,height:number,fps:number,chunks:{ts:number,key:boolean,data:Buffer}[]}} video  ts in µs
 * @param {{sampleRate:number,channels:number,codecPrivate?:Buffer,preSkip?:number,chunks:{ts:number,data:Buffer}[]}=} audio
 */
function writeWebm(file, video, audio) {
  const ms = (us) => Math.round(us / 1000);
  const lastV = video.chunks[video.chunks.length - 1];
  const durationMs = Math.max(ms(lastV.ts) + 1000 / video.fps, audio && audio.chunks.length ? ms(audio.chunks[audio.chunks.length - 1].ts) + 20 : 0);

  const info = el("1549A966", Buffer.concat([uint("2AD7B1", 1000000), str("4D80", "opetlife-pipeline"), str("5741", "opetlife-pipeline webm.js"), f64("4489", durationMs)]));
  const videoTrack = el("AE", Buffer.concat([
    uint("D7", 1), uint("73C5", 1), uint("83", 1), str("86", "V_VP9"), uint("9C", 0),
    uint("23E383", Math.round(1e9 / video.fps)),
    el("E0", Buffer.concat([uint("B0", video.width), uint("BA", video.height)])),
  ]));
  let audioTrack = Buffer.alloc(0);
  if (audio) {
    const preSkip = audio.preSkip ?? 312;
    let priv = audio.codecPrivate;
    if (!priv || !priv.length) {
      priv = Buffer.alloc(19);
      priv.write("OpusHead", 0, "ascii");
      priv[8] = 1;
      priv[9] = audio.channels;
      priv.writeUInt16LE(preSkip, 10);
      priv.writeUInt32LE(audio.sampleRate, 12);
      priv.writeInt16LE(0, 16);
      priv[18] = 0;
    }
    const skip = priv.readUInt16LE(10);
    audioTrack = el("AE", Buffer.concat([
      uint("D7", 2), uint("73C5", 2), uint("83", 2), str("86", "A_OPUS"), uint("9C", 0),
      el("63A2", priv), uint("56AA", Math.round((skip / 48000) * 1e9)), uint("56BB", 80000000),
      el("E1", Buffer.concat([f64("B5", audio.sampleRate), uint("9F", audio.channels)])),
    ]));
  }
  const tracks = el("1654AE6B", Buffer.concat([videoTrack, audioTrack]));

  // Clusters: a new cluster at every video keyframe; audio blocks interleaved by timestamp.
  const events = video.chunks.map((c) => ({ kind: "v", ...c }));
  if (audio) for (const c of audio.chunks) events.push({ kind: "a", key: true, ...c });
  events.sort((a, b) => a.ts - b.ts || (a.kind === "v" ? -1 : 1));
  const clusters = [];
  let cur = null;
  for (const e of events) {
    const t = ms(e.ts);
    if (e.kind === "v" && e.key) {
      cur = { start: t, blocks: [] };
      clusters.push(cur);
    }
    if (!cur) {
      cur = { start: t, blocks: [] };
      clusters.push(cur);
    }
    if (t - cur.start > 32000) throw new Error("cluster too long: add keyframes");
    const head = Buffer.alloc(4);
    head[0] = 0x80 | (e.kind === "v" ? 1 : 2);
    head.writeInt16BE(t - cur.start, 1);
    head[3] = e.key ? 0x80 : 0x00;
    cur.blocks.push(el("A3", Buffer.concat([head, e.data])));
  }
  const clusterBufs = clusters.map((c) => el("1F43B675", Buffer.concat([uint("E7", c.start), ...c.blocks])));

  // Layout inside the Segment: SeekHead (fixed size) | Info | Tracks | Clusters | Cues
  const seekEntry = (hexId, pos) => el("4DBB", Buffer.concat([el("53AB", idBytes(hexId)), uint("53AC", pos, 8)]));
  const seekHeadSize = el("114D9B74", Buffer.concat([seekEntry("1549A966", 0), seekEntry("1654AE6B", 0), seekEntry("1C53BB6B", 0)])).length;
  const infoPos = seekHeadSize;
  const tracksPos = infoPos + info.length;
  let pos = tracksPos + tracks.length;
  const cuePoints = [];
  clusters.forEach((c, i) => {
    cuePoints.push(el("BB", Buffer.concat([uint("B3", c.start), el("B7", Buffer.concat([uint("F7", 1), uint("F1", pos, 8)]))])));
    pos += clusterBufs[i].length;
  });
  const cuesPos = pos;
  const cues = el("1C53BB6B", Buffer.concat(cuePoints));
  const seekHead = el("114D9B74", Buffer.concat([seekEntry("1549A966", infoPos), seekEntry("1654AE6B", tracksPos), seekEntry("1C53BB6B", cuesPos)]));
  if (seekHead.length !== seekHeadSize) throw new Error("seek head size changed");

  const ebml = el("1A45DFA3", Buffer.concat([uint("4286", 1), uint("42F7", 1), uint("42F2", 4), uint("42F3", 8), str("4282", "webm"), uint("4287", 4), uint("4285", 2)]));
  const segmentBody = Buffer.concat([seekHead, info, tracks, ...clusterBufs, cues]);
  const segment = Buffer.concat([idBytes("18538067"), vint(segmentBody.length), segmentBody]);
  fs.writeFileSync(file, Buffer.concat([ebml, segment]));
  return { bytes: ebml.length + segment.length, durationMs, clusters: clusters.length };
}

module.exports = { writeWebm };
