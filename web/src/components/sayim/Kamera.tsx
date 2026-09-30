"use client";
import { useEffect, useRef, useState } from "react";
import { kameraBaslat, type Okuyucu } from "@/lib/okuyucu";

/**
 * Kamera görüntüsü + barkod algılama. Aynı barkod `tekrarMs` içinde tekrar görülürse yeni okutma sayılmaz
 * (kamera aynı barkodu saniyede birkaç kez görür). `duraklat` açıkken (örn. miktar penceresi) algılananlar yok sayılır.
 */
export default function Kamera({
  onOku,
  onKapat,
  duraklat,
  tekrarMs,
}: {
  onOku: (barkod: string) => void;
  onKapat: () => void;
  duraklat: boolean;
  tekrarMs: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const okuyucuRef = useRef<Okuyucu | null>(null);
  const sonRef = useRef<{ kod: string; t: number }>({ kod: "", t: 0 });
  const onOkuRef = useRef(onOku);
  const duraklatRef = useRef(duraklat);
  onOkuRef.current = onOku;
  duraklatRef.current = duraklat;
  const [durum, setDurum] = useState<"aciliyor" | "acik" | "hata">("aciliyor");
  const [hata, setHata] = useState("");
  const [fener, setFener] = useState(false);
  const [fenerVar, setFenerVar] = useState(false);
  const [okudu, setOkudu] = useState(false);

  useEffect(() => {
    let iptal = false;
    kameraBaslat(videoRef.current!, (kod) => {
      const simdi = Date.now();
      if (duraklatRef.current) return;
      if (kod === sonRef.current.kod && simdi - sonRef.current.t < tekrarMs) {
        sonRef.current.t = simdi; // barkod kadrajda kaldıkça süre uzar: çekilip yeniden gösterilince sayılır
        return;
      }
      sonRef.current = { kod, t: simdi };
      setOkudu(true);
      setTimeout(() => setOkudu(false), 350);
      onOkuRef.current(kod);
    })
      .then((o) => {
        if (iptal) return o.durdur();
        okuyucuRef.current = o;
        setFenerVar(o.fenerVar);
        setDurum("acik");
      })
      .catch((e: Error) => {
        if (iptal) return;
        setHata(e.message);
        setDurum("hata");
      });
    return () => {
      iptal = true;
      okuyucuRef.current?.durdur();
      okuyucuRef.current = null;
    };
  }, [tekrarMs]);

  // Ekran kilitlenip açılınca bazı telefonlarda görüntü donar: sekmeye dönünce oynatmayı sürdür
  useEffect(() => {
    const f = () => document.visibilityState === "visible" && void videoRef.current?.play().catch(() => {});
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  return (
    <div className={"kamera" + (okudu ? " okudu" : "")}>
      <video ref={videoRef} playsInline muted />
      <div className="nisan" aria-hidden="true" />
      <div className="kamera-araclar">
        {fenerVar && (
          <button
            type="button"
            aria-label="Fener"
            aria-pressed={fener}
            onClick={async () => {
              if (await okuyucuRef.current?.fener(!fener)) setFener(!fener);
            }}
          >
            🔦
          </button>
        )}
        <button type="button" aria-label="Kamerayı kapat" onClick={onKapat}>
          ✕
        </button>
      </div>
      {durum !== "acik" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white text-[14px]">
          {durum === "aciliyor" ? "Kamera açılıyor…" : hata}
        </div>
      )}
      {duraklat && durum === "acik" && (
        <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[12.5px] text-center py-1.5">Duraklatıldı</div>
      )}
    </div>
  );
}
