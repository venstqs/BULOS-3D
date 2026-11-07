// Builds the public site into mobile/dist, with no server behind it:
//   /        the landing page
//   /twin/   the website (the twin runs in the browser, and the mobile app shows its 3D map)
//   /app/    the mobile app, for any phone browser
// The Mapbox token stays out: this build uses the free open map layers.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'mobile', 'dist');
const run = (cmd, cwd, env) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

rmSync(out, { recursive: true, force: true });

run(`npx vite build --outDir "${out}" --emptyOutDir`, root, {
  VITE_API: 'demo', VITE_HOSTED: '1', VITE_TWIN_URL: '/twin/', VITE_MAPBOX_TOKEN: '', VITE_APK_URL: process.env.VITE_APK_URL ?? '',
});
mkdirSync(join(out, 'twin'));
renameSync(join(out, 'index.html'), join(out, 'twin', 'index.html'));
renameSync(join(out, 'landing.html'), join(out, 'index.html'));
rmSync(join(out, 'cesium'), { recursive: true, force: true });   // the hosted site never loads it

const app = join(root, 'mobile', '.hosted-app');
rmSync(app, { recursive: true, force: true });
run(`npx expo export --platform web --output-dir .hosted-app`, join(root, 'mobile'), {
  EXPO_PUBLIC_HOSTED: '1', EXPO_PUBLIC_WEB_URL: '/twin', EXPO_BASE_URL: '/app',
});
cpSync(app, join(out, 'app'), { recursive: true });
rmSync(app, { recursive: true, force: true });

// Every screen can be reloaded or shared, even though the app is one page
const screens = ['forecast', 'map', 'maintenance', 'more', 'points', 'about', 'alerts', 'drill', 'journey', 'reports', 'safe', 'settings'];
if (existsSync(join(out, 'app', 'index.html'))) {
  for (const name of screens) {
    if (!existsSync(join(out, 'app', `${name}.html`))) copyFileSync(join(out, 'app', 'index.html'), join(out, 'app', `${name}.html`));
  }
}
console.log(`\nBuilt ${readdirSync(out).length} top-level items in mobile/dist`);
