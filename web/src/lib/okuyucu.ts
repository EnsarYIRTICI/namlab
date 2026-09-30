"use client";
/**
 * Kameradan barkod okuma. Tarayıcının kendi BarcodeDetector'ı varsa (Android Chrome) onu, yoksa (iPhone Safari,
 * masaüstü Firefox) zxing-wasm tabanlı eşdeğerini kullanır. wasm dosyası kendi sunucumuzdan (/zxing_reader.wasm) gelir.
 * Kamera yalnızca HTTPS'te (ya da localhost'ta) açılır.
 */

type Algilayici = { detect(src: CanvasImageSource): Promise<{ rawValue: string; format: string }[]> };

const BICIMLER = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];

let algilayiciSozu: Promise<Algilayici> | null = null;

async function algilayiciAl(): Promise<Algilayici> {
  const Yerel = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Algilayici; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Yerel) {
    try {
      const destek = await Yerel.getSupportedFormats();
      const bicimler = BICIMLER.filter((b) => destek.includes(b));
      if (bicimler.includes("ean_13")) return new Yerel({ formats: bicimler });
    } catch {
      /* yerel olan çalışmazsa aşağıdakine geç */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: { locateFile: (p: string, onek: string) => (p.endsWith(".wasm") ? "/zxing_reader.wasm" : onek + p) },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: BICIMLER as never });
}

export interface Okuyucu {
  durdur(): void;
  /** Fener (flaş) varsa aç/kapat; yoksa false döner */
  fener(acik: boolean): Promise<boolean>;
  fenerVar: boolean;
}

export class KameraHatasi extends Error {}

/** Kamerayı açar, görüntüde barkod gördükçe onOku çağırır. */
export async function kameraBaslat(video: HTMLVideoElement, onOku: (barkod: string, bicim: string) => void): Promise<Okuyucu> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new KameraHatasi(
      location.protocol === "https:" || location.hostname === "localhost"
        ? "Bu tarayıcı kamerayı desteklemiyor."
        : "Kamera sadece HTTPS bağlantıda açılır.",
    );
  }
  algilayiciSozu ??= algilayiciAl();
  let akis: MediaStream;
  try {
    akis = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    const ad = (e as DOMException).name;
    throw new KameraHatasi(
      ad === "NotAllowedError"
        ? "Kamera izni verilmedi. Tarayıcı ayarlarından bu siteye kamera izni verin."
        : ad === "NotFoundError"
          ? "Kamera bulunamadı."
          : "Kamera açılamadı: " + (e as Error).message,
    );
  }
  video.srcObject = akis;
  video.setAttribute("playsinline", "true"); // iPhone: tam ekrana geçmesin
  video.muted = true;
  await video.play().catch(() => {});

  const algilayici = await algilayiciSozu.catch((e) => {
    akis.getTracks().forEach((t) => t.stop());
    throw new KameraHatasi("Barkod okuyucu yüklenemedi: " + (e as Error).message);
  });

  let calisiyor = true;
  let mesgul = false;
  const dongu = async () => {
    if (!calisiyor) return;
    if (!mesgul && video.readyState >= 2 && video.videoWidth > 0) {
      mesgul = true;
      try {
        const sonuc = await algilayici.detect(video);
        for (const s of sonuc) if (s.rawValue) onOku(s.rawValue, s.format);
      } catch {
        /* tek karede hata: sonraki kareyi dene */
      }
      mesgul = false;
    }
    setTimeout(dongu, 120);
  };
  void dongu();

  const iz = akis.getVideoTracks()[0];
  const yetenek = (iz?.getCapabilities?.() ?? {}) as { torch?: boolean };
  return {
    fenerVar: !!yetenek.torch,
    async fener(acik: boolean) {
      if (!iz || !yetenek.torch) return false;
      try {
        await iz.applyConstraints({ advanced: [{ torch: acik } as MediaTrackConstraintSet] });
        return true;
      } catch {
        return false;
      }
    },
    durdur() {
      calisiyor = false;
      akis.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
