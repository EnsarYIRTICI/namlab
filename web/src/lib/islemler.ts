import type { IslemKaydi } from "./types";

/** İşlem kaydındaki işlem adlarının Türkçe etiketleri (api/src/islemKaydi.ts ile aynı liste). */
export const ISLEM_ETIKET: Record<string, string> = {
  giris: "Giriş",
  giris_hatali: "Hatalı giriş",
  cikis: "Çıkış",
  sifre_degistir: "Kendi şifresini değiştirdi",
  sayim_ac: "Sayım açtı",
  sayim_guncelle: "Sayım adını değiştirdi",
  sayim_kapat: "Sayımı kapattı",
  sayim_yeniden_ac: "Sayımı yeniden açtı",
  sayim_sil: "Sayım sildi",
  okutma_sil: "Okutma sildi",
  okutma_duzelt: "Okutma miktarı düzeltti",
  sayim_disa_aktar: "Sayımı dışa aktardı",
  urun_ice_aktar: "Ürün listesi yükledi",
  urun_sil: "Ürün listesini temizledi",
  kullanici_ekle: "Kullanıcı ekledi",
  kullanici_sil: "Kullanıcı sildi",
  kullanici_rol: "Rol değiştirdi",
  kullanici_aktif: "Hesap durumu değiştirdi",
  kullanici_sifre: "Kullanıcı şifresi sıfırladı",
  kullanici_oturum_kapat: "Oturumları kapattı",
  ayar_degistir: "Ayar değiştirdi",
};

/** Dikkat çekmesi gereken işlemler */
export const ONEMLI_ISLEMLER = new Set([
  "sayim_sil",
  "sayim_yeniden_ac",
  "okutma_sil",
  "okutma_duzelt",
  "urun_ice_aktar",
  "urun_sil",
  "kullanici_sil",
  "kullanici_rol",
  "kullanici_aktif",
  "kullanici_sifre",
  "giris_hatali",
]);

export const AYAR_ETIKET: Record<string, string> = {
  txtSablon: "TXT satır şablonu",
  txtBaslik: "TXT başlık satırı",
  txtOndalik: "Ondalık basamak",
  txtOndalikAyrac: "Ondalık ayracı",
  txtKodlama: "Karakter kodlaması",
  txtSatirSonu: "Satır sonu",
  txtToplu: "Aynı barkodu topla",
  txtSonSatirSonu: "Son satırda satır sonu",
  kameraTekrarMs: "Kamera tekrar süresi (ms)",
};

const rolAdi = (r: unknown) => (r === "yonetici" ? "yönetici" : "personel");
const deger = (v: unknown) => (v === true ? "açık" : v === false ? "kapalı" : v === "" ? "(boş)" : String(v));

/** Kaydın ayrıntısını tek satır okunur metne çevirir. */
export function islemDetay(k: IslemKaydi): string {
  const d = k.detay as Record<string, any>;
  switch (k.islem) {
    case "giris_hatali":
      return d.neden === "pasif" ? "hesap pasif" : "şifre ya da kullanıcı adı hatalı";
    case "sayim_ac":
    case "sayim_kapat":
    case "sayim_yeniden_ac":
    case "sayim_sil":
      return String(d.sayim ?? "");
    case "sayim_guncelle":
      return d.eskiAd ? `${d.eskiAd} → ${d.sayim}` : String(d.sayim ?? "");
    case "okutma_sil":
      return `${d.sayim} · ${d.barkod} · ${d.miktar}${d.sahibi ? " (okutan: " + d.sahibi + ")" : ""}`;
    case "okutma_duzelt":
      return `${d.sayim} · ${d.barkod} · ${d.eski} → ${d.yeni}${d.sahibi ? " (okutan: " + d.sahibi + ")" : ""}`;
    case "sayim_disa_aktar":
      return `${d.sayim} · ${String(d.bicim ?? "").toUpperCase()} · ${d.satir} satır`;
    case "urun_ice_aktar":
      return `${d.mod === "degistir" ? "değiştir" : "birleştir"} · ${d.yeni} yeni, ${d.guncellenen} güncellenen${d.silinen ? ", " + d.silinen + " silinen" : ""}`;
    case "urun_sil":
      return `${d.silinen} ürün silindi`;
    case "kullanici_ekle":
      return `${d.hedef} (${rolAdi(d.rol)})`;
    case "kullanici_rol":
      return `${d.hedef} → ${rolAdi(d.rol)}`;
    case "kullanici_aktif":
      return `${d.hedef} → ${d.aktif ? "aktif" : "pasif"}`;
    case "kullanici_sil":
    case "kullanici_sifre":
      return String(d.hedef ?? "");
    case "kullanici_oturum_kapat":
      return `${d.hedef} · ${d.kapatilan ?? 0} oturum`;
    case "ayar_degistir":
      return Object.entries(d)
        .map(([k, v]) => `${AYAR_ETIKET[k] ?? k}: ${deger((v as any)?.eski)} → ${deger((v as any)?.yeni)}`)
        .join(", ");
    default:
      return Object.keys(d).length ? JSON.stringify(d) : "";
  }
}
