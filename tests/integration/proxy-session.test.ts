import { randomUUID } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

import { LOCAL_API_URL, localPublishableKey, newUser } from "../support/local-stack";

// The proxy with a real session cookie, as @supabase/ssr writes it in the browser.

type Jar = Map<string, string>;

/** Signs in through @supabase/ssr and returns the cookies it set. */
async function signedInCookies(): Promise<Jar> {
  const { email, password } = await newUser("proxy");
  const jar: Jar = new Map();
  const client = createServerClient(LOCAL_API_URL, localPublishableKey(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return jar;
}

interface StoredSession {
  access_token: string;
  expires_at: number;
}

/** Rewrites the stored session in the auth cookie. */
function editSession(jar: Jar, edit: (session: StoredSession) => void): Jar {
  const [[name, value] = []] = [...jar].filter(([key]) => key.endsWith("-auth-token"));
  if (!name || !value?.startsWith("base64-")) throw new Error("unexpected session cookie format");
  const session = JSON.parse(Buffer.from(value.slice(7), "base64url").toString()) as StoredSession;
  edit(session);
  return new Map([[name, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`]]);
}

/** The same session, but with an access token that looks expired, so the proxy must refresh it. */
const expire = (jar: Jar) =>
  editSession(jar, (session) => {
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
  });

/** The same session claiming to be someone else: a new user id, the original signature. */
const forge = (jar: Jar) =>
  editSession(jar, (session) => {
    const [header, payload, signature] = session.access_token.split(".");
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString()) as object;
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString(
      "base64url",
    );
    session.access_token = [header, forged, signature].join(".");
  });

function request(path: string, jar: Jar) {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return new NextRequest(`http://localhost${path}`, { headers: { cookie } });
}

describe("proxy with a session", () => {
  it("lets signed-in people into the app without touching their cookies", async () => {
    const response = await proxy(request("/drive", await signedInCookies()));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("sends signed-in people past the sign-in page", async () => {
    const response = await proxy(request("/sign-in", await signedInCookies()));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/drive");
  });

  it("sends them on to the page they were going to, if it's on this site", async () => {
    const jar = await signedInCookies();
    const kept = await proxy(request("/sign-in?next=%2Fdrive%2Fsettings", jar));
    expect(new URL(kept.headers.get("location") ?? "").pathname).toBe("/drive/settings");
    const refused = await proxy(request("/sign-in?next=%2F..%2F%2Fevil.example", jar));
    expect(refused.headers.get("location")).toBe("http://localhost/drive");
  });

  it("refreshes an expired session, and stops CDNs caching the new cookies", async () => {
    const response = await proxy(request("/drive", expire(await signedInCookies())));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll().some((c) => c.name.endsWith("-auth-token"))).toBe(true);
    expect(response.headers.get("cache-control")).toContain("no-store");
    // Server Components see the refreshed session too, so they never refresh it a second time.
    expect(response.headers.get("x-middleware-request-cookie")).toContain("-auth-token");
  });

  it("keeps the refreshed cookies when it redirects", async () => {
    const response = await proxy(request("/sign-up", expire(await signedInCookies())));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/drive");
    expect(response.cookies.getAll().some((c) => c.name.endsWith("-auth-token"))).toBe(true);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("treats a forged session as signed out", async () => {
    const response = await proxy(request("/drive", forge(await signedInCookies())));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/sign-in");
  });
});
