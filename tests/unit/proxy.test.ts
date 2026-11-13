import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

function requestWith(id?: string) {
  const headers = id === undefined ? undefined : { "x-request-id": id };
  return new NextRequest("http://localhost/", { headers });
}

describe("proxy request ids", () => {
  it("creates an id when the caller sends none", () => {
    const id = proxy(requestWith()).headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a safe id from the caller", () => {
    expect(proxy(requestWith("trace-123_A.b")).headers.get("x-request-id")).toBe("trace-123_A.b");
  });

  it.each(["", "has space", "semi;colon", "x".repeat(65), "<script>"])(
    "replaces an unsafe id: %j",
    (unsafe) => {
      const id = proxy(requestWith(unsafe)).headers.get("x-request-id");
      expect(id).not.toBe(unsafe);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
