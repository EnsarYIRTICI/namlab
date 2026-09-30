// zxing-wasm okuyucu dosyasını public/ altına kopyalar: kamera okuyucu CDN'e gitmeden kendi sunucumuzdan yükler.
// (barcode-detector'ın bağımlılığı olan zxing-wasm; npm onu node_modules köküne koyar)
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const adaylar = [
  "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
  "node_modules/barcode-detector/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
];
const kaynak = adaylar.find((p) => existsSync(p));
if (!kaynak) {
  console.error("zxing_reader.wasm bulunamadı; npm ci çalıştı mı?");
  process.exit(1);
}
mkdirSync("public", { recursive: true });
copyFileSync(kaynak, "public/zxing_reader.wasm");
console.log("zxing_reader.wasm kopyalandı:", kaynak);
