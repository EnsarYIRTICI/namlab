"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, postJson } from "@/lib/api";
import type { Urun, UrunIceAktarSonuc } from "@/lib/types";
import { urunDosyasiOku, type UrunOkuma } from "@/lib/urunDosya";

const sayi = (n: number) => n.toLocaleString("tr-TR");

export default function UrunlerSekmesi() {
  const [ozet, setOzet] = useState<{ toplam: number; sonGuncelleme: string | null } | null>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<(Urun & { guncelleme: string })[]>([]);

  const ara = useCallback(async (s: string) => {
    try {
      const r = await api<{ items: (Urun & { guncelleme: string })[]; toplam: number; sonGuncelleme: string | null }>(
        "/api/urunler?q=" + encodeURIComponent(s),
      );
      setItems(r.items);
      setOzet({ toplam: r.toplam, sonGuncelleme: r.sonGuncelleme });
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void ara(q), 250);
    return () => clearTimeout(t);
  }, [q, ara]);

  return (
    <>
      <IceAktar onBitti={() => void ara(q)} mevcut={ozet?.toplam ?? 0} />
      <div className="panel">
        <h2>
          🏷️ Ürün listesi <span className="badge">{sayi(ozet?.toplam ?? 0)}</span>
        </h2>
        <p className="yardim">
          Okutulan barkodun adını göstermek ve listede olmayan barkodları işaretlemek için. Liste olmadan da sayım yapılır.
          {ozet?.sonGuncelleme ? ` Son güncelleme: ${new Date(ozet.sonGuncelleme).toLocaleString("tr-TR")}.` : ""}
        </p>
        <input className="arama !py-2.5 w-full mb-2" type="search" placeholder="Barkod, ad ya da stok kodu ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        {items.length === 0 ? (
          <div className="empty">{ozet?.toplam ? "Sonuç yok." : "Ürün listesi boş."}</div>
        ) : (
          <div className="tablo-kap">
            <table className="tablo kartli">
              <thead>
                <tr>
                  <th>Barkod</th>
                  <th>Ad</th>
                  <th>Stok kodu</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.barkod}>
                    <td className="kart-baslik tabular-nums">{u.barkod}</td>
                    <td data-etiket="Ad">{u.ad}</td>
                    <td data-etiket="Stok kodu">{u.kod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 50 && <p className="yardim !mt-2">İlk 50 sonuç gösteriliyor.</p>}
          </div>
        )}
        {(ozet?.toplam ?? 0) > 0 && (
          <button
            type="button"
            className="tehlike-btn mt-3"
            onClick={async () => {
              if (!confirm(`Ürün listesindeki ${sayi(ozet!.toplam)} ürün silinsin mi? Sayımlar ve okutmalar etkilenmez.`)) return;
              await api("/api/urunler", { method: "DELETE" });
              void ara(q);
            }}
          >
            Listeyi temizle
          </button>
        )}
      </div>
    </>
  );
}

function IceAktar({ onBitti, mevcut }: { onBitti: () => void; mevcut: number }) {
  const [okunan, setOkunan] = useState<(UrunOkuma & { dosya: string }) | null>(null);
  const [mod, setMod] = useState<"birlestir" | "degistir">("birlestir");
  const [sonuc, setSonuc] = useState<UrunIceAktarSonuc | null>(null);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sifirla = () => {
    setOkunan(null);
    setSonuc(null);
    setHata("");
    if (inputRef.current) inputRef.current.value = "";
  };

  async function gonder(o: UrunOkuma, m: typeof mod, uygula: boolean) {
    setBusy(true);
    setHata("");
    try {
      const r = await postJson<UrunIceAktarSonuc>("/api/urunler/ice-aktar", { urunler: o.urunler, mod: m, uygula });
      setSonuc(r);
      if (r.uygulandi) onBitti();
    } catch (e) {
      setHata((e as Error).message);
    }
    setBusy(false);
  }

  async function dosya(f: File | undefined) {
    sifirla();
    if (!f) return;
    try {
      setBusy(true);
      const o = await urunDosyasiOku(f);
      if (!o.urunler.length) throw new Error("Dosyada ürün satırı yok.");
      setOkunan({ ...o, dosya: f.name });
      await gonder(o, mod, false);
    } catch (e) {
      setHata((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>📥 Ürün listesi yükle</h2>
      <p className="yardim">
        Excel (.xlsx) ya da metin (.txt / .csv) dosyası. Başlıkta <b>Barkod</b> ve <b>Ürün Adı</b> (ya da Stok Adı, Açıklama;
        isteğe bağlı <b>Stok Kodu</b>) sütunları aranır. Başlık yoksa barkoda benzeyen sütun barkod, yanındaki metin ad sayılır
        (terminal için hazırlanmış <span className="kod">barkod;ad</span> dosyaları olduğu gibi okunur). Türkçe Windows
        kodlaması kendiliğinden anlaşılır.
      </p>
      <div className="form-satir">
        <label className="alan">
          <span>Mevcut listeyle</span>
          <select
            value={mod}
            onChange={(e) => {
              const m = e.target.value as typeof mod;
              setMod(m);
              if (okunan) void gonder(okunan, m, false);
            }}
          >
            <option value="birlestir">Birleştir: yenileri ekle, var olanları güncelle, hiçbirini silme</option>
            <option value="degistir">Değiştir: liste dosyadaki gibi olsun (dosyada olmayanlar silinir)</option>
          </select>
        </label>
      </div>
      <input ref={inputRef} className="dosya-sec" type="file" accept=".xlsx,.txt,.csv,.tsv,text/plain" onChange={(e) => void dosya(e.target.files?.[0])} />
      {hata && <div className="status err">{hata}</div>}
      {okunan && (
        <p className="yardim !mt-3 !mb-0">
          <b>{okunan.dosya}</b> · {okunan.kaynak} · {sayi(okunan.urunler.length)} satır. Barkod ← "{okunan.sutunlar.barkod}"
          {okunan.sutunlar.ad ? `, Ad ← "${okunan.sutunlar.ad}"` : ", ad sütunu yok"}
          {okunan.sutunlar.kod ? `, Stok kodu ← "${okunan.sutunlar.kod}"` : ""}
        </p>
      )}
      {busy && !sonuc && <div className="skel h-16 w-full mt-3" />}
      {sonuc && okunan && (
        <div className="onizleme">
          {sonuc.uygulandi ? (
            <div className="onay-kutu ok">
              <b>
                ✓ Yüklendi: {sayi(sonuc.yeni)} yeni, {sayi(sonuc.guncellenen)} güncellenen
                {sonuc.silinecek ? `, ${sayi(sonuc.silinecek)} silinen` : ""}.
              </b>
              <div>
                <button type="button" className="savebtn" onClick={sifirla}>
                  Yeni dosya seç
                </button>
              </div>
            </div>
          ) : sonuc.hatalar.length ? (
            <div className="onay-kutu hata">
              <b>Dosyada {sonuc.hatalar.length} hatalı satır var; düzeltmeden yüklenmez.</b>
            </div>
          ) : sonuc.yeni + sonuc.guncellenen + sonuc.silinecek === 0 ? (
            <div className="onay-kutu ok">
              <b>Liste zaten dosyayla aynı ({sayi(sonuc.ayni)} barkod), değişecek bir şey yok.</b>
            </div>
          ) : (
            <div className={"onay-kutu " + (sonuc.silinecek > mevcut / 2 && sonuc.silinecek > 0 ? "hata" : "ok")}>
              <b>
                {sayi(sonuc.dosyadaki)} barkod: {sayi(sonuc.yeni)} yeni, {sayi(sonuc.guncellenen)} güncellenecek, {sayi(sonuc.ayni)} aynı
                {sonuc.silinecek ? `; ${sayi(sonuc.silinecek)} ürün SİLİNECEK` : ""}.
              </b>
              {sonuc.silinecek > mevcut / 2 && sonuc.silinecek > 0 && (
                <span className="text-[12.5px]">Mevcut listenin yarısından fazlası silinecek. Doğru dosya olduğundan emin olun.</span>
              )}
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="yeni-btn !py-2" disabled={busy} onClick={() => void gonder(okunan, mod, true)}>
                  Onayla ve yükle
                </button>
                <button type="button" className="savebtn" disabled={busy} onClick={sifirla}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
          {sonuc.hatalar.length > 0 && (
            <details className="hata" open>
              <summary>Hatalı satırlar ({sonuc.hatalar.length})</summary>
              <ul>
                {sonuc.hatalar.map((h, i) => (
                  <li key={i}>
                    {h.satir}. satır: {h.mesaj}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {sonuc.uyarilar.length > 0 && (
            <details className="uyar">
              <summary>Uyarılar ({sonuc.uyarilar.length})</summary>
              <ul>
                {sonuc.uyarilar.map((h, i) => (
                  <li key={i}>
                    {h.satir}. satır: {h.mesaj}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
