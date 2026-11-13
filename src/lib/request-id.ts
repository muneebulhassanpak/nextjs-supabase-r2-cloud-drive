/** Header that carries the request ID, set by `src/proxy.ts` and read on the server. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Caller-supplied IDs are kept only if they are short and safe to log. */
export const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
