import { unzipSync, strFromU8 } from "fflate";

/**
 * Küçük, bağımlılığı az .xlsx okuyucu: her sayfayı metin tablosuna (string[][]) çevirir.
 * Sadece hücre değerleri okunur (biçim, formül, tarih biçimi yok). Formüllü hücrelerde Excel'in kaydettiği son değer alınır.
 */

export interface Sheet {
  name: string;
  rows: string[][];
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENT[e] ?? m;
    })
    // Excel'in kontrol karakteri kaçışı: _x000D_
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/** <si> / <is> içindeki tüm <t> parçalarını birleştirir (zengin metin), fonetik kısmı (rPh) atlar. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** "AB12" → 27 (0 tabanlı sütun) */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Sayısal hücre: "8.681657099061E+12" gibi değerler de düz yazılır (8681657099061). */
function numText(v: string): string {
  const n = Number(v);
  return v !== "" && Number.isFinite(n) ? String(n) : v;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(rm[1] ?? "");
    const rowNo = ra.r ? Number(ra.r) - 1 : rows.length;
    const cells: string[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1] ?? "");
      const idx = a.r ? colIndex(a.r) : next;
      next = idx + 1;
      const body = cm[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      switch (a.t) {
        case "s":
          val = v !== undefined ? (shared[Number(v)] ?? "") : "";
          break;
        case "inlineStr":
          val = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
          break;
        case "str":
        case "e":
          val = v !== undefined ? decodeXml(v) : "";
          break;
        case "b":
          val = v === "1" ? "1" : "0";
          break;
        default:
          val = v !== undefined ? numText(decodeXml(v).trim()) : "";
      }
      cells[idx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    if (rowNo >= rows.length) {
      while (rows.length < rowNo) rows.push([]);
      rows.push(cells);
    } else rows[rowNo] = cells;
  }
  return rows;
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** .xlsx dosyasındaki tüm sayfaları okur. Eski .xls (ikili) biçimi için anlaşılır hata verir. */
export function readXlsx(buf: ArrayBuffer | Uint8Array): Sheet[] {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (isOle(bytes)) {
    throw new Error("Eski Excel biçimi (.xls) okunamıyor. Dosyayı Excel'de açıp \"Farklı Kaydet → Excel Çalışma Kitabı (.xlsx)\" ile kaydedin ya da CSV olarak kaydedin.");
  }
  if (!isZip(bytes)) throw new Error("Dosya geçerli bir Excel (.xlsx) dosyası değil.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") && /\.(xml|rels)$/.test(f.name) });
  } catch {
    throw new Error("Excel dosyası açılamadı (bozuk olabilir).");
  }
  const get = (p: string) => (files[p] ? strFromU8(files[p]!) : null);

  const shared: string[] = [];
  const ss = get("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(textOf(m[1] ?? ""));

  const rels = new Map<string, string>();
  for (const m of (get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1] ?? "");
    if (a.Id && a.Target) {
      const t = a.Target.replace(/^\//, "");
      rels.set(a.Id, t.startsWith("xl/") ? t : "xl/" + t.replace(/^\.\//, ""));
    }
  }
  const sheets: Sheet[] = [];
  for (const m of (get("xl/workbook.xml") ?? "").matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1] ?? "");
    const path = rels.get(a["r:id"] ?? "") ?? "";
    const xml = get(path);
    if (xml) sheets.push({ name: decodeXml(a.name ?? `Sayfa ${sheets.length + 1}`), rows: parseSheet(xml, shared) });
  }
  // workbook.xml / rels okunamadıysa sayfa dosyalarını doğrudan dene
  if (sheets.length === 0) {
    for (const p of Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()) {
      sheets.push({ name: p.replace(/^.*\/|\.xml$/g, ""), rows: parseSheet(get(p)!, shared) });
    }
  }
  if (sheets.length === 0) throw new Error("Excel dosyasında sayfa bulunamadı.");
  return sheets;
}
