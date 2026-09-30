import { strToU8, zipSync } from "fflate";

/**
 * Tek sayfalık, en küçük geçerli .xlsx yazıcı. Metin hücreleri (string) metin (inlineStr) yazılır: barkod gibi uzun
 * rakam dizileri Excel'de bilimsel gösterime (8,69E+12) dönmez, baştaki sıfırlar kaybolmaz. number değerler sayı hücresidir.
 * Başlık satırı kalın ve sabitlenmiş (dondurulmuş), otomatik filtre açık.
 */
export function xlsxYaz(sayfaAdi: string, basliklar: string[], satirlar: (string | number)[][], genislikler: number[] = []): Uint8Array {
  const esc = (s: string) =>
    s
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const kolon = (i: number) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const hucre = (v: string | number, r: number, c: number, stil: number) =>
    typeof v === "number"
      ? `<c r="${kolon(c)}${r}"${stil ? ` s="${stil}"` : ""}><v>${Number.isFinite(v) ? v : 0}</v></c>`
      : `<c r="${kolon(c)}${r}" t="inlineStr"${stil ? ` s="${stil}"` : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const satir = (vals: (string | number)[], r: number, stil: number) =>
    `<row r="${r}">${vals.map((v, c) => hucre(v ?? "", r, c, stil)).join("")}</row>`;

  const sonKolon = kolon(Math.max(basliklar.length - 1, 0));
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (genislikler.length
      ? `<cols>${genislikler.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "") +
    `<sheetData>${satir(basliklar, 1, 1)}${satirlar.map((s, i) => satir(s, i + 2, 0)).join("")}</sheetData>` +
    `<autoFilter ref="A1:${sonKolon}${satirlar.length + 1}"/>` +
    `</worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${esc(sayfaAdi.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sayfaAdi.slice(0, 31))}'!$A$1:$${sonKolon}$${satirlar.length + 1}</definedName></definedNames>` +
        `</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFEFECE6"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}
