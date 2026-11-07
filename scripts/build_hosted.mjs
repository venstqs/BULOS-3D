// Builds the public site into mobile/dist, with no server behind it:
//   /        the landing page
//   /twin/   the website (the twin runs in the browser, and the mobile app shows its 3D map)
//   /app/    the mobile app, for any phone browser
// The Mapbox token stays out: this build uses the free open map layers.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'mobile', 'dist');
const run = (cmd, cwd, env) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

rmSync(out, { recursive: true, force: true });

run(`npx vite build --outDir "${out}" --emptyOutDir`, root, {
  VITE_API: 'demo', VITE_HOSTED: '1', VITE_TWIN_URL: '/twin/', VITE_MAPBOX_TOKEN: '', VITE_APK_URL: process.env.VITE_APK_URL ?? '',
  VITE_EXPO_GO_URL: 'exp://u.expo.dev/e9142e41-5c3c-4c62-9b1f-330733d52242?runtime-version=exposdk%3A58.0.0&channel-name=production',
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
// A computer opening the phone app sees it in a phone-sized frame instead of stretched across the screen
const toFrame = '<script>(function(){var p=/Android.+Mobile|iPhone|iPod/.test(navigator.userAgent)||(matchMedia("(pointer: coarse)").matches&&Math.min(screen.width,screen.height)<600);if(!p&&window.top===window)location.replace("/phone.html#"+encodeURIComponent(location.pathname+location.search));})();</script>';
for (const name of readdirSync(join(out, 'app')).filter((f) => f.endsWith('.html'))) {
  const file = join(out, 'app', name);
  writeFileSync(file, readFileSync(file, 'utf8').replace('<head>', `<head>${toFrame}`));
}
console.log(`\nBuilt ${readdirSync(out).length} top-level items in mobile/dist`);
