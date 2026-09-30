import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Pool } from "pg";
import { buildApp } from "../app";
import { Auth } from "../auth";
import { loadConfig } from "../config";
import { migrate } from "../db";

export const ORIGIN = "https://namlab.test";

/**
 * Gerçek PostgreSQL üzerinde, her test dosyası için ayrı bir şemada tam API ayağa kaldırır.
 * TEST_DATABASE_URL tanımlı değilse bu testler atlanır (bkz. README > Geliştirme).
 */
export async function startHarness(databaseUrl: string) {
  const schema = "test_" + randomBytes(6).toString("hex");
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 5, options: `-c search_path=${schema}` });
  await migrate(pool);

  const config = loadConfig({
    DATABASE_URL: databaseUrl,
    APP_ORIGIN: ORIGIN,
  });
  const auth = new Auth(pool, { idleMs: 3600_000, absoluteMs: 86400_000 });
  const app = buildApp({ config, pool, auth, version: { version: "test", commit: "", startedAt: "" } });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  await auth.createUser("tester", "test-sifresi-123", "yonetici");

  /** Giriş yapar, oturum çerezini döner (başarısızsa hata fırlatır). */
  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(base + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`Test girişi başarısız (${username}): ${res.status}`);
    return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  }

  /** Verilen oturumla istek atan fonksiyon; JSON gövdeyi kendisi serileştirir. */
  function caller(cookie: string) {
    return async function call<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
      const isForm = body instanceof FormData;
      const res = await fetch(base + path, {
        method,
        headers: {
          cookie,
          origin: ORIGIN,
          ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
      const text = await res.text();
      let data: any = text;
      try {
        data = JSON.parse(text);
      } catch {}
      return { status: res.status, data: data as T, headers: res.headers };
    };
  }

  /** Yönetici ("tester") oturumuyla istek. */
  const call = caller(await login("tester", "test-sifresi-123"));

  /** Başka bir kullanıcı olarak giriş yapıp o oturumla istek atan fonksiyon döner. */
  async function loginAs(username: string, password: string) {
    return caller(await login(username, password));
  }

  async function close() {
    await new Promise((r) => server.close(r));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }

  return { base, pool, auth, call, login, loginAs, close };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;
