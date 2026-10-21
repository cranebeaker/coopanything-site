// One-time Cloudflare setup: checks you're logged in, creates the D1 database for votes (or finds
// the one you already have), writes its id into wrangler.jsonc and creates the tables.
// Run it with `npm run setup` after logging in (see README: "Hosting on Cloudflare").
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DB = 'coop-haven';
const CONFIG = new URL('../wrangler.jsonc', import.meta.url);
const run = (cmd, opts = {}) => execSync(`npx wrangler ${cmd}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], ...opts });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

try {
  const me = run('whoami');
  if (/not authenticated|You are not/i.test(me)) throw new Error(me);
  console.log(me.split('\n').filter((l) => /logged in|account|profile/i.test(l)).join('\n') || 'Logged in.');
} catch {
  console.error(`Not logged in to Cloudflare from this folder. Run these two first:

  npx wrangler auth create coophaven
  npx wrangler auth activate coophaven .

The first opens your browser: sign in with the Cloudflare account for this site.
The second makes this folder (and only this folder) use that login.`);
  process.exit(1);
}

let id = null;
try {
  const list = JSON.parse(run('d1 list --json'));
  id = (list.find((d) => d.name === DB) || {}).uuid || null;
} catch { /* older output: fall through to create */ }
if (id) {
  console.log(`Found the ${DB} database: ${id}`);
} else {
  const out = run(`d1 create ${DB}`);
  id = (out.match(UUID) || [])[0];
  if (!id) {
    console.error(out);
    console.error('Could not read the new database id from the output above. Paste it into wrangler.jsonc by hand.');
    process.exit(1);
  }
  console.log(`Created the ${DB} database: ${id}`);
}

const text = readFileSync(CONFIG, 'utf8');
writeFileSync(CONFIG, text.replace(/("database_id":\s*")[^"]*(")/, `$1${id}$2`));
console.log('Wrote its id into wrangler.jsonc.');

execSync(`npx wrangler d1 migrations apply ${DB} --remote`, { stdio: 'inherit' });
console.log('\nAll set. Publish the site with: npm run deploy');
