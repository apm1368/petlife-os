/**
 * The reel's instrumental soundtrack. CC0 1.0 (public domain dedication): commercial use without attribution is allowed;
 * we credit it on /credits anyway. 48 s from 0:12 of the original, faded in/out and re-encoded to 64 kbps Opus (WebM).
 */
export const REEL_TRACK = {
  src: "/audio/reel-toy-box.webm",
  mime: 'audio/webm; codecs="opus"',
  title: "Toy Box",
  author: "HoliznaCC0",
  album: "Spring Woke Me Up",
  page: "https://freemusicarchive.org/music/holiznacc0/spring-woke-me-up/toy-box/",
  license: "CC0 1.0 Universal",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
} as const;

/**
 * Soundtrack of the one-minute video "10 searches of dog and cat owners" (blog hub article + social platforms).
 * CC0 1.0: 60 s from 0:08 of the original, faded out, encoded to Opus inside the video file. Credited on /credits.
 */
export const VIDEO_REEL_TRACK = {
  title: "Happy Dance",
  author: "HoliznaCC0",
  album: "Power Pop",
  page: "https://freemusicarchive.org/music/holiznacc0/power-pop/happy-dance-2/",
  license: "CC0 1.0 Universal",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
} as const;
