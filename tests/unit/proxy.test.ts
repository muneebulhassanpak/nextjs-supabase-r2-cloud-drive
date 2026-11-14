import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

// No session cookie, so the session check needs no network: these run without the local stack.
// Signed-in behaviour is covered end to end (e2e/auth.spec.ts).

function request(path = "/", id?: string) {
  const headers = id === undefined ? undefined : { "x-request-id": id };
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy request ids", () => {
  it("creates an id when the caller sends none", async () => {
    const id = (await proxy(request())).headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a safe id from the caller", async () => {
    const response = await proxy(request("/", "trace-123_A.b"));
    expect(response.headers.get("x-request-id")).toBe("trace-123_A.b");
  });

  it.each(["", "has space", "semi;colon", "x".repeat(65), "<script>"])(
    "replaces an unsafe id: %j",
    async (unsafe) => {
      const id = (await proxy(request("/", unsafe))).headers.get("x-request-id");
      expect(id).not.toBe(unsafe);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});

describe("proxy route guards for signed-out visitors", () => {
  it.each(["/drive", "/drive/trash", "/drive/settings"])("sends %s to sign in", async (path) => {
    const response = await proxy(request(path));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe(path);
  });

  it("keeps the query string in the page to come back to", async () => {
    const response = await proxy(request("/drive/recent?sort=name"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/drive/recent?sort=name");
  });

  it("keeps the request id on redirects", async () => {
    const response = await proxy(request("/drive", "trace-1"));
    expect(response.headers.get("x-request-id")).toBe("trace-1");
  });

  it("sends the new-password page to the reset form when there's no reset session", async () => {
    const response = await proxy(request("/reset-password"));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/forgot-password");
  });

  it("leaves Server Actions to check the session themselves", async () => {
    const action = new NextRequest("http://localhost/drive/settings", {
      method: "POST",
      headers: { "next-action": "abc123" },
    });
    expect((await proxy(action)).headers.get("location")).toBeNull();
  });

  it.each(["/", "/sign-in", "/sign-up", "/forgot-password", "/drivefoo", "/api/health"])(
    "lets %s through",
    async (path) => {
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
    },
  );
});
