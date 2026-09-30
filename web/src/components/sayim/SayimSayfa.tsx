"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { bekleyenler, kuyrugaEkle, kuyruktanSil, uuid, type KuyrukOkutma } from "@/lib/kuyruk";
import { bip, sesiHazirla } from "@/lib/ses";
import type { Ayarlar, Me, SayimDetay, Toplam, Urun } from "@/lib/types";
import { sayi } from "../SayimListesi";
import Kamera from "./Kamera";
import ListePaneli from "./ListePaneli";
import MiktarPenceresi from "./MiktarPenceresi";

/** Bu cihazdaki son okutmalar (ekranda geçmiş ve "geri al" için) */
interface Gecmis {
  istemciId: string;
  barkod: string;
  miktar: number;
  zaman: string;
  durum: "bekliyor" | "gitti" | "hata" | "silindi";
  mesaj?: string;
}

type UrunBilgi = Urun | null; // null: listede yok

const MIKTAR_RE = /^\d{1,7}([.,]\d{1,3})?$/;

function tercihOku<T>(k: string, v: T): T {
  try {
    const x = localStorage.getItem("namlab-" + k);
    return x === null ? v : (JSON.parse(x) as T);
  } catch {
    return v;
  }
}
function tercihYaz(k: string, v: unknown) {
  try {
    localStorage.setItem("namlab-" + k, JSON.stringify(v));
  } catch {}
}

export default function SayimSayfa({ id }: { id: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [detay, setDetay] = useState<SayimDetay | null>(null);
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [hata, setHata] = useState("");
  const [sekme, setSekme] = useState<"okut" | "liste">("okut");
  const [toplamlar, setToplamlar] = useState<Map<string, Toplam>>(new Map());
  const [gecmis, setGecmis] = useState<Gecmis[]>([]);
  const [bekleyen, setBekleyen] = useState(0);
  const [baglantiYok, setBaglantiYok] = useState(false);
  const [urunler, setUrunler] = useState<Map<string, UrunBilgi>>(new Map());
  const [urunListesiVar, setUrunListesiVar] = useState(false);

  const [kameraAcik, setKameraAcik] = useState(false);
  const [giris, setGiris] = useState("");
  const [miktar, setMiktar] = useState("1");
  const [miktarKilit, setMiktarKilit] = useState(false);
  const [miktarSor, setMiktarSor] = useState(false);
  const [soru, setSoru] = useState<string | null>(null); // miktarı sorulan barkod
  const girisRef = useRef<HTMLInputElement>(null);
  const gonderiliyor = useRef(false);
  const urunlerRef = useRef(urunler);
  urunlerRef.current = urunler;

  const kapali = detay?.sayim.durum === "kapali";
  const son = gecmis[0];

  // ---------- Yükleme ----------

  const detayYukle = useCallback(async () => {
    try {
      const d = await api<SayimDetay>(`/api/sayimlar/${id}`);
      setDetay(d);
      setToplamlar(new Map(d.satirlar.map((t) => [t.barkod, t])));
      setHata("");
    } catch (e) {
      if ((e as ApiError).status === 404) setHata("Sayım bulunamadı (silinmiş olabilir).");
      else setHata(e instanceof TypeError ? "Sunucuya ulaşılamıyor" : (e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setMiktarKilit(tercihOku("miktarKilit", false));
    setMiktarSor(tercihOku("miktarSor", false));
    // Önceki oturumdan kalmış, gönderilmemiş okutmalar geçmişte görünsün
    setGecmis(
      bekleyenler(id)
        .reverse()
        .map((o) => ({ istemciId: o.istemciId, barkod: o.barkod, miktar: o.miktar, zaman: o.zaman, durum: "bekliyor" })),
    );
    setBekleyen(bekleyenler(id).length);
    api<Me>("/api/me").then(setMe).catch(() => {});
    api<Ayarlar>("/api/ayarlar").then(setAyar).catch(() => {});
    api<{ toplam: number }>("/api/urunler?q=")
      .then((r) => setUrunListesiVar(r.toplam > 0))
      .catch(() => {});
    void detayYukle();
  }, [id, detayYukle]);

  // ---------- Gönderme (kuyruk) ----------

  const gonder = useCallback(async () => {
    if (gonderiliyor.current) return;
    gonderiliyor.current = true;
    try {
      for (;;) {
        const parca = bekleyenler(id).slice(0, 200);
        if (!parca.length) break;
        let r: { alinan: string[]; hatali: { istemciId: string; mesaj: string }[]; toplamlar: Toplam[] };
        try {
          r = await api(`/api/sayimlar/${id}/okutmalar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ okutmalar: parca.map(({ sayimId: _s, ...o }) => o) }),
          });
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            // Sayım kapatılmış: bu okutmalar gönderilemez, kullanıcıya gösterilir (liste sekmesinden silebilir)
            setHata(e.message);
            void detayYukle();
          } else {
            setBaglantiYok(true);
          }
          break;
        }
        setBaglantiYok(false);
        const hataliMap = new Map(r.hatali.map((h) => [h.istemciId, h.mesaj]));
        kuyruktanSil([...r.alinan, ...hataliMap.keys()]);
        const alinan = new Set(r.alinan);
        setGecmis((g) =>
          g.map((x) =>
            alinan.has(x.istemciId)
              ? { ...x, durum: "gitti" }
              : hataliMap.has(x.istemciId)
                ? { ...x, durum: "hata", mesaj: hataliMap.get(x.istemciId) }
                : x,
          ),
        );
        if (hataliMap.size) bip("hata");
        setToplamlar((m) => {
          const y = new Map(m);
          for (const t of r.toplamlar) y.set(t.barkod, t);
          return y;
        });
      }
    } finally {
      gonderiliyor.current = false;
      setBekleyen(bekleyenler(id).length);
    }
  }, [id, detayYukle]);

  // Bağlantı gelince / aralıklarla bekleyenleri tekrar dene
  useEffect(() => {
    void gonder();
    const t = setInterval(() => bekleyenler(id).length && void gonder(), 5000);
    const online = () => void gonder();
    window.addEventListener("online", online);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [id, gonder]);

  // ---------- Okutma ----------

  const urunBul = useCallback(
    async (barkod: string) => {
      if (urunlerRef.current.has(barkod)) return urunlerRef.current.get(barkod) ?? null;
      try {
        const u = await api<Urun | null>(`/api/urunler/barkod/${encodeURIComponent(barkod)}`);
        setUrunler((m) => new Map(m).set(barkod, u));
        return u;
      } catch {
        return undefined; // bağlantı yok: bilinmiyor
      }
    },
    [],
  );

  const okut = useCallback(
    (hamBarkod: string, m: number) => {
      const barkod = hamBarkod.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (!barkod) return;
      if (/\s/.test(barkod) || barkod.length > 64) {
        bip("hata");
        setHata("Geçersiz barkod: " + barkod.slice(0, 64));
        return;
      }
      setHata("");
      const o: KuyrukOkutma = { istemciId: uuid(), sayimId: id, barkod, miktar: m, zaman: new Date().toISOString() };
      kuyrugaEkle(o);
      setBekleyen((n) => n + 1);
      setGecmis((g) => [{ istemciId: o.istemciId, barkod, miktar: m, zaman: o.zaman, durum: "bekliyor" as const }, ...g].slice(0, 50));
      bip("tamam");
      // Ürün listesi varsa ve barkod listede yoksa ikinci (çift) bip
      void urunBul(barkod).then((u) => {
        if (u === null && urunListesiVar) bip("listedeYok");
      });
      void gonder();
    },
    [id, gonder, urunBul, urunListesiVar],
  );

  const miktarGecerli = MIKTAR_RE.test(miktar.trim()) && Number(miktar.replace(",", ".")) > 0;

  /** Kameradan ya da el tarayıcısından gelen barkod */
  const barkodGeldi = useCallback(
    (barkod: string) => {
      if (kapali) {
        bip("hata");
        setHata("Sayım kapalı, okutma eklenemez.");
        return;
      }
      if (miktarSor) {
        setSoru(barkod);
        void urunBul(barkod);
        return;
      }
      if (!miktarGecerli) {
        bip("hata");
        setHata("Miktar geçersiz.");
        return;
      }
      okut(barkod, Number(miktar.replace(",", ".")));
      if (!miktarKilit) setMiktar("1");
    },
    [kapali, miktarSor, miktarGecerli, miktar, miktarKilit, okut, urunBul],
  );

  function elleGonder(e: React.SyntheticEvent) {
    e.preventDefault();
    sesiHazirla();
    const b = giris;
    setGiris("");
    barkodGeldi(b);
    // Masaüstünde / el tarayıcısında imleç kutuda kalsın (telefonda kamera açıkken klavye açılmasın)
    if (!kameraAcik) girisRef.current?.focus();
  }

  async function geriAl(g: Gecmis) {
    if (g.durum === "bekliyor" && bekleyenler(id).some((o) => o.istemciId === g.istemciId)) {
      kuyruktanSil([g.istemciId]);
      setBekleyen(bekleyenler(id).length);
    } else {
      try {
        const r = await api<{ toplamlar: Toplam[] }>(`/api/okutmalar/istemci/${g.istemciId}`, { method: "DELETE" });
        setToplamlar((m) => {
          const y = new Map(m);
          if (r.toplamlar.length) y.set(g.barkod, r.toplamlar[0]!);
          else y.delete(g.barkod);
          return y;
        });
      } catch (e) {
        setHata("Geri alınamadı: " + (e as Error).message);
        return;
      }
    }
    setGecmis((l) => l.map((x) => (x.istemciId === g.istemciId ? { ...x, durum: "silindi" } : x)));
  }

  // ---------- Görünüm ----------

  if (!detay) {
    return (
      <div className="okut-kap">
        {hata ? (
          <div className="panel">
            <h2>{hata}</h2>
            <a href="/" className="kucuk-btn">
              ← Sayımlar
            </a>
          </div>
        ) : (
          <div className="skel h-40 w-full" />
        )}
      </div>
    );
  }

  const sonUrun = son ? urunler.get(son.barkod) : undefined;
  const sonToplam = son ? toplamlar.get(son.barkod) : undefined;
  const sonSinif =
    !son || son.durum === "silindi" ? "" : son.durum === "hata" ? "hata" : sonUrun === null && urunListesiVar ? "yok" : "tamam";

  return (
    <div onPointerDown={sesiHazirla}>
      <div className="sayim-ust">
        <a href="/" className="geri" aria-label="Sayımlar">
          ←
        </a>
        <div className="baslik">
          <b>{detay.sayim.ad}</b>
          <span>
            {kapali ? "Kapalı · " : ""}
            {sayi(toplamlar.size)} çeşit · {me?.username}
          </span>
        </div>
        {bekleyen > 0 && <span className="rozet sari">{bekleyen} bekliyor</span>}
      </div>

      <div className="sekme-cubugu" role="tablist">
        <button type="button" role="tab" aria-selected={sekme === "okut"} onClick={() => setSekme("okut")}>
          Okut
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sekme === "liste"}
          onClick={() => {
            setSekme("liste");
            setKameraAcik(false);
            void detayYukle();
          }}
        >
          Liste ({sayi(toplamlar.size)})
        </button>
      </div>

      {sekme === "okut" ? (
        <div className="okut-kap">
          {kapali && (
            <div className="bekleyen-uyari">
              Bu sayım kapatılmış{detay.sayim.kapatan ? ` (${detay.sayim.kapatan})` : ""}; okutma eklenemez.
            </div>
          )}
          {!kapali &&
            (kameraAcik ? (
              <Kamera
                onOku={barkodGeldi}
                onKapat={() => setKameraAcik(false)}
                duraklat={soru !== null}
                tekrarMs={ayar?.kameraTekrarMs ?? 1500}
              />
            ) : (
              <button
                type="button"
                className="kamera-ac"
                onClick={() => {
                  sesiHazirla();
                  setKameraAcik(true);
                }}
              >
                📷 Kamerayla okut
              </button>
            ))}

          {!kapali && (
            <form className="giris-satir" onSubmit={elleGonder}>
              <input
                ref={girisRef}
                value={giris}
                onChange={(e) => setGiris(e.target.value)}
                placeholder="Barkod yaz ya da tarayıcıyla okut"
                inputMode="numeric"
                enterKeyHint="send"
                onKeyDown={(e) => {
                  // El tarayıcıları barkodun sonuna Enter (bazıları Tab) ekler. Formda iki kutu olduğu için
                  // tarayıcının kendiliğinden gönderme davranışına güvenilmez; burada yakalanır.
                  if (e.key === "Enter" || (e.key === "Tab" && giris.trim())) elleGonder(e);
                }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Barkod"
              />
              <div className="miktar-kutu" aria-label="Miktar">
                <button
                  type="button"
                  aria-label="Azalt"
                  onClick={() => setMiktar(String(Math.max(1, Math.floor(Number(miktar.replace(",", ".")) || 1) - 1)))}
                >
                  −
                </button>
                <input
                  value={miktarSor ? "?" : miktar}
                  disabled={miktarSor}
                  onChange={(e) => setMiktar(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  aria-label="Miktar"
                  className={miktarGecerli || miktarSor ? "" : "!text-red-600"}
                />
                <button
                  type="button"
                  aria-label="Artır"
                  onClick={() => setMiktar(String(Math.floor(Number(miktar.replace(",", ".")) || 0) + 1))}
                >
                  +
                </button>
              </div>
            </form>
          )}
          {!kapali && (
            <div className="ayar-satiri">
              <label>
                <input
                  type="checkbox"
                  checked={miktarKilit}
                  disabled={miktarSor}
                  onChange={(e) => {
                    setMiktarKilit(e.target.checked);
                    tercihYaz("miktarKilit", e.target.checked);
                  }}
                />
                Miktarı sabit tut
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={miktarSor}
                  onChange={(e) => {
                    setMiktarSor(e.target.checked);
                    tercihYaz("miktarSor", e.target.checked);
                  }}
                />
                Her okutmada miktar sor
              </label>
            </div>
          )}

          {hata && (
            <div className="status err !mt-0" role="alert">
              {hata}
            </div>
          )}
          {(baglantiYok || bekleyen > 0) && (
            <div className="bekleyen-uyari">
              <span>
                {baglantiYok ? "Bağlantı yok. " : ""}
                {bekleyen} okutma bu telefonda bekliyor; bağlantı gelince kendiliğinden gönderilir.
              </span>
              <button type="button" className="kucuk-btn" onClick={() => void gonder()}>
                Şimdi dene
              </button>
            </div>
          )}

          {son && son.durum !== "silindi" && (
            <div className={"son-okutma " + sonSinif} aria-live="polite">
              <div className="barkod">{son.barkod}</div>
              <div className="ad">
                {sonUrun
                  ? sonUrun.ad || "(adsız)"
                  : sonUrun === null
                    ? urunListesiVar
                      ? "⚠ Ürün listesinde yok"
                      : ""
                    : "…"}
              </div>
              <div className="alt">
                <span>
                  +{sayi(son.miktar)} ·{" "}
                  {son.durum === "hata" ? son.mesaj : son.durum === "bekliyor" ? "gönderiliyor…" : "kaydedildi"}
                </span>
                <span className="toplam">
                  Bu sayımda toplam: <b>{sonToplam ? sayi(sonToplam.miktar) : "…"}</b>
                </span>
              </div>
              {!kapali && son.durum !== "hata" && (
                <div>
                  <button type="button" className="kucuk-btn" onClick={() => void geriAl(son)}>
                    ↶ Geri al
                  </button>
                </div>
              )}
            </div>
          )}

          {gecmis.length > 1 && (
            <div className="panel !mb-0 !p-3">
              <h2 className="!mb-1">Bu telefondaki son okutmalar</h2>
              <ul className="gecmis">
                {gecmis.slice(1, 15).map((g) => (
                  <li key={g.istemciId} className={g.durum === "silindi" ? "line-through opacity-50" : ""}>
                    <span className="min-w-0">
                      <span className="bk">{g.barkod}</span>
                      <span className="ad">
                        {urunler.get(g.barkod)?.ad ?? ""}
                        {g.durum === "hata" ? " · " + g.mesaj : ""}
                      </span>
                    </span>
                    <span className="sag">
                      +{sayi(g.miktar)}
                      {g.durum === "bekliyor" ? " ⏳" : g.durum === "hata" ? " ⚠" : ""}
                      {!kapali && (g.durum === "gitti" || g.durum === "bekliyor") && (
                        <button type="button" className="kucuk-btn" onClick={() => void geriAl(g)} aria-label="Geri al">
                          ↶
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gecmis.length === 0 && !kapali && (
            <p className="yardim text-center">
              Kamerayı açıp barkodu çerçeveye tutun ya da bluetooth/USB el tarayıcısıyla kutuya okutun. Her okutmada bip
              sesi gelir; ürün listesinde olmayan barkodda çift bip.
            </p>
          )}
        </div>
      ) : (
        <ListePaneli
          detay={detay}
          me={me}
          toplamlar={toplamlar}
          bekleyen={bekleyen}
          yenile={detayYukle}
          onToplam={(barkod, t) =>
            setToplamlar((m) => {
              const y = new Map(m);
              if (t) y.set(barkod, t);
              else y.delete(barkod);
              return y;
            })
          }
        />
      )}

      {soru !== null && (
        <MiktarPenceresi
          barkod={soru}
          ad={urunler.get(soru)?.ad}
          onIptal={() => setSoru(null)}
          onTamam={(m) => {
            okut(soru, m);
            setSoru(null);
          }}
        />
      )}
    </div>
  );
}
