"use client";
import { useCallback, useEffect, useState } from "react";
import { api, postJson } from "@/lib/api";
import { bekleyenler } from "@/lib/kuyruk";
import type { Me, Sayim, SayimListeSatiri } from "@/lib/types";
import Modal from "./Modal";
import UstBar from "./UstBar";

const zaman = (s: string | null) => (s ? new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const sayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });

/** Ana sayfa: açık (ve istenirse kapalı) sayımlar, yeni sayım aç. */
export default function SayimListesi() {
  const [me, setMe] = useState<Me | null>(null);
  const [liste, setListe] = useState<SayimListeSatiri[] | null>(null);
  const [durum, setDurum] = useState<"acik" | "kapali">("acik");
  const [hata, setHata] = useState("");
  const [yeniAcik, setYeniAcik] = useState(false);
  const [bekleyen, setBekleyen] = useState<Record<string, number>>({});

  const yukle = useCallback(async (d: "acik" | "kapali") => {
    try {
      setListe(await api<SayimListeSatiri[]>("/api/sayimlar?durum=" + d));
      setHata("");
    } catch (e) {
      setHata(e instanceof TypeError ? "Sunucuya ulaşılamıyor" : (e as Error).message);
    }
    // Bu telefonda gönderilmeyi bekleyen okutmalar (bağlantı kopmuşken okutulanlar)
    const b: Record<string, number> = {};
    for (const o of bekleyenler()) b[o.sayimId] = (b[o.sayimId] ?? 0) + 1;
    setBekleyen(b);
  }, []);

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch((e: Error & { status?: number }) => {
        if (e.status !== 401) setHata(e instanceof TypeError ? "Sunucuya ulaşılamıyor" : e.message);
      });
  }, []);

  useEffect(() => {
    if (!me) return;
    setListe(null);
    void yukle(durum);
    const gorunur = () => document.visibilityState === "visible" && void yukle(durum);
    document.addEventListener("visibilitychange", gorunur);
    return () => document.removeEventListener("visibilitychange", gorunur);
  }, [me, durum, yukle]);

  if (!me) {
    return (
      <div className="wrap">
        {hata ? (
          <div className="panel max-w-md">
            <h2>Sunucuya bağlanılamadı</h2>
            <p className="m-0 mb-3 text-sm text-stone-500">{hata}</p>
            <button type="button" className="retry-btn" onClick={() => location.reload()}>
              Tekrar dene
            </button>
          </div>
        ) : (
          <div className="skel h-8 w-48" aria-label="Yükleniyor" />
        )}
      </div>
    );
  }

  return (
    <div>
      <UstBar me={me} sayfa="ana" />
      <div className="wrap">
        <div className="arac-cubugu">
          <div className="filtreler !mb-0 flex-1" role="group" aria-label="Durum">
            <button type="button" className={"filtre" + (durum === "acik" ? " secili" : "")} onClick={() => setDurum("acik")}>
              Açık sayımlar
            </button>
            <button type="button" className={"filtre" + (durum === "kapali" ? " secili" : "")} onClick={() => setDurum("kapali")}>
              Kapalı
            </button>
          </div>
          <button type="button" className="yeni-btn" onClick={() => setYeniAcik(true)}>
            + Yeni sayım
          </button>
        </div>
        {hata && <div className="status err">{hata}</div>}
        {!liste ? (
          <div className="sayim-izgara">
            <div className="skel h-28 w-full rounded-xl" />
            <div className="skel h-28 w-full rounded-xl" />
          </div>
        ) : liste.length === 0 ? (
          <div className="panel empty">
            {durum === "acik" ? 'Açık sayım yok. "+ Yeni sayım" ile başlayın.' : "Kapalı sayım yok."}
          </div>
        ) : (
          <div className="sayim-izgara">
            {liste.map((s) => (
              <a key={s.id} className="sayim-kart" href={"/sayim/" + s.id}>
                <h3>
                  {s.ad}
                  <span className={"rozet " + s.durum}>{s.durum === "acik" ? "Açık" : "Kapalı"}</span>
                  {bekleyen[s.id] ? <span className="rozet sari">{bekleyen[s.id]} gönderilmedi</span> : null}
                </h3>
                {s.aciklama && <div className="alt !mt-0.5">{s.aciklama}</div>}
                <div className="sayilar">
                  <span>
                    <b>{sayi(s.cesit)}</b>çeşit
                  </span>
                  <span>
                    <b>{sayi(s.toplam)}</b>toplam miktar
                  </span>
                  <span>
                    <b>{sayi(s.okutma)}</b>okutma
                  </span>
                </div>
                <div className="alt">
                  {s.olusturan} · {zaman(s.olusturma)}
                  {s.sonOkutma ? ` · son okutma ${zaman(s.sonOkutma)}` : ""}
                  {s.kisiler ? ` · okutan: ${s.kisiler}` : ""}
                  {s.durum === "kapali" && s.kapatan ? ` · kapatan: ${s.kapatan}, ${zaman(s.kapanma)}` : ""}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
      {yeniAcik && <YeniSayim onClose={() => setYeniAcik(false)} />}
    </div>
  );
}

function YeniSayim({ onClose }: { onClose: () => void }) {
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);

  async function ac(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await postJson<Sayim>("/api/sayimlar", { ad, aciklama });
      location.href = "/sayim/" + s.id;
    } catch (err) {
      setHata((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal baslik="Yeni sayım" onClose={onClose} onSubmit={ac}>
      <label className="alan">
        <span>Sayım adı (boş bırakılırsa tarih ve saat yazılır)</span>
        <input value={ad} onChange={(e) => setAd(e.target.value)} autoFocus maxLength={100} placeholder="örn. Reyon 3 - içecek" />
      </label>
      <label className="alan">
        <span>Not (isteğe bağlı)</span>
        <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={500} />
      </label>
      <button className="anabtn" type="submit" disabled={busy}>
        Sayımı başlat
      </button>
      {hata && <div className="status err">{hata}</div>}
    </Modal>
  );
}
