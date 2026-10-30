// Copies CesiumJS runtime assets (web workers, widgets CSS, textures) into
// public/cesium so Vite serves them in dev and bundles them in build.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium');
const dst = join(process.cwd(), 'public', 'cesium');

if (!existsSync(src)) {
  console.error('cesium build not found at', src);
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(join(src, dir), join(dst, dir), { recursive: true });
}
console.log('Cesium assets copied to public/cesium');
