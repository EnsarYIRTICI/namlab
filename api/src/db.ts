import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

// Basit, sıralı migrasyon sistemi. Yeni değişiklik = listeye yeni kayıt ekleyin (eskileri değiştirmeyin).
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
      -- Roller: yonetici her şeyi yapar; personel sayım açar, okutur, dışa aktarır.
      CREATE TABLE users (
        id            SERIAL PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol           TEXT NOT NULL DEFAULT 'personel' CHECK (rol IN ('yonetici', 'personel')),
        aktif         BOOLEAN NOT NULL DEFAULT true,
        son_giris     TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,               -- oturum belirtecinin SHA-256 özeti
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,                -- epoch ms
        last_seen  BIGINT NOT NULL,
        expires_at BIGINT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      -- Kim, ne zaman, ne yaptı. Kullanıcı silinse de kayıt kalır (ad metin olarak tutulur).
      CREATE TABLE islem_kaydi (
        id        BIGSERIAL PRIMARY KEY,
        zaman     TIMESTAMPTZ NOT NULL DEFAULT now(),
        kullanici TEXT,
        islem     TEXT NOT NULL,
        detay     JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip        TEXT
      );
      CREATE INDEX idx_islem_kaydi_zaman ON islem_kaydi(zaman DESC);
      CREATE INDEX idx_islem_kaydi_kullanici ON islem_kaydi(kullanici, id DESC);
      CREATE INDEX idx_islem_kaydi_islem ON islem_kaydi(islem, id DESC);

      -- Panelden değiştirilebilen ayarlar (tanımsız anahtar = varsayılan değer, bkz. ayarlar.ts)
      CREATE TABLE ayarlar (
        anahtar     TEXT PRIMARY KEY,
        deger       JSONB NOT NULL,
        guncelleyen TEXT,
        guncelleme  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Türkçe büyük/küçük harf ve i/ı/İ/I duyarsız karşılaştırma anahtarı. upper() veritabanı yereline bağlı
      -- olduğu için kullanılmıyor; translate karakter karakter çalışır, her kurulumda aynı sonucu verir.
      CREATE FUNCTION tr_fold(t text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $f$ SELECT translate(t, 'abcçdefgğhıijklmnoöprsştuüvyzqwxİâîûÂÎÛ', 'ABCÇDEFGĞHIIJKLMNOÖPRSŞTUÜVYZQWXIAIUAIU') $f$;

      -- Ürün listesi (isteğe bağlı): okutulan barkodun adını göstermek için. Excel/TXT'den yüklenir.
      CREATE TABLE urunler (
        barkod     TEXT PRIMARY KEY,
        ad         TEXT NOT NULL DEFAULT '',
        kod        TEXT NOT NULL DEFAULT '',            -- stok kodu (varsa)
        guncelleme TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Sayım oturumu (örn. "Reyon 3 - 28.09"). Birden çok kişi aynı sayıma okutabilir.
      CREATE TABLE sayimlar (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ad          TEXT NOT NULL,
        aciklama    TEXT NOT NULL DEFAULT '',
        durum       TEXT NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'kapali')),
        olusturan   TEXT,
        olusturma   TIMESTAMPTZ NOT NULL DEFAULT now(),
        kapatan     TEXT,
        kapanma     TIMESTAMPTZ
      );
      CREATE INDEX idx_sayimlar_olusturma ON sayimlar(olusturma DESC);

      -- Her okutma ayrı satır (kim, ne zaman). istemci_id: telefonda üretilen kimlik; bağlantı kopup
      -- aynı okutma tekrar gönderilirse ikinci kez yazılmaz.
      CREATE TABLE okutmalar (
        id         BIGSERIAL PRIMARY KEY,
        sayim_id   UUID NOT NULL REFERENCES sayimlar(id) ON DELETE CASCADE,
        barkod     TEXT NOT NULL,
        miktar     NUMERIC(14,3) NOT NULL,
        kullanici  TEXT,
        zaman      TIMESTAMPTZ NOT NULL DEFAULT now(),   -- telefonda okutulduğu an
        kayit      TIMESTAMPTZ NOT NULL DEFAULT now(),   -- sunucuya ulaştığı an
        istemci_id UUID NOT NULL UNIQUE
      );
      CREATE INDEX idx_okutmalar_sayim ON okutmalar(sayim_id, id DESC);
      CREATE INDEX idx_okutmalar_sayim_barkod ON okutmalar(sayim_id, barkod);
    `,
  },
];

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727004)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id as string));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        console.log(`Migrasyon uygulandı: ${m.id}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727004)").catch(() => {});
    client.release();
  }
}
