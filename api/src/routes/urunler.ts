import express, { Router } from "express";
import { z } from "zod";
import { barkodHata, normBarkod } from "../barkod";
import type { Deps } from "../deps";
import { kaydet } from "../islemKaydi";
import { requireAdmin } from "./yonetim";

const temiz = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * Ürün listesi (barkod → ad). Okutulan barkodun adını göstermek ve "listede olmayan" barkodları işaretlemek için.
 * Liste olmadan da sayım yapılır.
 */
export function urunlerRoutes(d: Deps): Router {
  const r = Router();

  /** Tek barkod: okutma anında adı göstermek için (hızlı). */
  r.get("/urunler/barkod/:barkod", async (req, res) => {
    const b = normBarkod(req.params.barkod);
    const u = (await d.pool.query("SELECT barkod, ad, kod FROM urunler WHERE barkod = $1", [b])).rows[0];
    res.json(u ?? null);
  });

  /** Arama / özet (yönetim paneli) */
  r.get("/urunler", async (req, res) => {
    const q = temiz(req.query.q, 64);
    const p: unknown[] = [];
    let kosul = "";
    if (q) {
      p.push("%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
      kosul = `WHERE barkod LIKE $1 OR tr_fold(ad) LIKE tr_fold($1) OR kod LIKE $1`;
    }
    const [liste, ozet] = await Promise.all([
      d.pool.query(`SELECT barkod, ad, kod, guncelleme FROM urunler ${kosul} ORDER BY ad, barkod LIMIT 50`, p),
      d.pool.query(`SELECT COUNT(*)::int AS toplam, MAX(guncelleme) AS "sonGuncelleme" FROM urunler`),
    ]);
    res.json({ items: liste.rows, ...ozet.rows[0] });
  });

  const iceAktarSchema = z.object({
    urunler: z
      .array(z.object({ satir: z.number().int().min(1), barkod: z.unknown(), ad: z.unknown().optional(), kod: z.unknown().optional() }))
      .min(1, "Dosyada ürün yok.")
      .max(200_000, "En fazla 200.000 satır yüklenebilir."),
    mod: z.enum(["birlestir", "degistir"]),
    uygula: z.boolean().default(false),
  });

  /**
   * Önizleme (uygula: false) ya da uygulama.
   * birlestir: yeni barkodlar eklenir, var olanların adı/kodu dosyadaki gibi güncellenir, hiçbir şey silinmez.
   * degistir: liste dosyadaki gibi olur (dosyada olmayan barkodlar silinir). Okutmalar etkilenmez.
   */
  r.post("/urunler/ice-aktar", requireAdmin, express.json({ limit: "25mb" }), async (req, res) => {
    const b = iceAktarSchema.safeParse(req.body ?? {});
    if (!b.success) {
      const i = b.error.issues[0];
      res.status(400).json({ error: i?.message && !i.message.startsWith("Invalid") ? i.message : "Geçersiz istek." });
      return;
    }
    const hatalar: { satir: number; mesaj: string }[] = [];
    const uyarilar: { satir: number; mesaj: string }[] = [];
    const dosya = new Map<string, { ad: string; kod: string; satir: number }>();
    for (const x of b.data.urunler) {
      const barkod = normBarkod(x.barkod);
      const ad = temiz(x.ad, 200);
      const kod = temiz(x.kod, 64);
      if (!barkod && !ad && !kod) continue;
      const h = barkodHata(barkod);
      if (h) {
        if (hatalar.length < 200) hatalar.push({ satir: x.satir, mesaj: h + (ad ? ` (${ad})` : "") });
        continue;
      }
      const onceki = dosya.get(barkod);
      if (onceki && onceki.ad !== ad && uyarilar.length < 200) {
        uyarilar.push({ satir: x.satir, mesaj: `${barkod} dosyada tekrar ediyor (${onceki.satir}. satır: "${onceki.ad}", bu satır: "${ad}"); son satır geçerli.` });
      }
      dosya.set(barkod, { ad, kod, satir: x.satir });
    }
    const client = await d.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(727041)");
      const mevcut = new Map(
        (await client.query("SELECT barkod, ad, kod FROM urunler")).rows.map((u) => [u.barkod as string, u as { ad: string; kod: string }]),
      );
      let yeni = 0;
      let guncellenen = 0;
      let ayni = 0;
      for (const [bk, v] of dosya) {
        const m = mevcut.get(bk);
        if (!m) yeni++;
        else if (m.ad !== v.ad || m.kod !== v.kod) guncellenen++;
        else ayni++;
      }
      const silinecek = b.data.mod === "degistir" ? [...mevcut.keys()].filter((k) => !dosya.has(k)).length : 0;
      const ozet = { dosyadaki: dosya.size, yeni, guncellenen, ayni, silinecek, mevcut: mevcut.size, hatalar, uyarilar };
      if (!b.data.uygula || hatalar.length) {
        await client.query("ROLLBACK");
        res.status(b.data.uygula ? 400 : 200).json({ ...ozet, uygulandi: false });
        return;
      }
      if (b.data.mod === "degistir") await client.query("DELETE FROM urunler");
      const liste = [...dosya];
      for (let i = 0; i < liste.length; i += 5000) {
        const parca = liste.slice(i, i + 5000);
        await client.query(
          `INSERT INTO urunler (barkod, ad, kod)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
           ON CONFLICT (barkod) DO UPDATE SET ad = EXCLUDED.ad, kod = EXCLUDED.kod, guncelleme = now()
             WHERE urunler.ad IS DISTINCT FROM EXCLUDED.ad OR urunler.kod IS DISTINCT FROM EXCLUDED.kod`,
          [parca.map(([k]) => k), parca.map(([, v]) => v.ad), parca.map(([, v]) => v.kod)],
        );
      }
      await client.query("COMMIT");
      await kaydet(d.pool, req, "urun_ice_aktar", { mod: b.data.mod, yeni, guncellenen, silinen: silinecek });
      res.json({ ...ozet, uygulandi: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });

  r.delete("/urunler", requireAdmin, async (req, res) => {
    const n = (await d.pool.query("DELETE FROM urunler")).rowCount ?? 0;
    await kaydet(d.pool, req, "urun_sil", { silinen: n });
    res.json({ silinen: n });
  });

  return r;
}
