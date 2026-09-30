"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { sablonHatasi, txtMetni, type TxtSatir } from "@/lib/txtOnizleme";
import type { Ayarlar } from "@/lib/types";

/** Hazır biçimler: yaygın terminal / ERP içe aktarma biçimleri */
const HAZIR: { ad: string; a: Partial<Ayarlar> }[] = [
  { ad: "barkod;miktar (varsayılan)", a: { txtSablon: "{barkod};{miktar}", txtBaslik: "", txtToplu: true } },
  { ad: "barkod,miktar", a: { txtSablon: "{barkod},{miktar}", txtBaslik: "", txtToplu: true, txtOndalikAyrac: "." } },
  { ad: "barkod <sekme> miktar", a: { txtSablon: "{barkod}\t{miktar}", txtBaslik: "", txtToplu: true } },
  { ad: "Sabit genişlik (barkod 20 + miktar 10)", a: { txtSablon: "{barkod:20}{miktar:>10}", txtBaslik: "", txtToplu: true } },
  { ad: "Her okutma ayrı satır, tarih/saatli", a: { txtSablon: "{barkod};{miktar};{tarih};{saat}", txtBaslik: "", txtToplu: false } },
];

const ORNEK: TxtSatir[] = [
  { barkod: "8690504000013", miktar: 12, ad: "ÜLKER ÇİKOLATALI GOFRET", kod: "S0001", zaman: new Date(), kullanici: "ali" },
  { barkod: "96385074", miktar: 2.5, ad: "PEYNİR (KG)", kod: "S0002", zaman: new Date(), kullanici: "ali" },
  { barkod: "8690000000001", miktar: 1, ad: "", kod: "", zaman: new Date(), kullanici: "ayse" },
];

/** Önizlemede görünmeyen karakterleri işaretle: sekme →, satır sonu ¶ / ↵ */
function gorunur(m: string, crlf: boolean): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  m.split(crlf ? "\r\n" : "\n").forEach((satir, i, arr) => {
    satir.split("\t").forEach((p, j) => {
      if (j) out.push(<span key={`t${i}-${j}`} className="gorunmez">→</span>);
      out.push(p.replace(/ /g, "·"));
    });
    if (i < arr.length - 1) out.push(<span key={`n${i}`} className="gorunmez">{" ↵"}{"\n"}</span>);
  });
  return out;
}

export default function AyarlarSekmesi() {
  const [kayitli, setKayitli] = useState<Ayarlar | null>(null);
  const [f, setF] = useState<Ayarlar | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean }>({ t: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Ayarlar>("/api/ayarlar")
      .then((a) => {
        setKayitli(a);
        setF(a);
      })
      .catch((e) => setMsg({ t: "Ayarlar okunamadı: " + (e as Error).message }));
  }, []);

  const onizleme = useMemo(() => {
    if (!f) return "";
    // Toplu değilse örnekte ilk barkod iki kez okutulmuş gibi göster
    const satirlar = f.txtToplu ? ORNEK : [{ ...ORNEK[0]!, miktar: 10 }, ORNEK[1]!, { ...ORNEK[0]!, miktar: 2 }, ORNEK[2]!];
    return txtMetni(satirlar, f, { sayim: "Reyon 3", tarih: new Date() });
  }, [f]);

  if (!f || !kayitli) return msg.t ? <div className="status err">{msg.t}</div> : <div className="skel h-64 w-full" />;

  const sablonH = sablonHatasi(f.txtSablon);
  const degisen = (Object.keys(f) as (keyof Ayarlar)[]).filter((k) => f[k] !== kayitli[k]);
  const set = <K extends keyof Ayarlar>(k: K, v: Ayarlar[K]) => setF({ ...f, [k]: v });
  // Şablon kutusunda sekme karakteri "\t" olarak yazılır
  const sablonGoster = (s: string) => s.replace(/\t/g, "\\t");
  const sablonOku = (s: string) => s.replace(/\\t/g, "\t");

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({ t: "" });
    try {
      const yeni = await api<Ayarlar>("/api/admin/ayarlar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(degisen.map((k) => [k, f![k]]))),
      });
      setKayitli(yeni);
      setF(yeni);
      setMsg({ t: "Kaydedildi. Bundan sonra indirilen TXT dosyaları bu biçimde olur.", ok: true });
    } catch (err) {
      setMsg({ t: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={kaydet}>
      <h2>📄 TXT çıktı biçimi</h2>
      <p className="yardim">
        Sayımın "TXT indir" dosyası bu ayarlarla oluşur. Varsayılan, el terminallerinin kontrolsüz sayım çıktısı gibidir:
        her satırda <span className="kod">barkod;miktar</span>, Windows satır sonu (CRLF), Türkçe Windows kodlaması. ERP'niz
        başka biçim istiyorsa aşağıdan değiştirin; önizleme anında güncellenir.
      </p>
      <div className="ayar-form">
        <label className="alan">
          <span>Hazır biçim</span>
          <select
            value=""
            onChange={(e) => {
              const h = HAZIR[Number(e.target.value)];
              if (h) setF({ ...f, ...h.a });
            }}
          >
            <option value="">Seçin…</option>
            {HAZIR.map((h, i) => (
              <option key={h.ad} value={i}>
                {h.ad}
              </option>
            ))}
          </select>
        </label>
        <label className="alan">
          <span>Satır şablonu</span>
          <input value={sablonGoster(f.txtSablon)} onChange={(e) => set("txtSablon", sablonOku(e.target.value))} spellCheck={false} />
          <small className={"ipucu-metin" + (sablonH ? " hata" : "")}>
            {sablonH ??
              "Alanlar: {barkod} {miktar} {ad} {kod} {tarih} {saat} {kullanici} {sira} {sayim}. Sekme için \\t. Sabit genişlik: {barkod:20} (sağı boşluk), {miktar:>8} (solu boşluk), {miktar:08} (solu sıfır)."}
          </small>
        </label>
        <label className="alan">
          <span>Başlık satırı (boş: başlık yok)</span>
          <input value={sablonGoster(f.txtBaslik)} onChange={(e) => set("txtBaslik", sablonOku(e.target.value))} spellCheck={false} placeholder="örn. BARKOD;MIKTAR" />
        </label>
        <div className="form-satir !mb-0">
          <label className="alan">
            <span>Aynı barkod</span>
            <select value={f.txtToplu ? "1" : "0"} onChange={(e) => set("txtToplu", e.target.value === "1")}>
              <option value="1">Tek satır, miktarlar toplanır</option>
              <option value="0">Her okutma ayrı satır</option>
            </select>
          </label>
          <label className="alan">
            <span>Miktar ondalığı</span>
            <select value={f.txtOndalik} onChange={(e) => set("txtOndalik", Number(e.target.value))}>
              <option value={-1}>Otomatik (tam sayıysa ondalıksız)</option>
              <option value={0}>0 (yuvarlanır!)</option>
              <option value={1}>1 basamak</option>
              <option value={2}>2 basamak</option>
              <option value={3}>3 basamak</option>
            </select>
          </label>
          <label className="alan">
            <span>Ondalık ayracı</span>
            <select value={f.txtOndalikAyrac} onChange={(e) => set("txtOndalikAyrac", e.target.value as "," | ".")}>
              <option value=",">Virgül (2,5)</option>
              <option value=".">Nokta (2.5)</option>
            </select>
          </label>
        </div>
        <div className="form-satir !mb-0">
          <label className="alan">
            <span>Karakter kodlaması</span>
            <select value={f.txtKodlama} onChange={(e) => set("txtKodlama", e.target.value as Ayarlar["txtKodlama"])}>
              <option value="windows-1254">Windows-1254 (Türkçe Windows, eski programlar)</option>
              <option value="utf-8">UTF-8</option>
              <option value="utf-8-bom">UTF-8 (BOM'lu)</option>
            </select>
          </label>
          <label className="alan">
            <span>Satır sonu</span>
            <select value={f.txtSatirSonu} onChange={(e) => set("txtSatirSonu", e.target.value as "crlf" | "lf")}>
              <option value="crlf">Windows (CRLF)</option>
              <option value="lf">Linux (LF)</option>
            </select>
          </label>
          <label className="alan">
            <span>Son satırdan sonra</span>
            <select value={f.txtSonSatirSonu ? "1" : "0"} onChange={(e) => set("txtSonSatirSonu", e.target.value === "1")}>
              <option value="1">Satır sonu var</option>
              <option value="0">Yok</option>
            </select>
          </label>
        </div>
        <div>
          <span className="text-[12px] text-stone-500">Önizleme (örnek veriyle; · boşluk, → sekme, ↵ satır sonu)</span>
          <pre className="onizleme-txt">{sablonH ? "—" : gorunur(onizleme, f.txtSatirSonu === "crlf")}</pre>
        </div>
        <label className="alan dar">
          <span>Kamera: aynı barkodu tekrar sayma süresi (ms)</span>
          <input
            type="number"
            min={300}
            max={10000}
            step={100}
            value={f.kameraTekrarMs}
            onChange={(e) => set("kameraTekrarMs", Number(e.target.value))}
          />
          <small className="ipucu-metin">
            Kamera barkodu kadrajda gördükçe tekrar okur; bu süre içinde aynı barkod yeni okutma sayılmaz. Aynı ürünü art arda
            okutmak için barkodu kadrajdan çekip yeniden gösterin ya da miktar girin.
          </small>
        </label>
      </div>
      <div className="form-satir !items-center !mt-3">
        <button type="submit" className="savebtn" disabled={busy || degisen.length === 0 || !!sablonH}>
          Kaydet
        </button>
        {degisen.length > 0 && (
          <button type="button" className="metin-btn" onClick={() => setF(kayitli)}>
            Değişiklikleri geri al
          </button>
        )}
      </div>
      <div className={"status" + (msg.t ? (msg.ok ? " ok" : " err") : "")} role="status">
        {msg.t}
      </div>
    </form>
  );
}
