import { describe, expect, it } from "vitest";
import { sablonDoldur, sablonHatasi, txtMetni } from "./txtOnizleme";
import type { Ayarlar } from "./types";

const A: Ayarlar = {
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
const T = new Date("2026-09-28T18:05:09Z");

describe("TXT önizleme (API ile aynı sonuç)", () => {
  it("varsayılan", () => {
    const s = (barkod: string, miktar: number) => ({ barkod, miktar, ad: "", kod: "", zaman: T, kullanici: "" });
    expect(txtMetni([s("8690000000001", 5), s("2", 2.5)], A, { sayim: "x", tarih: T })).toBe("8690000000001;5\r\n2;2,5\r\n");
  });
  it("şablon", () => {
    expect(sablonDoldur("{barkod:5}|{miktar:>3}|{miktar:03}", { barkod: "12", miktar: "7" })).toBe("12   |  7|007");
    expect(sablonHatasi("{miktar}")).toMatch(/barkod/);
  });
});
