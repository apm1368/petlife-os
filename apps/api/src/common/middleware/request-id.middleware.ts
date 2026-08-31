import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers["x-request-id"];
    req.requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  }
}
