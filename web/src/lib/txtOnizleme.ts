/**
 * Ayarlar sayfasındaki canlı önizleme için api/src/txt.ts'nin kopyası (kodlama hariç).
 * Biçim kurallarını değiştirirseniz iki dosyayı birlikte güncelleyin; txtOnizleme.test.ts aynı sonuçları denetler.
 */
import type { Ayarlar } from "./types";

/** Dışa aktarılan her satırın verisi. Toplu çıktıda aynı barkodun miktarları toplanmıştır. */
export interface TxtSatir {
  barkod: string;
  miktar: number;
  ad: string;
  kod: string;
  zaman: Date; // toplu çıktıda: o barkodun son okutması
  kullanici: string;
}

export interface TxtMeta {
  sayim: string;
  tarih: Date;
}

export const TXT_ALANLARI = ["barkod", "miktar", "ad", "kod", "tarih", "saat", "kullanici", "sira", "sayim"] as const;

const iki = (n: number) => String(n).padStart(2, "0");
/** Türkiye saatiyle gg.aa.yyyy ve ss:dd:sn */
function trTarihSaat(d: Date): { tarih: string; saat: string } {
  const t = new Date(d.getTime() + 3 * 3600_000); // Türkiye UTC+3 (yaz saati yok)
  return {
    tarih: `${iki(t.getUTCDate())}.${iki(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`,
    saat: `${iki(t.getUTCHours())}:${iki(t.getUTCMinutes())}:${iki(t.getUTCSeconds())}`,
  };
}

/** Miktar yazımı. ondalik -1: tam sayıysa ondalıksız, değilse gerektiği kadar (en fazla 3). */
export function miktarYaz(m: number, ondalik: number, ayrac: string): string {
  let s: string;
  if (ondalik < 0) s = String(Math.round(m * 1000) / 1000);
  else s = m.toFixed(ondalik);
  return ayrac === "," ? s.replace(".", ",") : s;
}

/**
 * Şablondaki {alan} yer tutucularını doldurur. Biçimler:
 *   {barkod}      olduğu gibi
 *   {barkod:20}   sola yaslı, sağı boşlukla 20 karaktere tamamlanır (sabit genişlikli dosyalar için)
 *   {miktar:>8}   sağa yaslı, solu boşlukla doldurulur
 *   {miktar:08}   solu sıfırla doldurulur
 * Değer genişlikten uzunsa kesilmez.
 */
export function sablonDoldur(sablon: string, degerler: Record<string, string>): string {
  return sablon.replace(/\{([a-z]+)(?::(>|0)?(\d{1,3}))?\}/gi, (tam, alan: string, hiza: string | undefined, gen: string | undefined) => {
    const v = degerler[alan.toLowerCase()];
    if (v === undefined) return tam;
    if (!gen) return v;
    const n = Number(gen);
    if (hiza === ">") return v.padStart(n, " ");
    if (hiza === "0") return v.padStart(n, "0");
    return v.padEnd(n, " ");
  });
}

/** Şablonda tanınmayan alan var mı (ayar kaydederken uyarı için). */
export function sablonHatasi(sablon: string): string | null {
  for (const m of sablon.matchAll(/\{([^}]*)\}/g)) {
    const alan = (m[1] ?? "").split(":")[0]!.toLowerCase();
    if (!(TXT_ALANLARI as readonly string[]).includes(alan)) return `Şablonda bilinmeyen alan: {${m[1]}}. Kullanılabilir: ${TXT_ALANLARI.map((a) => `{${a}}`).join(" ")}`;
    if (!/^[a-z]+(?::(?:>|0)?\d{1,3})?$/i.test(m[1] ?? "")) return `Şablonda geçersiz biçim: {${m[1]}}`;
  }
  if (!/\{barkod[^}]*\}/i.test(sablon)) return "Şablonda {barkod} olmalı.";
  return null;
}

/** Satırları ayarlara göre metne çevirir (henüz kodlanmamış). */
export function txtMetni(satirlar: TxtSatir[], a: Ayarlar, meta: TxtMeta): string {
  const nl = a.txtSatirSonu === "crlf" ? "\r\n" : "\n";
  const genel = trTarihSaat(meta.tarih);
  const out: string[] = [];
  if (a.txtBaslik.trim()) {
    out.push(sablonDoldur(a.txtBaslik, { sayim: meta.sayim, tarih: genel.tarih, saat: genel.saat, sira: String(satirlar.length) }));
  }
  satirlar.forEach((s, i) => {
    const z = trTarihSaat(s.zaman);
    // Satır içinde ayraç / satır sonu olabilecek metin alanlarındaki kontrol karakterleri boşluğa çevrilir
    const temiz = (t: string) => t.replace(/[\r\n\t]/g, " ");
    out.push(
      sablonDoldur(a.txtSablon, {
        barkod: s.barkod,
        miktar: miktarYaz(s.miktar, a.txtOndalik, a.txtOndalikAyrac),
        ad: temiz(s.ad),
        kod: temiz(s.kod),
        tarih: z.tarih,
        saat: z.saat,
        kullanici: s.kullanici,
        sira: String(i + 1),
        sayim: temiz(meta.sayim),
      }),
    );
  });
  return out.join(nl) + (out.length && a.txtSonSatirSonu ? nl : "");
}
