import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ayarlariOku } from "../ayarlar";
import { barkodHata, gtinGecerli, miktarOku, normBarkod } from "../barkod";
import type { Deps } from "../deps";
import { kaydet } from "../islemKaydi";
import { kodla, txtMetni, type TxtSatir } from "../txt";
import { xlsxYaz } from "../xlsx";
import { requireAdmin } from "./yonetim";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const temiz = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function ilkHata(e: z.ZodError): string {
  const i = e.issues[0];
  return i?.message && !i.message.startsWith("Invalid") ? i.message : "Geçersiz istek.";
}

interface SayimSatir {
  id: string;
  ad: string;
  aciklama: string;
  durum: "acik" | "kapali";
  olusturan: string | null;
  olusturma: Date;
  kapatan: string | null;
  kapanma: Date | null;
}

/** Türkiye saatiyle "28.09.2026 21:50" */
function trZaman(d: Date): string {
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
}

/** Dosya adı için güvenli parça: "Reyon 3 / Kasa" → "Reyon-3-Kasa" */
function dosyaAdi(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .slice(0, 60) || "sayim"
  );
}

/** RFC 5987: Türkçe karakterli dosya adı + ASCII yedek */
function indirmeBasligi(ad: string): string {
  const tr: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
  const ascii = ad
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => tr[c]!)
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(ad)}`;
}

export function sayimlarRoutes(d: Deps): Router {
  const r = Router();

  async function sayimBul(id: string): Promise<SayimSatir | null> {
    if (!UUID_RE.test(id)) return null;
    return ((await d.pool.query("SELECT * FROM sayimlar WHERE id = $1", [id])).rows[0] as SayimSatir) ?? null;
  }

  /** Barkod başına toplamlar (ürün adıyla). Sıra: en son okutulan önce. */
  const okutmaSirasi = (a: { ilkZaman: Date; ilkId: number }, b: { ilkZaman: Date; ilkId: number }) =>
    a.ilkZaman.getTime() - b.ilkZaman.getTime() || a.ilkId - b.ilkId;

  async function toplamlar(sayimId: string, barkodlar?: string[]) {
    const rows = (
      await d.pool.query(
        `SELECT o.barkod, SUM(o.miktar)::float8 AS miktar, COUNT(*)::int AS okutma, MAX(o.zaman) AS "sonZaman",
                MIN(o.zaman) AS "ilkZaman", MIN(o.id)::float8 AS "ilkId", COALESCE(u.ad, '') AS ad, COALESCE(u.kod, '') AS kod, (u.barkod IS NOT NULL) AS "listede",
                string_agg(DISTINCT o.kullanici, ', ') AS kullanicilar
           FROM okutmalar o LEFT JOIN urunler u ON u.barkod = o.barkod
          WHERE o.sayim_id = $1 ${barkodlar ? "AND o.barkod = ANY($2)" : ""}
          GROUP BY o.barkod, u.barkod, u.ad, u.kod
          ORDER BY MAX(o.id) DESC`,
        barkodlar ? [sayimId, barkodlar] : [sayimId],
      )
    ).rows as {
      barkod: string;
      miktar: number;
      okutma: number;
      sonZaman: Date;
      ilkZaman: Date;
      ilkId: number;
      ad: string;
      kod: string;
      listede: boolean;
      kullanicilar: string | null;
    }[];
    return rows.map((x) => ({ ...x, kontrolHatali: gtinGecerli(x.barkod) === false }));
  }

  // ---------- Sayımlar ----------

  r.get("/sayimlar", async (req, res) => {
    const durum = req.query.durum === "kapali" ? "kapali" : req.query.durum === "tumu" ? null : "acik";
    const rows = (
      await d.pool.query(
        `SELECT s.*, COALESCE(x.okutma, 0)::int AS okutma, COALESCE(x.cesit, 0)::int AS cesit,
                COALESCE(x.toplam, 0)::float8 AS toplam, x.son AS "sonOkutma", x.kisiler
           FROM sayimlar s
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS okutma, COUNT(DISTINCT barkod) AS cesit, SUM(miktar) AS toplam, MAX(zaman) AS son,
                    string_agg(DISTINCT kullanici, ', ') AS kisiler
               FROM okutmalar o WHERE o.sayim_id = s.id
           ) x ON true
          ${durum ? "WHERE s.durum = $1" : ""}
          ORDER BY s.olusturma DESC LIMIT 200`,
        durum ? [durum] : [],
      )
    ).rows;
    res.json(rows);
  });

  const yeniSayimSchema = z.object({ ad: z.unknown().optional(), aciklama: z.unknown().optional() });

  r.post("/sayimlar", async (req, res) => {
    const b = yeniSayimSchema.safeParse(req.body ?? {});
    if (!b.success) {
      res.status(400).json({ error: ilkHata(b.error) });
      return;
    }
    const ad = temiz(b.data.ad, 100) || "Sayım " + trZaman(new Date());
    const s = (
      await d.pool.query("INSERT INTO sayimlar (ad, aciklama, olusturan) VALUES ($1, $2, $3) RETURNING *", [
        ad,
        temiz(b.data.aciklama, 500),
        req.user!.username,
      ])
    ).rows[0] as SayimSatir;
    await kaydet(d.pool, req, "sayim_ac", { sayim: s.ad });
    res.status(201).json(s);
  });

  r.get("/sayimlar/:id", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    const satirlar = await toplamlar(s.id);
    const ozet = {
      cesit: satirlar.length,
      okutma: satirlar.reduce((n, x) => n + x.okutma, 0),
      toplam: Math.round(satirlar.reduce((n, x) => n + x.miktar, 0) * 1000) / 1000,
      listedeYok: satirlar.filter((x) => !x.listede).length,
    };
    res.json({ sayim: s, ozet, satirlar });
  });

  const sayimGuncelleSchema = z
    .object({ ad: z.unknown().optional(), aciklama: z.unknown().optional(), durum: z.enum(["acik", "kapali"]).optional() })
    .strict();

  r.patch("/sayimlar/:id", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    const b = sayimGuncelleSchema.safeParse(req.body ?? {});
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    if (!b.success) {
      res.status(400).json({ error: ilkHata(b.error) });
      return;
    }
    const u = req.user!.username;
    if (b.data.ad !== undefined || b.data.aciklama !== undefined) {
      const ad = b.data.ad !== undefined ? temiz(b.data.ad, 100) : s.ad;
      if (!ad) {
        res.status(400).json({ error: "Sayım adı boş olamaz." });
        return;
      }
      const aciklama = b.data.aciklama !== undefined ? temiz(b.data.aciklama, 500) : s.aciklama;
      if (ad !== s.ad || aciklama !== s.aciklama) {
        await d.pool.query("UPDATE sayimlar SET ad = $1, aciklama = $2 WHERE id = $3", [ad, aciklama, s.id]);
        await kaydet(d.pool, req, "sayim_guncelle", { sayim: ad, eskiAd: ad !== s.ad ? s.ad : undefined });
      }
    }
    if (b.data.durum && b.data.durum !== s.durum) {
      // Kapatmayı herkes yapabilir; kapalı sayımı yeniden açmak (sonradan okutma eklemek) yöneticinin işi.
      if (b.data.durum === "acik" && req.user!.rol !== "yonetici") {
        res.status(403).json({ error: "Kapalı sayımı sadece yönetici yeniden açabilir." });
        return;
      }
      if (b.data.durum === "kapali") {
        await d.pool.query("UPDATE sayimlar SET durum = 'kapali', kapatan = $1, kapanma = now() WHERE id = $2", [u, s.id]);
        await kaydet(d.pool, req, "sayim_kapat", { sayim: s.ad });
      } else {
        await d.pool.query("UPDATE sayimlar SET durum = 'acik', kapatan = NULL, kapanma = NULL WHERE id = $1", [s.id]);
        await kaydet(d.pool, req, "sayim_yeniden_ac", { sayim: s.ad });
      }
    }
    res.json(await sayimBul(s.id));
  });

  r.delete("/sayimlar/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const s = UUID_RE.test(id)
      ? (await d.pool.query("DELETE FROM sayimlar WHERE id = $1 RETURNING ad", [id])).rows[0]
      : undefined;
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    await kaydet(d.pool, req, "sayim_sil", { sayim: s.ad });
    res.json({ ok: true });
  });

  // ---------- Okutmalar ----------

  const okutmaSchema = z.object({
    okutmalar: z
      .array(
        z.object({
          istemciId: z.string().regex(UUID_RE, "Geçersiz okutma kimliği."),
          barkod: z.unknown(),
          miktar: z.unknown(),
          zaman: z.unknown().optional(),
        }),
      )
      .min(1)
      .max(500, "Tek seferde en fazla 500 okutma gönderilebilir."),
  });

  /**
   * Telefon okutmaları toplu gönderir (bağlantı yokken biriktirip sonra da gönderebilir). Aynı istemciId ikinci kez
   * gelirse yazılmaz ("tekrar" sayılır) — bağlantı cevap gelmeden koptuysa telefon güvenle yeniden gönderir.
   * Geçersiz satırlar "hatali" olarak döner; geçerliler yine yazılır.
   */
  r.post("/sayimlar/:id/okutmalar", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    if (s.durum !== "acik") {
      res.status(409).json({ error: "Bu sayım kapatılmış, okutma eklenemez." });
      return;
    }
    const b = okutmaSchema.safeParse(req.body ?? {});
    if (!b.success) {
      res.status(400).json({ error: ilkHata(b.error) });
      return;
    }
    const simdi = Date.now();
    const gecerli: { istemciId: string; barkod: string; miktar: number; zaman: Date }[] = [];
    const hatali: { istemciId: string; mesaj: string }[] = [];
    for (const o of b.data.okutmalar) {
      const barkod = normBarkod(o.barkod);
      const bh = barkodHata(barkod);
      const miktar = miktarOku(o.miktar);
      if (bh || miktar === null) {
        hatali.push({ istemciId: o.istemciId, mesaj: bh ?? "Geçersiz miktar." });
        continue;
      }
      // Telefonun saati: 7 günden eski ya da 5 dakikadan ileri ise sunucu saati kullanılır
      const t = typeof o.zaman === "string" || typeof o.zaman === "number" ? new Date(o.zaman).getTime() : NaN;
      const zaman = Number.isFinite(t) && t > simdi - 7 * 86400_000 && t < simdi + 5 * 60_000 ? new Date(t) : new Date(simdi);
      gecerli.push({ istemciId: o.istemciId, barkod, miktar, zaman });
    }
    let eklenen: string[] = [];
    if (gecerli.length) {
      eklenen = (
        await d.pool.query(
          `INSERT INTO okutmalar (sayim_id, barkod, miktar, kullanici, zaman, istemci_id)
           SELECT $1, x.barkod, x.miktar, $2, x.zaman, x.istemci_id
             FROM unnest($3::text[], $4::numeric[], $5::timestamptz[], $6::uuid[]) AS x(barkod, miktar, zaman, istemci_id)
           ON CONFLICT (istemci_id) DO NOTHING
           RETURNING istemci_id::text`,
          [
            s.id,
            req.user!.username,
            gecerli.map((g) => g.barkod),
            gecerli.map((g) => g.miktar),
            gecerli.map((g) => g.zaman.toISOString()),
            gecerli.map((g) => g.istemciId),
          ],
        )
      ).rows.map((x) => x.istemci_id as string);
    }
    const barkodlar = [...new Set(gecerli.map((g) => g.barkod))];
    res.json({
      eklenen: eklenen.length,
      tekrar: gecerli.length - eklenen.length,
      alinan: gecerli.map((g) => g.istemciId), // yeni eklenen + daha önce alınmış: telefon kuyruğundan silinebilir
      hatali,
      toplamlar: barkodlar.length ? await toplamlar(s.id, barkodlar) : [],
    });
  });

  /** Bir sayımın okutmaları, en yeni önce (barkoda göre süzülebilir). */
  r.get("/sayimlar/:id/okutmalar", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    const q = z
      .object({
        barkod: z.string().max(64).optional(),
        once: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(500).catch(100),
      })
      .parse(req.query);
    const p: unknown[] = [s.id];
    let kosul = "";
    if (q.barkod) {
      p.push(normBarkod(q.barkod));
      kosul += ` AND o.barkod = $${p.length}`;
    }
    if (q.once) {
      p.push(q.once);
      kosul += ` AND o.id < $${p.length}`;
    }
    p.push(q.limit + 1);
    const rows = (
      await d.pool.query(
        `SELECT o.id::text AS id, o.barkod, o.miktar::float8 AS miktar, o.kullanici, o.zaman, COALESCE(u.ad, '') AS ad
           FROM okutmalar o LEFT JOIN urunler u ON u.barkod = o.barkod
          WHERE o.sayim_id = $1${kosul} ORDER BY o.id DESC LIMIT $${p.length}`,
        p,
      )
    ).rows;
    res.json({ items: rows.slice(0, q.limit), dahaVar: rows.length > q.limit });
  });

  /** Okutmayı düzeltme / silme: kendi okutması ya da yönetici; sayım açık olmalı. */
  async function okutmaYetki(req: Request, res: Response) {
    // /okutmalar/:id (sunucu kimliği) ya da /okutmalar/istemci/:iid (telefonun ürettiği kimlik, "geri al" için)
    const iid = req.params.iid ? String(req.params.iid) : null;
    const id = Number(req.params.id);
    if (iid ? !UUID_RE.test(iid) : !Number.isSafeInteger(id) || id <= 0) {
      res.status(404).json({ error: "Okutma bulunamadı." });
      return null;
    }
    const o = (
      await d.pool.query(
        `SELECT o.id, o.barkod, o.miktar::float8 AS miktar, o.kullanici, o.sayim_id, s.durum, s.ad AS sayim
           FROM okutmalar o JOIN sayimlar s ON s.id = o.sayim_id WHERE ${iid ? "o.istemci_id = $1" : "o.id = $1"}`,
        [iid ?? id],
      )
    ).rows[0] as { id: number; barkod: string; miktar: number; kullanici: string; sayim_id: string; durum: string; sayim: string } | undefined;
    if (!o) {
      res.status(404).json({ error: "Okutma bulunamadı." });
      return null;
    }
    if (o.durum !== "acik") {
      res.status(409).json({ error: "Sayım kapatılmış, okutmalar değiştirilemez." });
      return null;
    }
    if (o.kullanici !== req.user!.username && req.user!.rol !== "yonetici") {
      res.status(403).json({ error: "Başkasının okutmasını sadece yönetici değiştirebilir." });
      return null;
    }
    return o;
  }

  r.patch("/okutmalar/:id", async (req, res) => {
    const o = await okutmaYetki(req, res);
    if (!o) return;
    const miktar = miktarOku((req.body ?? {}).miktar);
    if (miktar === null) {
      res.status(400).json({ error: "Geçersiz miktar (0'dan büyük, en fazla 3 ondalık)." });
      return;
    }
    await d.pool.query("UPDATE okutmalar SET miktar = $1 WHERE id = $2", [miktar, o.id]);
    await kaydet(d.pool, req, "okutma_duzelt", { sayim: o.sayim, barkod: o.barkod, eski: o.miktar, yeni: miktar, sahibi: o.kullanici });
    res.json({ ok: true, toplamlar: await toplamlar(o.sayim_id, [o.barkod]) });
  });

  const okutmaSil = async (req: Request, res: Response) => {
    const o = await okutmaYetki(req, res);
    if (!o) return;
    await d.pool.query("DELETE FROM okutmalar WHERE id = $1", [o.id]);
    await kaydet(d.pool, req, "okutma_sil", { sayim: o.sayim, barkod: o.barkod, miktar: o.miktar, sahibi: o.kullanici });
    res.json({ ok: true, toplamlar: await toplamlar(o.sayim_id, [o.barkod]) });
  };
  r.delete("/okutmalar/istemci/:iid", okutmaSil);
  r.delete("/okutmalar/:id", okutmaSil);

  // ---------- Dışa aktarma ----------

  async function disaAktarVerisi(s: SayimSatir, toplu: boolean): Promise<TxtSatir[]> {
    if (toplu) {
      return (await toplamlar(s.id))
        .sort(okutmaSirasi) // ilk okutma sırasına göre (terminaldeki gibi)
        .map((x) => ({ barkod: x.barkod, miktar: x.miktar, ad: x.ad, kod: x.kod, zaman: x.sonZaman, kullanici: x.kullanicilar ?? "" }));
    }
    return (
      await d.pool.query(
        `SELECT o.barkod, o.miktar::float8 AS miktar, COALESCE(u.ad, '') AS ad, COALESCE(u.kod, '') AS kod, o.zaman,
                COALESCE(o.kullanici, '') AS kullanici
           FROM okutmalar o LEFT JOIN urunler u ON u.barkod = o.barkod WHERE o.sayim_id = $1 ORDER BY o.zaman, o.id`,
        [s.id],
      )
    ).rows as TxtSatir[];
  }

  r.get("/sayimlar/:id/disa-aktar.txt", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    const a = await ayarlariOku(d.pool);
    const satirlar = await disaAktarVerisi(s, a.txtToplu);
    const buf = kodla(txtMetni(satirlar, a, { sayim: s.ad, tarih: new Date() }), a.txtKodlama);
    await kaydet(d.pool, req, "sayim_disa_aktar", { sayim: s.ad, bicim: "txt", satir: satirlar.length });
    res.set({
      "Content-Type": `text/plain; charset=${a.txtKodlama === "windows-1254" ? "windows-1254" : "utf-8"}`,
      "Content-Disposition": indirmeBasligi(dosyaAdi(s.ad) + ".txt"),
    });
    res.send(buf);
  });

  r.get("/sayimlar/:id/disa-aktar.xlsx", async (req, res) => {
    const s = await sayimBul(String(req.params.id));
    if (!s) {
      res.status(404).json({ error: "Sayım bulunamadı." });
      return;
    }
    const satirlar = await toplamlar(s.id);
    satirlar.sort(okutmaSirasi);
    const buf = xlsxYaz(
      "Sayım",
      ["Barkod", "Ürün adı", "Stok kodu", "Miktar", "Okutma sayısı", "Son okutma", "Okutan", "Not"],
      satirlar.map((x) => [
        x.barkod,
        x.ad,
        x.kod,
        x.miktar,
        x.okutma,
        trZaman(x.sonZaman),
        x.kullanicilar ?? "",
        [!x.listede ? "Ürün listesinde yok" : "", x.kontrolHatali ? "Kontrol hanesi hatalı" : ""].filter(Boolean).join(", "),
      ]),
      [16, 40, 14, 10, 8, 16, 16, 30],
    );
    await kaydet(d.pool, req, "sayim_disa_aktar", { sayim: s.ad, bicim: "xlsx", satir: satirlar.length });
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": indirmeBasligi(dosyaAdi(s.ad) + ".xlsx"),
    });
    res.send(Buffer.from(buf));
  });

  return r;
}
