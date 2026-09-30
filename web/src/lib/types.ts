export type Rol = "yonetici" | "personel";

export interface Me {
  username: string;
  rol: Rol;
  version: string;
  commit: string;
  startedAt: string;
}

export interface Sayim {
  id: string;
  ad: string;
  aciklama: string;
  durum: "acik" | "kapali";
  olusturan: string | null;
  olusturma: string;
  kapatan: string | null;
  kapanma: string | null;
}

export interface SayimListeSatiri extends Sayim {
  okutma: number;
  cesit: number;
  toplam: number;
  sonOkutma: string | null;
  kisiler: string | null;
}

/** Barkod başına toplam */
export interface Toplam {
  barkod: string;
  miktar: number;
  okutma: number;
  sonZaman: string;
  ilkZaman: string;
  ad: string;
  kod: string;
  listede: boolean;
  kontrolHatali: boolean;
  kullanicilar: string | null;
}

export interface SayimDetay {
  sayim: Sayim;
  ozet: { cesit: number; okutma: number; toplam: number; listedeYok: number };
  satirlar: Toplam[];
}

export interface Okutma {
  id: string;
  barkod: string;
  miktar: number;
  kullanici: string | null;
  zaman: string;
  ad: string;
}

export interface Urun {
  barkod: string;
  ad: string;
  kod: string;
}

/** Yönetim panelinden değiştirilebilen ayarlar (api/src/ayarlar.ts ile aynı) */
export interface Ayarlar {
  txtSablon: string;
  txtBaslik: string;
  txtOndalik: number;
  txtOndalikAyrac: "," | ".";
  txtKodlama: "windows-1254" | "utf-8" | "utf-8-bom";
  txtSatirSonu: "crlf" | "lf";
  txtToplu: boolean;
  txtSonSatirSonu: boolean;
  kameraTekrarMs: number;
}

export interface Kullanici {
  username: string;
  rol: Rol;
  aktif: boolean;
  createdAt: string;
  sonGiris: string | null;
  acikOturum: number;
}

export interface IslemKaydi {
  id: string;
  zaman: string;
  kullanici: string | null;
  islem: string;
  detay: Record<string, unknown>;
  ip: string | null;
}

export interface UrunIceAktarSonuc {
  dosyadaki: number;
  yeni: number;
  guncellenen: number;
  ayni: number;
  silinecek: number;
  mevcut: number;
  hatalar: { satir: number; mesaj: string }[];
  uyarilar: { satir: number; mesaj: string }[];
  uygulandi: boolean;
}
