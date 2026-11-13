import "server-only";
import pino from "pino";

import { env } from "@/env";

/** Field names that are never written to logs, wherever they appear in a log object. */
const SECRET_FIELDS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "apikey",
  "secretAccessKey",
  "accessKeyId",
];

/** Structured JSON logs. Never log secrets or personal data. */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "lockerly" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Top level and up to three levels down (e.g. `req.headers.authorization`).
    paths: SECRET_FIELDS.flatMap((field) => [
      field,
      `*.${field}`,
      `*.*.${field}`,
      `*.*.*.${field}`,
    ]),
    censor: "[redacted]",
  },
});
