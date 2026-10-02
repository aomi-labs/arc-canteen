import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function extractBearerToken(req: IncomingMessage) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export function bearerMatches(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
