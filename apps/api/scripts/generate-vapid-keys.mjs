#!/usr/bin/env node
// Prints a fresh Web Push (VAPID) key pair for apps/api/.env. Run it once, on the server:
//   node apps/api/scripts/generate-vapid-keys.mjs >> apps/api/.env
// Never commit the output. Rotating the pair silently ends every existing browser subscription.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
process.stdout.write(`WEB_PUSH_VAPID_PUBLIC_KEY=${point.toString("base64url")}\nWEB_PUSH_VAPID_PRIVATE_KEY=${jwk.d}\n`);
