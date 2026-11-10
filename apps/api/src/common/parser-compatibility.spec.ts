import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { request as httpRequest } from "node:http";
import type { ErrorRequestHandler, RequestHandler } from "express";
import request from "supertest";

// Resolve the actual transitive parsers Nest uses, not a test-only direct dependency.
const platformRequire = createRequire(require.resolve("@nestjs/platform-express/package.json"));
const express = platformRequire("express") as typeof import("express");
const bodyParser = platformRequire("body-parser") as {
  json: (options: { limit: number }) => RequestHandler;
  urlencoded: (options: { extended: boolean; limit: number }) => RequestHandler;
};
const multer = platformRequire("multer") as {
  (options: { storage: unknown; limits: { fileSize: number; files: number; fields: number } }): { single: (field: string) => RequestHandler };
  memoryStorage: () => unknown;
};

describe("patched parser compatibility (isolated HTTP fixtures)", () => {
  const app = express();
  app.post("/json", bodyParser.json({ limit: 64 }), (req, res) => res.json(req.body));
  app.post("/form", bodyParser.urlencoded({ extended: true, limit: 128 }), (req, res) => res.json(req.body));
  app.post("/upload", multer({ storage: multer.memoryStorage(), limits: { fileSize: 8, files: 1, fields: 2 } }).single("file"), (_req, res) => res.json({ ok: true }));
  const errorHandler: ErrorRequestHandler = (error: { status?: number; code?: string }, _req, res, _next) => {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : error.status ?? 400).json({ rejected: true });
  };
  app.use(errorHandler);

  it("loads the pinned patched major-compatible parser versions used by Nest", () => {
    expect(platformRequire("body-parser/package.json").version).toBe("1.20.9");
    expect(platformRequire("multer/package.json").version).toBe("2.5.0");
    const bodyRequire = createRequire(platformRequire.resolve("body-parser/package.json"));
    expect(bodyRequire("qs/package.json").version).toBe("6.16.1");
  });

  it("accepts valid JSON but rejects malformed and oversized bodies", async () => {
    expect((await request(app).post("/json").send({ safe: true }).expect(200)).body).toEqual({ safe: true });
    await request(app).post("/json").set("Content-Type", "application/json").send("{").expect(400);
    await request(app).post("/json").send({ safe: "x".repeat(80) }).expect(413);
  });

  it("keeps the decoded JSON size limit for a small compressed body", async () => {
    // Superagent serializes Buffers as JSON for this content type; send actual gzip bytes instead.
    const server = app.listen(0, "127.0.0.1");
    try {
      if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing fixture server address");
      const payload = gzipSync(Buffer.from(JSON.stringify({ safe: "x".repeat(80) })));
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest({ hostname: "127.0.0.1", port: address.port, path: "/json", method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Content-Length": payload.length } }, (res) => {
          res.resume();
          res.once("end", () => resolve(res.statusCode));
        });
        req.once("error", reject);
        req.end(payload);
      });
      expect(status).toBe(413);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves nested form fields without prototype pollution", async () => {
    const result = await request(app).post("/form").type("form").send("safe[value]=fixture&__proto__[petlifeQA]=invalid").expect(200);
    expect(result.body).toEqual({ safe: { value: "fixture" } });
    expect(Object.prototype).not.toHaveProperty("petlifeQA");
  });

  it("preserves multipart upload handling and configured file limits", async () => {
    await request(app).post("/upload").attach("file", Buffer.from("safe"), "fixture.txt").expect(200);
    await request(app).post("/upload").attach("file", Buffer.from("fixture-too-large"), "fixture.txt").expect(413);
  });
});
