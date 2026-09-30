/** Türkçe büyük harf (i→İ, ı→I). */
export function trUpper(s: string | undefined): string {
  return (s || "").replace(/i/g, "İ").replace(/ı/g, "I").toLocaleUpperCase("tr-TR");
}

/** Arama anahtarı: Türkçe harf ve büyük/küçük harf duyarsız; i/ı/İ/I aynı sayılır. */
export function katla(s: string | undefined): string {
  return trUpper(s).replace(/İ/g, "I").replace(/\s+/g, " ").trim();
}

/** Plaka / TC gibi alanlar için: harf ve rakam dışı her şey atılır ("34 lk 8127" → "34LK8127"). */
export function sade(s: string | undefined): string {
  return katla(s).replace(/[^A-Z0-9ÇĞÖŞÜ]/g, "");
}
