import type { Pool } from "pg";
import { z } from "zod";
import { sablonHatasi } from "./txt";

/**
 * Yönetim panelinden değiştirilebilen ayarlar. Veritabanında olmayan anahtar varsayılan değeri kullanır.
 * Yeni ayar: buraya alan + varsayılan ekleyin, arayüzde web/src/components/yonetim/AyarlarSekmesi.tsx.
 */
export const ayarSchema = z.object({
  /** TXT satır şablonu. Bkz. txt.ts sablonDoldur. Varsayılan: el terminallerindeki gibi "barkod;miktar". */
  txtSablon: z.string().min(1).max(300),
  /** İlk satıra yazılacak başlık (boş: başlık yok). {sayim} {tarih} {saat} {sira} kullanılabilir. */
  txtBaslik: z.string().max(300),
  /** Miktarın ondalık basamağı. -1: otomatik (tam sayıysa ondalıksız). */
  txtOndalik: z.number().int().min(-1).max(3),
  txtOndalikAyrac: z.enum([",", "."]),
  txtKodlama: z.enum(["windows-1254", "utf-8", "utf-8-bom"]),
  txtSatirSonu: z.enum(["crlf", "lf"]),
  /** true: aynı barkod tek satır, miktarlar toplanır. false: her okutma ayrı satır. */
  txtToplu: z.boolean(),
  /** Son satırdan sonra da satır sonu yazılsın. */
  txtSonSatirSonu: z.boolean(),
  /** Kamera aynı barkodu bu kadar milisaniye içinde tekrar görürse yeni okutma sayılmaz. */
  kameraTekrarMs: z.number().int().min(300).max(10000),
});

export type Ayarlar = z.infer<typeof ayarSchema>;

export const VARSAYILAN_AYARLAR: Ayarlar = {
  txtSablon: "{barkod};{miktar}",
  txtBaslik: "",
  txtOndalik: -1,
  txtOndalikAyrac: ",",
  txtKodlama: "windows-1254",
  txtSatirSonu: "crlf",
  txtToplu: true,
  txtSonSatirSonu: true,
  kameraTekrarMs: 1500,
};

/** Kısmi güncelleme şeması: bilinmeyen anahtar reddedilir. */
export const ayarGuncelleSchema = ayarSchema.partial().strict();

export async function ayarlariOku(pool: Pool): Promise<Ayarlar> {
  const rows = (await pool.query("SELECT anahtar, deger FROM ayarlar")).rows as { anahtar: string; deger: unknown }[];
  const out: Ayarlar = { ...VARSAYILAN_AYARLAR };
  for (const r of rows) {
    const alan = ayarSchema.shape[r.anahtar as keyof Ayarlar];
    if (!alan) continue; // artık kullanılmayan eski anahtar
    const v = alan.safeParse(r.deger);
    if (v.success) (out as Record<string, unknown>)[r.anahtar] = v.data;
  }
  return out;
}

/** Birleşik (mevcut + yeni) ayarların tutarlılığı. Hata mesajı ya da null. */
export function ayarTutarlilik(a: Ayarlar): string | null {
  return sablonHatasi(a.txtSablon);
}
