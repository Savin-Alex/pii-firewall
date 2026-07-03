// Packs dist/ into a store-ready zip (contents at archive root, so manifest.json
// sits at the top level as stores require). Uses the system `zip` (macOS/Linux).
import { execSync } from 'child_process';
import { readFileSync, existsSync, rmSync } from 'fs';

if (!existsSync('dist/manifest.json')) {
  console.error('dist/ not built — run `npm run build` first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const out = `pii-firewall-${version}.zip`;
if (existsSync(out)) rmSync(out);

// -r recurse, -X strip extra macOS attrs; exclude dotfiles like .DS_Store
execSync(`cd dist && zip -r -X "../${out}" . -x ".*"`, { stdio: 'inherit' });
console.log(`\npackaged: ${out}`);
