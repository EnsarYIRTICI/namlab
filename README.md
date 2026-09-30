# Namlab v1.0 — Kontrolsüz sayım / barkod okutma

El terminalindeki "kontrolsüz sayım"ın telefondaki karşılığı. Barkod telefon kamerasıyla ya da bluetooth/USB el tarayıcısıyla okutulur. Aynı sayıma birden fazla kişi aynı anda okutabilir. Sonuç, terminallerin çıkardığı gibi **TXT** (varsayılan `barkod;miktar`, CRLF, Türkçe Windows kodlaması) ya da Excel olarak indirilir.

**Yığın:** Next.js 16 + TypeScript + Tailwind CSS 4 (arayüz) · Express 5 + TypeScript (API) · PostgreSQL 17 · Docker Compose. Giriş, roller, işlem kaydı ve yönetim paneli namtag/namrec ile aynı altyapıdır. Barkod okuma: tarayıcının kendi `BarcodeDetector`'ı (Android Chrome), yoksa [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (iPhone Safari dahil). wasm dosyası kendi sunucunuzdan gelir, CDN'e gidilmez.

```
tarayıcı → host nginx ─┬─ /api/ → api (127.0.0.1:4300) → postgres (iç ağ)
                       └─ /     → web (127.0.0.1:3300)
```

Portlar namtag (3000/4000), naman (3100/4100) ve namrec (3200/4200) ile çakışmaz.

## Kurulum

```bash
cd /opt && git clone https://github.com/EnsarYIRTICI/namlab.git && cd namlab
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
vim .env                       # ADMIN_PASSWORD'ü doldurun
docker compose up -d --build
docker compose logs api | tail  # "İlk yönetici oluşturuldu" görünmeli

cp nginx/namlab.conf /etc/nginx/sites-available/namlab.xenny.cloud
ln -s /etc/nginx/sites-available/namlab.xenny.cloud /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

DNS'te `namlab.xenny.cloud` sunucuyu göstermeli. Sertifika olarak mevcut `*.xenny.cloud` wildcard sertifikası kullanılır. **Kamera tarayıcıda yalnızca HTTPS'te açılır**; HTTP'de sadece el tarayıcısı ya da elle giriş çalışır. İlk girişten sonra `.env`'den `ADMIN_PASSWORD` satırını silin.

## Kullanım

1. **Yeni sayım** açın (ad boş bırakılırsa tarih-saat yazılır). Aynı sayımı başka telefonlar da ana sayfadan açıp okutabilir.
2. **Okut** sekmesi:
   - **📷 Kamerayla okut:** barkodu çerçeveye tutun. Her okutmada bip ve titreşim gelir. Ürün listesi yüklüyse ve barkod listede yoksa **çift bip** duyulur ve ekranda "Ürün listesinde yok" yazar. Fener varsa 🔦 düğmesi çıkar.
   - Kamera aynı barkodu kadrajda gördükçe tekrar okur; **ayarlanan süre (varsayılan 1,5 sn) içinde aynı barkod yeni okutma sayılmaz.** Aynı ürünü art arda saymak için barkodu kadrajdan çekip yeniden gösterin ya da miktarı yazın (örn. koli içi 24).
   - **El tarayıcısı / elle giriş:** barkod kutusuna okutun ya da yazın. Tarayıcının sonuna eklediği Enter/Tab okutmayı gönderir.
   - **Miktar:** varsayılan 1, her okutmadan sonra 1'e döner. "Miktarı sabit tut" işaretliyse değişmez. "Her okutmada miktar sor" işaretliyse her barkoddan sonra miktar penceresi açılır (hızlı düğmeler: 1, 2, 3 … 24, 50; ondalık kg girilebilir: 2,5).
   - **↶ Geri al:** son okutmayı (ya da listedeki herhangi birini) geri alır.
3. **Liste** sekmesi: barkod başına toplamlar. Satıra dokununca kim, ne zaman, kaç okuttu görünür; kendi okutmanızı düzeltir ya da silersiniz. "Listede yok" ve "Kontrol hanesi hatalı" (EAN/UPC son hanesi tutmuyor; genelde elle yazım hatası) filtreleri vardır.
4. **TXT indir / Excel indir.** Bitince **Sayımı kapat**: kapalı sayıma okutma eklenmez, düzeltme yapılmaz.

### Bağlantı koparsa

Her okutma önce telefona kaydedilir, sonra sunucuya gönderilir. Depoda wifi koparsa okutma kaybolmaz; üstte "N bekliyor" yazar ve bağlantı gelince kendiliğinden gönderilir (5 saniyede bir ve bağlantı dönünce denenir). Sunucu aynı okutmayı iki kez yazmaz: cevap gelmeden kopan istek güvenle tekrar gönderilir. Bekleyen okutma varken indirilen TXT'de bu okutmalar yoktur; ekranda uyarı çıkar.

Bekleyen okutmalar o telefonun tarayıcısında durur. Tarayıcı verileri silinirse ya da gizli sekmede çalışılıyorsa, gönderilmemiş okutmalar kaybolur.

## TXT çıktı biçimi (Yönetim → Ayarlar)

Varsayılan, el terminallerinin kontrolsüz sayım çıktısıdır:

```
8690504000013;12
96385074;2,5
```

- **Satır şablonu:** `{barkod}` `{miktar}` `{ad}` `{kod}` `{tarih}` `{saat}` `{kullanici}` `{sira}` `{sayim}`. Sekme için `\t`. Sabit genişlikli dosyalar için `{barkod:20}` (sağı boşlukla 20 karakter), `{miktar:>8}` (solu boşluk), `{miktar:08}` (solu sıfır). Hazır biçimler: `barkod;miktar`, `barkod,miktar`, sekmeli, sabit genişlik, her okutma ayrı satır + tarih/saat.
- **Aynı barkod:** tek satırda toplanır (varsayılan) ya da her okutma ayrı satır olur. Satır sırası ilk okutma sırasıdır (terminaldeki gibi).
- **Ondalık:** otomatik (tam sayıysa `12`, değilse `2,5`) ya da sabit 0-3 basamak; ayraç virgül/nokta. *0 basamak seçilirse kg'lı miktarlar yuvarlanır.*
- **Kodlama:** Windows-1254 (varsayılan; eski Windows programları için), UTF-8 ya da BOM'lu UTF-8. **Satır sonu:** CRLF (varsayılan) ya da LF. İsteğe bağlı başlık satırı.
- Önizleme, örnek veriyle anında güncellenir; boşluk `·`, sekme `→`, satır sonu `↵` ile gösterilir.

ERP'niz hangi biçimi istiyorsa, terminalin çıkardığı eski bir TXT'yi açıp satır yapısını buraya aynen kurun.

## Ürün listesi (isteğe bağlı, Yönetim → Ürün listesi)

Okutulan barkodun adını göstermek ve listede olmayanları işaretlemek için kullanılır; liste olmadan da sayım yapılır.

- Excel (.xlsx) ya da TXT/CSV. Başlıkta `Barkod` ve `Ürün Adı` / `Stok Adı` / `Açıklama`, isteğe bağlı `Stok Kodu` aranır. Başlık yoksa barkoda benzeyen sütun barkod, yanındaki metin ad sayılır; terminale yüklenen `barkod;ad` dosyaları olduğu gibi okunur. Ayraç (`;` sekme `,` `|`) ve Türkçe Windows kodlaması kendiliğinden anlaşılır.
- **Birleştir:** yenileri ekler, var olanların adını günceller, silmez. **Değiştir:** liste dosyadaki gibi olur (dosyada olmayanlar silinir; mevcut listenin yarısından fazlası silinecekse uyarır). Önce önizleme gösterilir. Okutmalar etkilenmez.
- 200.000 satıra kadar.

## Roller

| | Yönetici | Personel |
|---|:---:|:---:|
| Sayım açma, okutma, TXT/Excel indirme, sayımı kapatma | ✓ | ✓ |
| Kendi okutmasını düzeltme/silme (sayım açıkken) | ✓ | ✓ |
| Başkasının okutmasını düzeltme/silme | ✓ | |
| Kapalı sayımı yeniden açma, sayım silme | ✓ | |
| Ürün listesi yükleme, TXT biçimi ayarı, yönetim paneli | ✓ | |

İşlem kaydına girişler, sayım açma/kapama/silme, okutma düzeltme/silme (eski → yeni miktar ve okutan), dışa aktarma, ürün listesi yükleme, kullanıcı ve ayar değişiklikleri yazılır. Tek tek okutmalar işlem kaydına değil, sayımın kendisine kaydedilir (kim, ne zaman).

## Komut satırından kullanıcı yönetimi

```bash
docker compose exec api node dist/cli.js user add <kullanici> [--yonetici]
docker compose exec api node dist/cli.js user role <kullanici> <yonetici|personel>
docker compose exec api node dist/cli.js user passwd <kullanici>
docker compose exec api node dist/cli.js user delete <kullanici>
docker compose exec api node dist/cli.js user list
```

## Yedek

```bash
docker compose exec -T db pg_dump -U namlab namlab | gzip > namlab-db-$(date +%F).sql.gz
```

## Geliştirme

```bash
cd api && npm i && DATABASE_URL=postgres://... APP_ORIGIN=http://localhost:3300 ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run dev   # 4300
cd web && npm i && npm run dev        # 3300; /api istekleri localhost:4300'e yönlenir
npm test                              # hem api/ hem web/ içinde
cd api && npm run test:db             # veritabanı testleri (Docker ile geçici PostgreSQL)
```

Kamerayı bilgisayarda denemek için `localhost` yeterlidir (HTTPS istemez). Telefondan yerel ağ adresiyle (`http://192.168...`) açarsanız kamera açılmaz; HTTPS gerekir.

## Sınırlar / notlar

- **Terazi (tartılı ürün) barkodları** (27/28/29 ile başlayan, içinde gramaj olan) şimdilik ayrıştırılmaz; barkod olduğu gibi kaydedilir. Tartılı ürünlerde miktarı elle girin.
- Kamera ile okutmada ışık ve odak önemlidir; kötü ışıkta fener açın. Çok küçük ya da buruşuk barkodlarda el tarayıcısı daha hızlıdır.
- iPhone'da tarayıcının kendi barkod okuyucusu yoktur; zxing-wasm kullanılır (ilk açılışta ~1 MB indirilir, sonra önbellektedir).
- Sayım listesinde son 200 sayım gösterilir.
- Renkler `web/src/app/globals.css` başındaki `@theme` bloğundadır (vurgu rengi mor).
