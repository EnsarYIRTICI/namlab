import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(4300), // docker compose içinde 4000 verilir
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL gerekli"),

  // Tarayıcının bu API'ye eriştiği adres (CSRF Origin kontrolü). Örn: https://namlab.ornek.com
  APP_ORIGIN: z.string().url().optional(),
  // 1 ise ilk proxy'ye (host nginx) güvenilir: gerçek IP + HTTPS bilgisi
  TRUST_PROXY: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),

  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  SESSION_IDLE_HOURS: z.coerce.number().positive().default(12),
  SESSION_MAX_DAYS: z.coerce.number().positive().default(7),
  GIT_COMMIT: z.string().default(""),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Compose boş değişkenleri "" olarak geçirir; bunları tanımsız say.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== "") cleaned[k] = v;
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error("Geçersiz yapılandırma:\n" + msg);
  }
  return parsed.data;
}
