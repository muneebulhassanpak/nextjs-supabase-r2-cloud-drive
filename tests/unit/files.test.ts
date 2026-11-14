import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  contentDisposition,
  copyNamesPattern,
  isAvatarType,
  normaliseContentType,
  responseHeaders,
  uniqueName,
} from "@/lib/files/rules";
import { readJson } from "@/server/http";
import { signDownload, signUpload } from "@/server/storage/objects";

describe("normaliseContentType", () => {
  it.each([
    ["Application/PDF", "a.pdf", "application/pdf"],
    ["text/plain; charset=utf-8", "a.txt", "text/plain"],
    ["", "README.md", "text/markdown"],
    ["", "archive.7z", "application/x-7z-compressed"],
    ["", "no-extension", "application/octet-stream"],
    ["not a type", "x.bin", "application/octet-stream"],
    ["image/png<script>", "x.png", "application/octet-stream"],
  ])("%j for %s → %s", (type, name, expected) => {
    expect(normaliseContentType(type, name)).toBe(expected);
  });
});

describe("responseHeaders (T11: stored XSS)", () => {
  it.each(["text/html", "image/svg+xml", "application/xml", "application/x-unknown"])(
    "always downloads %s as opaque bytes, even when asked to show it",
    (type) => {
      const headers = responseHeaders(type, "x", "inline");
      expect(headers.contentType).toBe("application/octet-stream");
      expect(headers.contentDisposition).toMatch(/^attachment;/);
    },
  );

  it("shows safe types inline when asked, and downloads them otherwise", () => {
    expect(responseHeaders("image/png", "a.png", "inline")).toEqual({
      contentType: "image/png",
      contentDisposition: `inline; filename="a.png"; filename*=UTF-8''a.png`,
    });
    expect(responseHeaders("application/pdf", "a.pdf", "attachment").contentDisposition).toMatch(
      /^attachment;/,
    );
  });

  it.each(["text/markdown", "text/xml", "text/javascript"])(
    "shows %s as plain text, which browsers never run",
    (type) => {
      expect(responseHeaders(type, "a", "inline").contentType).toBe("text/plain; charset=utf-8");
    },
  );
});

describe("contentDisposition", () => {
  it("keeps any name: ASCII fallback plus the exact UTF-8 name", () => {
    expect(contentDisposition("attachment", 'Ünïcode "quoted" (1).txt')).toBe(
      `attachment; filename="Unicode quoted (1).txt"; filename*=UTF-8''%C3%9Cn%C3%AFcode%20%22quoted%22%20%281%29.txt`,
    );
    expect(contentDisposition("inline", "日本.pdf")).toBe(
      `inline; filename=".pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.pdf`,
    );
    expect(contentDisposition("inline", "日本")).toMatch(/^inline; filename="download";/);
  });
});

describe("uniqueName", () => {
  const taken = new Set(["report.pdf", "report (1).pdf", ".env", "notes"]);
  it.each([
    ["new.pdf", "new.pdf"],
    ["Report.PDF", "Report (2).PDF"],
    [".env", ".env (1)"],
    ["notes", "notes (1)"],
  ])("%s → %s", (name, expected) => {
    expect(uniqueName(name, taken)).toBe(expected);
  });

  it("shortens a long name so the copy fits 255 characters, counting as Postgres does", () => {
    const long = `${"é".repeat(250)}.pdf`;
    expect(uniqueName(long, new Set([long.toLowerCase()]))).toBe(`${"é".repeat(247)} (1).pdf`);
    const emoji = "😀".repeat(255);
    expect(Array.from(uniqueName(emoji, new Set([emoji])))).toHaveLength(255);
  });
});

describe("copyNamesPattern", () => {
  it("matches copies of a name, escaping LIKE's special characters", () => {
    expect(copyNamesPattern("report.pdf")).toBe("report% (%).pdf");
    expect(copyNamesPattern("100%_done")).toBe("100\\%\\_done% (%)");
    expect(copyNamesPattern(".env")).toBe(".env% (%)");
  });
});

describe("isAvatarType", () => {
  it("accepts common raster images only", () => {
    expect(isAvatarType("image/webp")).toBe(true);
    expect(isAvatarType("image/svg+xml")).toBe(false);
    expect(isAvatarType("text/html")).toBe(false);
  });
});

describe("signed links (T4: leaked links)", () => {
  it("lets an upload link write one object, of one size and type, for 5 minutes", async () => {
    const { url, method, headers } = await signUpload("u/x/y", 1234, "image/png");
    const params = new URL(url).searchParams;
    expect(method).toBe("PUT");
    expect(headers).toEqual({ "content-type": "image/png" });
    expect(params.get("X-Amz-Expires")).toBe("300");
    expect(params.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    // No checksum of an empty body, which a real upload would never match.
    expect([...params.keys()].filter((k) => k.toLowerCase().includes("checksum"))).toEqual([]);
  });

  it("lets a download link read for 60 seconds, with headers chosen by the server", async () => {
    const url = new URL(
      await signDownload("u/x/y", { name: "a.html", mimeType: "text/html" }, "inline"),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("response-content-type")).toBe("application/octet-stream");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
  });
});

describe("readJson", () => {
  const schema = z.object({ size: z.number() });
  const request = (body: string, type = "application/json") =>
    new Request("http://x", { method: "POST", body, headers: { "content-type": type } });

  it("parses and checks a JSON body", async () => {
    await expect(readJson(request('{"size":1}'), schema)).resolves.toEqual({ size: 1 });
  });

  it("refuses other content types, which a cross-site form could send without a preflight", async () => {
    await expect(readJson(request('{"size":1}', "text/plain"), schema)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("refuses broken JSON and the wrong shape", async () => {
    await expect(readJson(request("{"), schema)).rejects.toMatchObject({ status: 422 });
    await expect(readJson(request('{"size":"1"}'), schema)).rejects.toMatchObject({
      status: 422,
      details: { size: expect.any(Array) as unknown },
    });
  });
});

describe("assertCron", () => {
  const call = (authorization?: string) =>
    new Request("http://x", authorization ? { headers: { authorization } } : {});

  it("accepts only the configured secret, and nothing when none is set", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "s".repeat(40));
    const { assertCron } = await import("@/server/cron");
    expect(() => {
      assertCron(call(`Bearer ${"s".repeat(40)}`));
    }).not.toThrow();
    for (const header of [undefined, "Bearer wrong", `bearer ${"s".repeat(40)}`, "s".repeat(40)]) {
      expect(() => {
        assertCron(call(header));
      }).toThrow("Not allowed.");
    }

    vi.resetModules();
    vi.unstubAllEnvs();
    const unset = await import("@/server/cron");
    expect(() => {
      unset.assertCron(call("Bearer "));
    }).toThrow("Not allowed.");
  });
});
