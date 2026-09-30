import { katla } from "./tr";
import { readXlsx } from "./xlsx";

export interface UrunSatiri {
  satir: number;
  barkod: string;
  ad: string;
  kod: string;
}

export interface UrunOkuma {
  kaynak: string; // "Sayfa1" ya da "TXT (; ayraçlı, Windows-1254)"
  sutunlar: { barkod: string; ad?: string; kod?: string };
  urunler: UrunSatiri[];
}

type Alan = "barkod" | "ad" | "kod";

/** Başlık hücresi hangi alan? Tanınan örnekler: Barkod/Barcode/EAN, Ürün Adı/Stok Adı/Malzeme Adı/Açıklama, Stok Kodu/Kod. */
export function baslikAlani(h: string): Alan | null {
  const k = katla(h).replace(/[.\-_/()]/g, " ").replace(/\s+/g, " ").trim();
  if (!k) return null;
  if (/BARKOD|BARCODE|^EAN|GTIN/.test(k)) return "barkod";
  if (/KOD|CODE|SKU/.test(k)) return "kod";
  if (/^(URUN|ÜRÜN|STOK|MALZEME|MAL|ACIKLAMA|AÇIKLAMA|AD|ISIM|İSIM|TANIM)/.test(k)) return "ad";
  return null;
}

const barkodGibi = (s: string) => /^\d{8,14}$/.test(s.trim());

/** Tablodan (satırlar × hücreler) ürünleri çıkarır. Başlık yoksa barkoda benzeyen sütunu ve yanındaki metni kullanır. */
export function tablodanUrunler(rows: string[][], kaynak: string): UrunOkuma {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const idx: Partial<Record<Alan, number>> = {};
    (rows[i] ?? []).forEach((c, j) => {
      const a = baslikAlani(c);
      if (a && idx[a] === undefined) idx[a] = j;
    });
    if (idx.barkod === undefined) continue;
    const baslik = rows[i]!;
    const urunler: UrunSatiri[] = [];
    for (let r = i + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const al = (a: Alan) => (idx[a] === undefined ? "" : (row[idx[a]!] ?? "").trim());
      const u = { satir: r + 1, barkod: al("barkod"), ad: al("ad"), kod: al("kod") };
      if (u.barkod || u.ad || u.kod) urunler.push(u);
    }
    return {
      kaynak,
      sutunlar: {
        barkod: baslik[idx.barkod]!.trim(),
        ad: idx.ad !== undefined ? baslik[idx.ad]!.trim() : undefined,
        kod: idx.kod !== undefined ? baslik[idx.kod]!.trim() : undefined,
      },
      urunler,
    };
  }
  // Başlıksız: ilk 50 satırda en çok barkoda benzeyen sütun barkod, ondan sonraki ilk metin sütunu ad
  const ornek = rows.slice(0, 50);
  const genislik = Math.max(0, ...ornek.map((r) => r.length));
  let enIyi = -1;
  let enCok = 0;
  for (let j = 0; j < genislik; j++) {
    const n = ornek.filter((r) => barkodGibi(r[j] ?? "")).length;
    if (n > enCok) [enIyi, enCok] = [j, n];
  }
  if (enIyi < 0 || enCok < Math.max(1, ornek.length / 2)) {
    throw new Error('Barkod sütunu bulunamadı. İlk satıra "Barkod" ve "Ürün Adı" başlıklarını yazın.');
  }
  let adSutun = -1;
  for (let j = 0; j < genislik; j++) {
    if (j !== enIyi && ornek.some((r) => /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(r[j] ?? ""))) {
      adSutun = j;
      break;
    }
  }
  return {
    kaynak,
    sutunlar: { barkod: `${enIyi + 1}. sütun`, ad: adSutun >= 0 ? `${adSutun + 1}. sütun` : undefined },
    urunler: rows
      .map((r, i) => ({ satir: i + 1, barkod: (r[enIyi] ?? "").trim(), ad: adSutun >= 0 ? (r[adSutun] ?? "").trim() : "", kod: "" }))
      .filter((u) => u.barkod || u.ad),
  };
}

/** UTF-8 geçerliyse UTF-8, değilse Türkçe Windows (1254) — terminal / eski program çıktıları genelde 1254'tür. */
export function metinCoz(buf: Uint8Array): { metin: string; kodlama: string } {
  try {
    const m = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { metin: m.replace(/^﻿/, ""), kodlama: "UTF-8" };
  } catch {
    return { metin: new TextDecoder("windows-1254").decode(buf), kodlama: "Windows-1254" };
  }
}

/** TXT/CSV: ayraç satırlarda en tutarlı geçen karakterdir (; sekme , |). */
export function metindenTablo(metin: string): { rows: string[][]; ayrac: string } {
  const satirlar = metin.split(/\r\n|\n|\r/);
  while (satirlar.length && !satirlar[satirlar.length - 1]!.trim()) satirlar.pop();
  const ornek = satirlar.slice(0, 50).filter((s) => s.trim());
  let ayrac = ";";
  let enIyi = -1;
  for (const a of [";", "\t", ",", "|"]) {
    const sayilar = ornek.map((s) => s.split(a).length - 1);
    const tutarli = sayilar.filter((n) => n > 0 && n === sayilar[0]).length;
    if (tutarli > enIyi) [ayrac, enIyi] = [a, tutarli];
  }
  const tirnak = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
  return { rows: satirlar.map((s) => s.split(ayrac).map(tirnak)), ayrac };
}

export async function urunDosyasiOku(f: File): Promise<UrunOkuma> {
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const sayfalar = readXlsx(buf);
    let sonHata: Error | null = null;
    for (const s of sayfalar) {
      try {
        return tablodanUrunler(s.rows, `"${s.name}" sayfası`);
      } catch (e) {
        sonHata = e as Error;
      }
    }
    throw sonHata ?? new Error("Excel dosyasında ürün bulunamadı.");
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf) {
    throw new Error('Eski Excel biçimi (.xls) okunamıyor. Excel\'de "Farklı Kaydet → .xlsx" ile kaydedin.');
  }
  const { metin, kodlama } = metinCoz(buf);
  const { rows, ayrac } = metindenTablo(metin);
  const ad = ayrac === "\t" ? "sekme" : ayrac;
  return tablodanUrunler(rows, `metin dosyası (${ad} ayraçlı, ${kodlama})`);
}
