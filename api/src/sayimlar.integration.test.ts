import { randomUUID } from "node:crypto";
import iconv from "iconv-lite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, startHarness } from "./test/harness";

const DB = process.env.TEST_DATABASE_URL;
const SIFRE = "personel-sifre-123";

const ok = (barkod: string, miktar: number | string = 1, extra: Record<string, unknown> = {}) => ({
  istemciId: randomUUID(),
  barkod,
  miktar,
  ...extra,
});

describe.skipIf(!DB)("sayım ve okutma", () => {
  let h: Harness;
  let id: string;
  beforeAll(async () => {
    h = await startHarness(DB!);
  });
  afterAll(async () => {
    await h?.close();
  });

  it("ürün listesi: önizleme yazmaz, uygulama ekler, tekrar eden barkod uyarı verir", async () => {
    const urunler = [
      { satir: 2, barkod: "8690504000013", ad: "ÜLKER ÇİKOLATA", kod: "S001" },
      { satir: 3, barkod: "96385074", ad: "SU 0,5 L", kod: "" },
      { satir: 4, barkod: "96385074", ad: "SU 0.5 LT", kod: "" },
      { satir: 5, barkod: "", ad: "", kod: "" },
    ];
    const o = await h.call("POST", "/urunler/ice-aktar", { urunler, mod: "birlestir" });
    expect(o.status).toBe(200);
    expect(o.data).toMatchObject({ dosyadaki: 2, yeni: 2, uygulandi: false });
    expect(o.data.uyarilar).toHaveLength(1);
    expect((await h.call("GET", "/urunler")).data.toplam).toBe(0);
    const u = await h.call("POST", "/urunler/ice-aktar", { urunler, mod: "birlestir", uygula: true });
    expect(u.data.uygulandi).toBe(true);
    expect((await h.call("GET", "/urunler/barkod/96385074")).data).toMatchObject({ ad: "SU 0.5 LT" });
    expect((await h.call("GET", "/urunler?q=çikolata")).data.items).toHaveLength(1);
    expect((await h.call("GET", "/urunler/barkod/000")).data).toBeNull();
  });

  it("sayım açılır, adı boşsa tarihli ad verilir", async () => {
    const r = await h.call("POST", "/sayimlar", { ad: "", aciklama: "deneme" });
    expect(r.status).toBe(201);
    expect(r.data.ad).toMatch(/^Sayım \d{2}\.\d{2}\.\d{4}/);
    const r2 = await h.call("POST", "/sayimlar", { ad: "Reyon 3 / Kasa önü" });
    id = r2.data.id;
    expect((await h.call("GET", "/sayimlar")).data.map((s: any) => s.id)).toContain(id);
  });

  it("okutmalar toplanır; aynı istemciId tekrar yazılmaz; geçersizler ayrı döner", async () => {
    const a = ok("8690504000013");
    const r = await h.call("POST", `/sayimlar/${id}/okutmalar`, {
      okutmalar: [a, ok("8690504000013", "2,5"), ok("XYZ-1", 3), ok("", 1), ok("96385074", 0)],
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ eklenen: 3, tekrar: 0 });
    expect(r.data.hatali).toHaveLength(2);
    const t = r.data.toplamlar.find((x: any) => x.barkod === "8690504000013");
    expect(t).toMatchObject({ miktar: 3.5, okutma: 2, ad: "ÜLKER ÇİKOLATA", listede: true, kontrolHatali: false });
    // bağlantı koptu, telefon aynı okutmayı tekrar gönderdi
    const r2 = await h.call("POST", `/sayimlar/${id}/okutmalar`, { okutmalar: [a] });
    expect(r2.data).toMatchObject({ eklenen: 0, tekrar: 1, alinan: [a.istemciId] });
    // geri al: telefon kimliğiyle silinir, sonra aynı okutma tekrar eklenir (toplam değişmesin)
    const g = await h.call("DELETE", `/okutmalar/istemci/${a.istemciId}`);
    expect(g.data.toplamlar[0]).toMatchObject({ miktar: 2.5, okutma: 1 });
    expect((await h.call("DELETE", `/okutmalar/istemci/${a.istemciId}`)).status).toBe(404);
    await h.call("POST", `/sayimlar/${id}/okutmalar`, { okutmalar: [{ ...a, istemciId: randomUUID() }] });
    const d = (await h.call("GET", `/sayimlar/${id}`)).data;
    expect(d.ozet).toEqual({ cesit: 2, okutma: 3, toplam: 6.5, listedeYok: 1 });
  });

  it("kontrol hanesi hatalı barkod işaretlenir; telefonun saçma saati kullanılmaz", async () => {
    const r = await h.call("POST", `/sayimlar/${id}/okutmalar`, {
      okutmalar: [ok("8690504000014", 1, { zaman: "2001-01-01T00:00:00Z" })],
    });
    expect(r.data.toplamlar[0].kontrolHatali).toBe(true);
    expect(new Date(r.data.toplamlar[0].sonZaman).getFullYear()).toBeGreaterThan(2020);
  });

  it("personel kendi okutmasını düzeltir/siler, başkasınınkini yapamaz", async () => {
    await h.call("POST", "/admin/kullanicilar", { username: "depo", password: SIFRE });
    const p = await h.loginAs("depo", SIFRE);
    const r = await p("POST", `/sayimlar/${id}/okutmalar`, { okutmalar: [ok("96385074", 4)] });
    expect(r.data.eklenen).toBe(1);
    const liste = (await p("GET", `/sayimlar/${id}/okutmalar?barkod=96385074`)).data.items;
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ kullanici: "depo", miktar: 4, ad: "SU 0.5 LT" });
    const d = await p("PATCH", `/okutmalar/${liste[0].id}`, { miktar: "6" });
    expect(d.data.toplamlar[0].miktar).toBe(6);
    expect((await p("PATCH", `/okutmalar/${liste[0].id}`, { miktar: 0 })).status).toBe(400);
    const benim = (await h.call("GET", `/sayimlar/${id}/okutmalar?barkod=XYZ-1`)).data.items[0];
    expect((await p("DELETE", `/okutmalar/${benim.id}`)).status).toBe(403);
    expect((await p("DELETE", `/okutmalar/${liste[0].id}`)).status).toBe(200);
    expect((await p("DELETE", `/sayimlar/${id}`)).status).toBe(403); // sayım silme yöneticide
  });

  it("TXT: varsayılan biçim Windows-1254, CRLF, toplu, ilk okutma sırasıyla", async () => {
    const r = await fetch(`${h.base}/sayimlar/${id}/disa-aktar.txt`, { headers: { cookie: await h.login("tester", "test-sifresi-123") } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain("Reyon-3-Kasa");
    const metin = iconv.decode(Buffer.from(await r.arrayBuffer()), "win1254");
    expect(metin).toBe("8690504000013;3,5\r\nXYZ-1;3\r\n8690504000014;1\r\n");
  });

  it("TXT: tek tek, ürün adıyla, UTF-8", async () => {
    await h.call("PUT", "/admin/ayarlar", { txtToplu: false, txtSablon: "{barkod};{miktar};{ad}", txtKodlama: "utf-8", txtOndalik: 2, txtOndalikAyrac: "." });
    const r = await fetch(`${h.base}/sayimlar/${id}/disa-aktar.txt`, { headers: { cookie: await h.login("tester", "test-sifresi-123") } });
    const satirlar = (await r.text()).trimEnd().split("\r\n");
    expect(satirlar).toHaveLength(4);
    expect(satirlar[0]).toBe("8690504000013;2.50;ÜLKER ÇİKOLATA");
    expect(satirlar[1]).toBe("XYZ-1;3.00;");
    const xl = await fetch(`${h.base}/sayimlar/${id}/disa-aktar.xlsx`, { headers: { cookie: await h.login("tester", "test-sifresi-123") } });
    expect(xl.status).toBe(200);
    const k = (await h.call("GET", "/admin/islemler?islem=sayim_disa_aktar")).data.items;
    expect(k.map((x: any) => x.detay.bicim)).toEqual(["xlsx", "txt", "txt"]);
  });

  it("kapalı sayıma okutma eklenmez, düzeltilemez; personel yeniden açamaz, yönetici açar", async () => {
    const p = await h.loginAs("depo", SIFRE);
    expect((await p("PATCH", `/sayimlar/${id}`, { durum: "kapali" })).data).toMatchObject({ durum: "kapali", kapatan: "depo" });
    expect((await h.call("POST", `/sayimlar/${id}/okutmalar`, { okutmalar: [ok("1")] })).status).toBe(409);
    const bir = (await h.call("GET", `/sayimlar/${id}/okutmalar`)).data.items[0];
    expect((await h.call("DELETE", `/okutmalar/${bir.id}`)).status).toBe(409);
    expect((await p("PATCH", `/sayimlar/${id}`, { durum: "acik" })).status).toBe(403);
    expect((await h.call("PATCH", `/sayimlar/${id}`, { durum: "acik" })).data.durum).toBe("acik");
    expect((await h.call("GET", "/sayimlar?durum=kapali")).data).toHaveLength(0);
  });

  it("ürün listesi değiştir modu dosyada olmayanı siler; okutmalar kalır", async () => {
    const r = await h.call("POST", "/urunler/ice-aktar", {
      urunler: [{ satir: 2, barkod: "96385074", ad: "SU", kod: "" }],
      mod: "degistir",
      uygula: true,
    });
    expect(r.data).toMatchObject({ silinecek: 1, guncellenen: 1, uygulandi: true });
    const d = (await h.call("GET", `/sayimlar/${id}`)).data;
    expect(d.satirlar.find((x: any) => x.barkod === "8690504000013")).toMatchObject({ listede: false, ad: "" });
  });

  it("yönetici sayımı siler (okutmalarıyla)", async () => {
    expect((await h.call("DELETE", `/sayimlar/${id}`)).status).toBe(200);
    expect((await h.call("GET", `/sayimlar/${id}`)).status).toBe(404);
    expect((await h.call("GET", `/sayimlar/bozuk-id`)).status).toBe(404);
  });
});
