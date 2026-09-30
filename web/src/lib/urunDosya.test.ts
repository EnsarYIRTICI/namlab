import { describe, expect, it } from "vitest";
import { baslikAlani, metinCoz, metindenTablo, tablodanUrunler } from "./urunDosya";

describe("ürün dosyası", () => {
  it("başlık tanıma", () => {
    expect(baslikAlani("Barkod")).toBe("barkod");
    expect(baslikAlani("BARKOD NO")).toBe("barkod");
    expect(baslikAlani("Stok Kodu")).toBe("kod");
    expect(baslikAlani("Stok Adı")).toBe("ad");
    expect(baslikAlani("Ürün Adı")).toBe("ad");
    expect(baslikAlani("Açıklama")).toBe("ad");
    expect(baslikAlani("Fiyat")).toBeNull();
  });
  it("başlıklı tablo", () => {
    const r = tablodanUrunler(
      [["Stok Kodu", "Stok Adı", "Barkod", "Fiyat"], ["S1", "ELMA", "8690504000013", "10"], ["", "", "", ""]],
      "x",
    );
    expect(r.urunler).toEqual([{ satir: 2, barkod: "8690504000013", ad: "ELMA", kod: "S1" }]);
    expect(r.sutunlar).toEqual({ barkod: "Barkod", ad: "Stok Adı", kod: "Stok Kodu" });
  });
  it("başlıksız terminal TXT'si: barkod;ad", () => {
    const { rows, ayrac } = metindenTablo("8690504000013;ÇİKOLATA\r\n96385074;SU\r\n\r\n");
    expect(ayrac).toBe(";");
    const r = tablodanUrunler(rows, "x");
    expect(r.urunler).toEqual([
      { satir: 1, barkod: "8690504000013", ad: "ÇİKOLATA", kod: "" },
      { satir: 2, barkod: "96385074", ad: "SU", kod: "" },
    ]);
  });
  it("sekme ayraçlı, tırnaklı", () => {
    const { rows, ayrac } = metindenTablo('Barkod\tAd\n"8690504000013"\t"A ""B"""');
    expect(ayrac).toBe("\t");
    expect(tablodanUrunler(rows, "x").urunler[0]).toMatchObject({ barkod: "8690504000013", ad: 'A "B"' });
  });
  it("Windows-1254 dosyayı çözer", () => {
    // "ŞEKER" windows-1254: DE 45 4B 45 52
    expect(metinCoz(new Uint8Array([0xde, 0x45, 0x4b, 0x45, 0x52])).metin).toBe("ŞEKER");
    expect(metinCoz(new TextEncoder().encode("ŞEKER")).kodlama).toBe("UTF-8");
  });
  it("barkod sütunu yoksa anlaşılır hata", () => {
    expect(() => tablodanUrunler([["a", "b"], ["c", "d"]], "x")).toThrow(/Barkod/);
  });
});
