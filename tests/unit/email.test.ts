import { afterEach, describe, expect, it, vi } from "vitest";

// The API key is read from the validated settings; each test picks whether there is one.
const settings = vi.hoisted(() => ({
  LOG_LEVEL: "silent",
  RESEND_API_KEY: undefined as string | undefined,
}));
vi.mock("@/env", () => ({ env: settings }));

const { escapeHtml, sendEmail } = await import("@/server/email");

const email = { to: "a@test.dev", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    settings.RESEND_API_KEY = undefined;
  });

  it("only logs the email when there's no API key (local)", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await sendEmail(email);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends it through Resend with the key", async () => {
    settings.RESEND_API_KEY = "re_test_key";
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendEmail(email);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ authorization: "Bearer re_test_key" });
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body).toMatchObject(email);
    expect(body.from).toContain("Lockerly");
  });

  it("throws when Resend refuses it", async () => {
    settings.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 422 })));
    await expect(sendEmail(email)).rejects.toThrow("Resend refused the email (422)");
  });
});

describe("escapeHtml", () => {
  it("makes names safe to put in HTML", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
  });
});
