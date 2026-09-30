/** Barkod ve miktar yardımcıları. */

/** Baştaki/sondaki boşluk ve kontrol karakterleri atılır (el tarayıcıları sona \r, \t ekleyebilir). */
export function normBarkod(s: unknown): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

export function barkodHata(b: string): string | null {
  if (!b) return "Barkod boş.";
  if (b.length > 64) return "Barkod çok uzun (en fazla 64 karakter).";
  if (/\s/.test(b)) return "Barkodda boşluk olamaz.";
  return null;
}

/**
 * GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) kontrol hanesi. Sadece rakamdan oluşan ve bu uzunluklardaki barkodlar
 * denetlenir; diğerleri (Code128, iç kodlar) için null döner.
 */
export function gtinGecerli(b: string): boolean | null {
  if (!/^\d+$/.test(b) || ![8, 12, 13, 14].includes(b.length)) return null;
  const d = [...b].map(Number);
  const kontrol = d.pop()!;
  let t = 0;
  // Sağdan sola: kontrol hanesinin solundaki hane 3 ile çarpılır, sonra 1, 3, 1 ...
  for (let i = d.length - 1, k = 3; i >= 0; i--, k = k === 3 ? 1 : 3) t += d[i]! * k;
  return (10 - (t % 10)) % 10 === kontrol;
}

/** "2,5" / "2.5" / 3 → sayı. 0 < miktar ≤ 1.000.000, en fazla 3 ondalık. Geçersizse null. */
export function miktarOku(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : String(v ?? "").trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 1_000_000 ? n : null;
}
