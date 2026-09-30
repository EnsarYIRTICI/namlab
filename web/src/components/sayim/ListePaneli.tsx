"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { katla } from "@/lib/tr";
import type { Me, Okutma, SayimDetay, Toplam } from "@/lib/types";
import { sayi } from "../SayimListesi";

const saat = (s: string) => new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" });
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Sayımın barkod bazında listesi, okutma düzeltme/silme, dışa aktarma ve sayım işlemleri. */
export default function ListePaneli({
  detay,
  me,
  toplamlar,
  bekleyen,
  yenile,
  onToplam,
}: {
  detay: SayimDetay;
  me: Me | null;
  toplamlar: Map<string, Toplam>;
  bekleyen: number;
  yenile: () => Promise<void>;
  onToplam: (barkod: string, t: Toplam | null) => void;
}) {
  const s = detay.sayim;
  const kapali = s.durum === "kapali";
  const yonetici = me?.rol === "yonetici";
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tumu" | "listedeYok" | "hatali">("tumu");
  const [acik, setAcik] = useState<string | null>(null);
  const [okutmalar, setOkutmalar] = useState<Okutma[] | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean }>({ t: "" });

  const satirlar = useMemo(() => [...toplamlar.values()], [toplamlar]);
  const ozet = useMemo(
    () => ({
      cesit: satirlar.length,
      toplam: satirlar.reduce((n, x) => n + x.miktar, 0),
      okutma: satirlar.reduce((n, x) => n + x.okutma, 0),
      listedeYok: satirlar.filter((x) => !x.listede).length,
      hatali: satirlar.filter((x) => x.kontrolHatali).length,
    }),
    [satirlar],
  );
  const gorunen = useMemo(() => {
    const k = katla(q);
    return satirlar
      .filter((x) => (filtre === "listedeYok" ? !x.listede : filtre === "hatali" ? x.kontrolHatali : true))
      .filter((x) => !k || x.barkod.includes(q.trim()) || katla(x.ad).includes(k) || katla(x.kod).includes(k))
      .sort((a, b) => new Date(b.sonZaman).getTime() - new Date(a.sonZaman).getTime());
  }, [satirlar, q, filtre]);
  const urunListesiVar = satirlar.some((x) => x.listede);

  async function ac(barkod: string) {
    if (acik === barkod) {
      setAcik(null);
      return;
    }
    setAcik(barkod);
    setOkutmalar(null);
    try {
      setOkutmalar(
        (await api<{ items: Okutma[] }>(`/api/sayimlar/${s.id}/okutmalar?barkod=${encodeURIComponent(barkod)}&limit=500`)).items,
      );
    } catch (e) {
      setMsg({ t: (e as Error).message });
    }
  }

  async function okutmaDegistir(o: Okutma, sil: boolean) {
    let body: RequestInit;
    if (sil) {
      if (!confirm(`${o.barkod} için ${sayi(o.miktar)} miktarlı okutma silinsin mi?`)) return;
      body = { method: "DELETE" };
    } else {
      const v = prompt(`${o.barkod} — yeni miktar:`, String(o.miktar).replace(".", ","));
      if (v === null) return;
      body = json("PATCH", { miktar: v.trim() });
    }
    try {
      const r = await api<{ toplamlar: Toplam[] }>(`/api/okutmalar/${o.id}`, body);
      onToplam(o.barkod, r.toplamlar[0] ?? null);
      if (sil) setOkutmalar((l) => (l ?? []).filter((x) => x.id !== o.id));
      else await okutmalariTazele(o.barkod);
      setMsg({ t: sil ? "Okutma silindi." : "Miktar düzeltildi.", ok: true });
    } catch (e) {
      setMsg({ t: (e as Error).message });
    }
  }
  async function okutmalariTazele(barkod: string) {
    try {
      setOkutmalar(
        (await api<{ items: Okutma[] }>(`/api/sayimlar/${s.id}/okutmalar?barkod=${encodeURIComponent(barkod)}&limit=500`)).items,
      );
    } catch {}
  }

  async function sayimIslem(islem: "kapat" | "ac" | "ad" | "sil") {
    try {
      if (islem === "kapat") {
        const uyari = bekleyen > 0 ? `\n\nDİKKAT: Bu telefonda ${bekleyen} okutma henüz gönderilmedi; kapatırsanız gönderilemez.` : "";
        if (!confirm(`"${s.ad}" kapatılsın mı? Kapalı sayıma okutma eklenemez, düzeltme yapılamaz.${uyari}`)) return;
        await api(`/api/sayimlar/${s.id}`, json("PATCH", { durum: "kapali" }));
      } else if (islem === "ac") {
        await api(`/api/sayimlar/${s.id}`, json("PATCH", { durum: "acik" }));
      } else if (islem === "ad") {
        const ad = prompt("Sayım adı:", s.ad);
        if (ad === null || !ad.trim()) return;
        await api(`/api/sayimlar/${s.id}`, json("PATCH", { ad }));
      } else {
        if (!confirm(`"${s.ad}" ve ${sayi(ozet.okutma)} okutması kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
        await api(`/api/sayimlar/${s.id}`, { method: "DELETE" });
        location.href = "/";
        return;
      }
      await yenile();
      setMsg({ t: "Kaydedildi.", ok: true });
    } catch (e) {
      setMsg({ t: (e as Error).message });
    }
  }

  const benimMi = (o: Okutma) => o.kullanici === me?.username || yonetici;

  return (
    <div className="okut-kap !max-w-[900px]">
      <div className="ozet-kutular">
        <div>
          <span>Çeşit</span>
          <b>{sayi(ozet.cesit)}</b>
        </div>
        <div>
          <span>Toplam miktar</span>
          <b>{sayi(Math.round(ozet.toplam * 1000) / 1000)}</b>
        </div>
        <div>
          <span>Okutma</span>
          <b>{sayi(ozet.okutma)}</b>
        </div>
      </div>

      <div className="panel !mb-0 !p-3">
        <h2 className="!mb-2">Dışa aktar</h2>
        {bekleyen > 0 && (
          <div className="bekleyen-uyari !mb-2">Bu telefonda {bekleyen} okutma henüz gönderilmedi; dosyada olmazlar.</div>
        )}
        <div className="indir-satir">
          <a className="yeni-btn !py-2.5 no-underline" href={`/api/sayimlar/${s.id}/disa-aktar.txt`}>
            TXT indir
          </a>
          <a className="savebtn no-underline" href={`/api/sayimlar/${s.id}/disa-aktar.xlsx`}>
            Excel indir
          </a>
        </div>
        <p className="yardim !mb-0 !mt-2">TXT biçimi (ayraç, kodlama, satır sonu…) Yönetim → Ayarlar'dan değişir.</p>
      </div>

      <div className="arac-cubugu !mb-0">
        <input className="arama !py-2.5" type="search" placeholder="Barkod, ürün adı, stok kodu…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {(ozet.listedeYok > 0 || ozet.hatali > 0) && (
        <div className="filtreler !mb-0">
          <button type="button" className={"filtre" + (filtre === "tumu" ? " secili" : "")} onClick={() => setFiltre("tumu")}>
            Tümü ({ozet.cesit})
          </button>
          {urunListesiVar && ozet.listedeYok > 0 && (
            <button type="button" className={"filtre" + (filtre === "listedeYok" ? " secili" : "")} onClick={() => setFiltre("listedeYok")}>
              Listede yok ({ozet.listedeYok})
            </button>
          )}
          {ozet.hatali > 0 && (
            <button type="button" className={"filtre" + (filtre === "hatali" ? " secili" : "")} onClick={() => setFiltre("hatali")}>
              Kontrol hanesi hatalı ({ozet.hatali})
            </button>
          )}
        </div>
      )}
      <div className={"status" + (msg.t ? (msg.ok ? " ok" : " err") : "") + " !mt-0"} role="status">
        {msg.t}
      </div>

      {gorunen.length === 0 ? (
        <div className="panel empty">{satirlar.length ? "Aramaya uyan barkod yok." : "Henüz okutma yok."}</div>
      ) : (
        <table className="liste-tablo">
          <tbody>
            {gorunen.map((x) => (
              <FragmentSatir
                key={x.barkod}
                x={x}
                acik={acik === x.barkod}
                onAc={() => void ac(x.barkod)}
                urunListesiVar={urunListesiVar}
                okutmalar={acik === x.barkod ? okutmalar : null}
                kapali={kapali}
                benimMi={benimMi}
                onDegistir={okutmaDegistir}
              />
            ))}
          </tbody>
        </table>
      )}

      <div className="panel !p-3">
        <h2 className="!mb-2">Sayım</h2>
        <p className="yardim !mb-2">
          {s.olusturan} açtı, {saat(s.olusturma)}.
          {kapali && s.kapatan ? ` ${s.kapatan} kapattı, ${saat(s.kapanma!)}.` : ""}
          {s.aciklama ? ` Not: ${s.aciklama}` : ""}
        </p>
        <div className="indir-satir">
          <button type="button" className="kucuk-btn" onClick={() => void sayimIslem("ad")}>
            Adını değiştir
          </button>
          {!kapali ? (
            <button type="button" className="kucuk-btn" onClick={() => void sayimIslem("kapat")}>
              Sayımı kapat
            </button>
          ) : (
            yonetici && (
              <button type="button" className="kucuk-btn" onClick={() => void sayimIslem("ac")}>
                Yeniden aç
              </button>
            )
          )}
          {yonetici && (
            <button type="button" className="kucuk-btn !text-red-600 !border-red-300" onClick={() => void sayimIslem("sil")}>
              Sayımı sil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FragmentSatir({
  x,
  acik,
  onAc,
  urunListesiVar,
  okutmalar,
  kapali,
  benimMi,
  onDegistir,
}: {
  x: Toplam;
  acik: boolean;
  onAc: () => void;
  urunListesiVar: boolean;
  okutmalar: Okutma[] | null;
  kapali: boolean;
  benimMi: (o: Okutma) => boolean;
  onDegistir: (o: Okutma, sil: boolean) => Promise<void>;
}) {
  return (
    <>
      <tr className="satir" onClick={onAc} aria-expanded={acik}>
        <td>
          <span className="bk">{x.barkod}</span>
          <span className="ad">
            {x.ad}
            {x.kod ? ` · ${x.kod}` : ""}
          </span>
          <span className="flex flex-wrap gap-1 mt-0.5">
            {urunListesiVar && !x.listede && <span className="rozet sari">Listede yok</span>}
            {x.kontrolHatali && <span className="rozet kirmizi">Kontrol hanesi hatalı</span>}
          </span>
        </td>
        <td className="miktar">
          {sayi(x.miktar)}
          <span className="block text-[11px] font-normal text-stone-500">{x.okutma} okutma</span>
        </td>
      </tr>
      {acik && (
        <tr className="detay">
          <td colSpan={2}>
            {!okutmalar ? (
              <div className="skel h-10 w-full" />
            ) : (
              <ul>
                {okutmalar.map((o) => (
                  <li key={o.id}>
                    <span>
                      {saat(o.zaman)} · {o.kullanici}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <b className="tabular-nums">{sayi(o.miktar)}</b>
                      {!kapali && benimMi(o) && (
                        <>
                          <button type="button" className="kucuk-btn" onClick={() => void onDegistir(o, false)}>
                            Düzelt
                          </button>
                          <button type="button" className="kucuk-btn !text-red-600" onClick={() => void onDegistir(o, true)}>
                            Sil
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
