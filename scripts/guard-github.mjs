import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const config=JSON.parse(await readFile(new URL('../cloud.config.json',import.meta.url),'utf8'));
const owner=config.githubOwner;
if (!owner || !Number.isSafeInteger(config.githubOwnerId)) throw new Error('Refusing a GitHub write: verified personal owner and account ID are required.');
const expected=`https://github.com/${owner}/${config.repository}.git`;
const remote=execFileSync('git',['remote','get-url','--push','origin'],{encoding:'utf8',cwd:new URL('..',import.meta.url)}).trim();
if (remote!==expected) throw new Error(`Refusing to push: origin must be exactly ${expected}`);
if (process.argv[3] && process.argv[3] !== expected) throw new Error('Refusing to push to a destination other than the verified personal repository.');
const user=JSON.parse(execFileSync('gh',['api','user'],{encoding:'utf8'}));
if (user.login.toLowerCase()!==owner.toLowerCase() || user.id!==config.githubOwnerId || user.type!=='User') throw new Error(`Refusing to push: authenticated as ${user.login}, expected personal account ${owner}.`);
console.log(`Verified personal destination: ${owner}/${config.repository}`);
