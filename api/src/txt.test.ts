import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { VARSAYILAN_AYARLAR, type Ayarlar } from "./ayarlar";
import { barkodHata, gtinGecerli, miktarOku, normBarkod } from "./barkod";
import { kodla, miktarYaz, sablonDoldur, sablonHatasi, txtMetni, type TxtSatir } from "./txt";

const A = (x: Partial<Ayarlar> = {}): Ayarlar => ({ ...VARSAYILAN_AYARLAR, ...x });
const T = new Date("2026-09-28T18:05:09Z"); // Türkiye: 28.09.2026 21:05:09
const satir = (barkod: string, miktar: number, ad = ""): TxtSatir => ({ barkod, miktar, ad, kod: "", zaman: T, kullanici: "ali" });
const meta = { sayim: "Reyon 3", tarih: T };

describe("TXT çıktısı", () => {
  it("varsayılan: barkod;miktar, CRLF, son satırda da satır sonu", () => {
    expect(txtMetni([satir("8690000000001", 5), satir("8690000000002", 12)], A(), meta)).toBe(
      "8690000000001;5\r\n8690000000002;12\r\n",
    );
  });
  it("ondalık: otomatik, sabit, ayraç", () => {
    expect(miktarYaz(2.5, -1, ",")).toBe("2,5");
    expect(miktarYaz(3, -1, ",")).toBe("3");
    expect(miktarYaz(2.5, 3, ".")).toBe("2.500");
    expect(miktarYaz(1.2345, 2, ",")).toBe("1,23");
  });
  it("sabit genişlik ve doldurma", () => {
    expect(sablonDoldur("{barkod:15}{miktar:>6}|{miktar:05}", { barkod: "123", miktar: "7" })).toBe("123" + " ".repeat(12) + " ".repeat(5) + "7|00007");
    expect(sablonDoldur("{barkod:3}", { barkod: "8690000000001" })).toBe("8690000000001"); // kesilmez
  });
  it("başlık, tarih/saat Türkiye saatiyle, LF, son satır sonu yok", () => {
    const m = txtMetni([satir("1", 1, "ELMA")], A({ txtBaslik: "SAYIM {sayim} {tarih}", txtSablon: "{sira}\t{barkod}\t{ad}\t{tarih} {saat}", txtSatirSonu: "lf", txtSonSatirSonu: false }), meta);
    expect(m).toBe("SAYIM Reyon 3 28.09.2026\n1\t1\tELMA\t28.09.2026 21:05:09");
  });
  it("ürün adındaki satır sonu/sekme satırı bozmaz", () => {
    expect(txtMetni([satir("1", 1, "A\tB\r\nC")], A({ txtSablon: "{barkod};{ad}" }), meta)).toBe("1;A B  C\r\n");
  });
  it("boş sayım boş dosya", () => {
    expect(txtMetni([], A(), meta)).toBe("");
  });
  it("Windows-1254 kodlama Türkçe harfleri tek bayt yazar", () => {
    const b = kodla("ŞİĞÜÖÇışğ", "windows-1254");
    expect(b.length).toBe(9);
    expect(iconv.decode(b, "win1254")).toBe("ŞİĞÜÖÇışğ");
    expect([...kodla("x", "utf-8-bom")]).toEqual([0xef, 0xbb, 0xbf, 0x78]);
  });
  it("şablon denetimi", () => {
    expect(sablonHatasi("{barkod};{miktar}")).toBeNull();
    expect(sablonHatasi("{barkod:20}{miktar:>8}{ad:30}")).toBeNull();
    expect(sablonHatasi("{miktar}")).toMatch(/barkod/);
    expect(sablonHatasi("{barkod};{fiyat}")).toMatch(/bilinmeyen/);
    expect(sablonHatasi("{barkod:x}")).toMatch(/geçersiz/);
  });
});

describe("barkod ve miktar", () => {
  it("GTIN kontrol hanesi", () => {
    expect(gtinGecerli("8690504000013")).toBe(true); // EAN-13 örneği (kontrol hanesi doğru)
    expect(gtinGecerli("8690504000014")).toBe(false);
    expect(gtinGecerli("96385074")).toBe(true); // EAN-8
    expect(gtinGecerli("036000291452")).toBe(true); // UPC-A
    expect(gtinGecerli("ABC-123")).toBeNull();
    expect(gtinGecerli("12345")).toBeNull();
  });
  it("normBarkod el tarayıcısının eklediği karakterleri atar", () => {
    expect(normBarkod(" 8690504000013\r\n")).toBe("8690504000013");
    expect(barkodHata("")).not.toBeNull();
    expect(barkodHata("a b")).not.toBeNull();
    expect(barkodHata("8690504000013")).toBeNull();
  });
  it("miktar", () => {
    expect(miktarOku("2,5")).toBe(2.5);
    expect(miktarOku(3)).toBe(3);
    expect(miktarOku("0")).toBeNull();
    expect(miktarOku("-1")).toBeNull();
    expect(miktarOku("1.2345")).toBeNull();
    expect(miktarOku("abc")).toBeNull();
    expect(miktarOku("2000000")).toBeNull();
  });
});
