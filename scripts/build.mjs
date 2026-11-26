import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'dist');
const configPath = process.env.DAYBOOK_CONFIG || join(root, 'cloud.config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.mode !== 'cloud' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) || !/^(sb_publishable_|eyJ)/.test(config.publishableKey)) throw new Error('Supply the Supabase URL and publishable key in cloud.config.json. Never use a secret/service-role key.');
if (config.publishableKey.startsWith('eyJ')) {
  const claims = JSON.parse(Buffer.from(config.publishableKey.split('.')[1], 'base64url'));
  if (claims.role !== 'anon') throw new Error('Only a publishable or legacy anon key may be shipped to the browser.');
}
if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(config.githubOwner || '') || !Number.isSafeInteger(config.githubOwnerId) || config.githubOwnerId <= 0) throw new Error('A verified personal GitHub owner and account ID are required.');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'fonts'), { recursive: true });
await mkdir(join(out, 'vendor'), { recursive: true });
for (const name of ['index.html','styles.css','app.js','model.js','preferences.js','storage.js','cloud-store.js']) await copyFile(join(root,'public',name),join(out,name));
for (const name of ['font-0.ttf','font-1.ttf','font-2.ttf','font-3.ttf','font-4.ttf','DM-Sans-OFL.txt','Barlow-Condensed-OFL.txt']) await copyFile(join(root,'public/fonts',name),join(out,'fonts',name));
await writeFile(join(out,'fonts/fonts.css'), `
@font-face{font-family:'Chip Text';font-style:normal;font-weight:400;font-display:swap;src:url('./font-2.ttf') format('truetype')}
@font-face{font-family:'Chip Text';font-style:normal;font-weight:500;font-display:swap;src:url('./font-3.ttf') format('truetype')}
@font-face{font-family:'Chip Text';font-style:normal;font-weight:600 900;font-display:swap;src:url('./font-4.ttf') format('truetype')}
@font-face{font-family:'Chip Display';font-style:normal;font-weight:600;font-display:swap;src:url('./font-0.ttf') format('truetype')}
@font-face{font-family:'Chip Display';font-style:normal;font-weight:700;font-display:swap;src:url('./font-1.ttf') format('truetype')}
`);
await writeFile(join(out,'config.js'), `export default ${JSON.stringify({mode:'cloud',supabaseUrl:config.supabaseUrl,publishableKey:config.publishableKey})};\n`);
await writeFile(join(out,'.nojekyll'),'');
await build({ stdin:{contents:"export { createClient } from '@supabase/supabase-js';",resolveDir:root,sourcefile:'supabase-entry.js'},outfile:join(out,'vendor/supabase.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true });
console.log(`Built GitHub Pages app for ${config.githubOwner}. No task data or private fonts are included.`);
