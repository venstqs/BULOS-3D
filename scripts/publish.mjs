// Puts Bulos 3D online.
//   node scripts/publish.mjs            the website and the Expo Go version
//   node scripts/publish.mjs site       only the website (landing page, /twin/, /app/)
//   node scripts/publish.mjs expo-go    only the Expo Go version
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://project-bulos-3d.expo.app';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');
const what = process.argv[2] ?? 'all';
const run = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

if (what === 'all' || what === 'expo-go') {
  console.log('\nPublishing the Expo Go version...\n');
  run('eas update --channel production --platform all --message "Bulos 3D for Expo Go" --environment production --input-dir .expo-go --non-interactive', mobile, {
    EXPO_GO_UPDATE: '1', EXPO_PUBLIC_HOSTED: '1', EXPO_PUBLIC_WEB_URL: `${SITE}/twin`,
  });
}

if (what === 'all' || what === 'site') {
  console.log('\nBuilding and publishing the website...\n');
  run('node scripts/build_hosted.mjs', root);
  run('eas deploy --prod', mobile);
  try {
    const res = await fetch(`${SITE}/twin/`);
    console.log(res.ok ? `\nOnline: ${SITE}` : `\n${SITE} answered ${res.status}.`);
  } catch {
    console.log(`\nThe site was published, but not at ${SITE}. The Expo Go version expects that address, so tell Claude which one you got.`);
  }
}
