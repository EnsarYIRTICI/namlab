"use client";
/**
 * Çevrimdışı okutma kuyruğu. Her okutma önce telefonda (localStorage) kuyruğa yazılır, sonra sunucuya gönderilir.
 * Depoda wifi kopsa da okutma kaybolmaz; bağlantı gelince otomatik gider. Sunucu aynı istemciId'yi ikinci kez
 * yazmadığı için, cevap gelmeden kopan istek güvenle tekrar gönderilir.
 */

export interface KuyrukOkutma {
  istemciId: string;
  sayimId: string;
  barkod: string;
  miktar: number;
  zaman: string; // ISO
}

const ANAHTAR = "namlab-kuyruk-v1";

function oku(): KuyrukOkutma[] {
  try {
    const v = JSON.parse(localStorage.getItem(ANAHTAR) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// localStorage kullanılamazsa (gizli sekme / dolu) kuyruk bellekte tutulur
let bellek: KuyrukOkutma[] | null = null;
function yaz(l: KuyrukOkutma[]) {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(l));
    bellek = null;
  } catch {
    bellek = l;
  }
}
const liste = () => bellek ?? oku();

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // eski tarayıcı (HTTP'de randomUUID yok): getRandomValues ile v4
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function kuyrugaEkle(o: KuyrukOkutma) {
  yaz([...liste(), o]);
}

export function bekleyenler(sayimId?: string): KuyrukOkutma[] {
  const l = liste();
  return sayimId ? l.filter((o) => o.sayimId === sayimId) : l;
}

export function kuyruktanSil(istemciIdler: string[]) {
  const s = new Set(istemciIdler);
  yaz(liste().filter((o) => !s.has(o.istemciId)));
}
