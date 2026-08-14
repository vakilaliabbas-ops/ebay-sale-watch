// Connects to IMAP, finds recent eBay "you made the sale" emails, drafts the
// import-duty message for each, and writes an encrypted blob for the phone page.
//
//   node src/watch.js            → connect, detect, write data/drafts.enc
//   node src/watch.js --dry      → connect, detect, PRINT results (no file, no secrets shown)
//
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEmail, buildDraft, isEbaySale, flag } from './parse.js';
import { encryptJson } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const DEBUG = process.argv.includes('--debug');

// Non-secret settings live in config.json (committed). Secrets (IMAP_USER/IMAP_PASS/APP_PASSPHRASE)
// come from the environment: GitHub Actions secrets in the cloud, or the local .env when testing.
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8')); } catch {}
function env(name, def){ const v = process.env[name] ?? cfg[name]; return (v===undefined || v==='') ? def : v; }
function req(name){ const v = process.env[name] ?? cfg[name]; if(!v){ console.error(`Missing ${name} (set it as a GitHub secret, or in .env for local runs)`); process.exit(1);} return v; }

function stripHtml(html){
  return (html||'')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<\/(p|div|tr|table|li|br|h[1-6])>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#36;/g,'$')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
}

async function run(){
  const host = req('IMAP_HOST');
  const port = parseInt(env('IMAP_PORT','993'),10);
  const secure = env('IMAP_SECURE','true') === 'true';
  const user = req('IMAP_USER');
  const pass = req('IMAP_PASS');
  const mailbox = env('IMAP_MAILBOX','INBOX');
  const lookbackDays = parseInt(env('LOOKBACK_DAYS','7'),10);

  console.log(`Connecting to ${host}:${port} as ${user} …`);
  const client = new ImapFlow({ host, port, secure, auth:{ user, pass }, logger:false });
  await client.connect();
  console.log('Connected. Opening', mailbox);

  const since = new Date(Date.now() - lookbackDays*86400000);
  const sales = [];
  const lock = await client.getMailboxLock(mailbox);
  try{
    let scanned = 0;
    for await (const msg of client.fetch({ since }, { source:true, envelope:true })){
      scanned++;
      const parsed = await simpleParser(msg.source);
      const subject = parsed.subject || '';
      const fromText = (parsed.from && parsed.from.text) || '';
      const bodyText = parsed.text || stripHtml(parsed.html) || '';
      const full = subject + '\n' + bodyText;
      const looksEbay = /ebay/i.test(fromText) || isEbaySale(full);
      if(!looksEbay || !isEbaySale(full)) continue;
      if(DEBUG){
        console.log('\n===== RAW eBay message text (subject + body) =====');
        console.log(full.replace(/\n{3,}/g,'\n\n').slice(0,2600));
        console.log('===== END RAW =====\n');
      }
      const o = parseEmail(full);
      const draft = buildDraft(o);
      sales.push({
        id: (parsed.messageId || (msg.envelope && msg.envelope.messageId) || ('uid-'+msg.uid)).replace(/[<>]/g,''),
        date: (parsed.date || new Date()).toISOString(),
        buyer: o.buyer, ebayUser: o.ebayUser, country: o.country, flag: flag(o.country),
        item: o.items, order: o.po, value: o.value, stage: o.stage,
        draft
      });
    }
    console.log(`Scanned ${scanned} message(s) since ${since.toDateString()}; found ${sales.length} eBay sale(s).`);
  } finally {
    lock.release();
  }
  await client.logout();

  // stage counts, then keep only ready-to-ship (paid) unless overridden
  const readyOnly = env('READY_ONLY','true') === 'true';
  const nReady = sales.filter(s=>s.stage==='ready').length;
  const nAwait = sales.filter(s=>s.stage==='awaiting').length;
  console.log(`  → ${nReady} ready-to-ship, ${nAwait} awaiting payment${readyOnly?' (drafting ready-to-ship only)':''}`);

  // newest first, de-dupe by order ref (fall back to id)
  const seen = new Set();
  const unique = [];
  sales.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  for(const s of sales){
    if(readyOnly && s.stage!=='ready') continue;
    const k = s.order || s.id; if(seen.has(k)) continue; seen.add(k); unique.push(s);
  }

  if(DRY){
    const stageLabel = s => s==='ready' ? 'READY TO SHIP' : s==='awaiting' ? 'awaiting payment' : 'sale';
    for(const s of unique){
      console.log('\n──────────────────────────────');
      console.log(`[${stageLabel(s.stage)}]  ${s.flag} ${s.buyer||('eBay: '+(s.ebayUser||'?'))}  ·  ${s.country||'?'}  ·  ref ${s.order||'?'}`);
      console.log(`Item: ${s.item||'(?)'}`);
      console.log(`\nSUBJECT: ${s.draft.subject}`);
      console.log(s.draft.body);
    }
    console.log('\n(dry run — nothing written, no credentials shown)');
    return;
  }

  const passphrase = req('APP_PASSPHRASE');
  const outDir = path.join(ROOT, 'docs');
  fs.mkdirSync(outDir, { recursive:true });
  // only rewrite when the sales actually changed (avoids a commit + Pages rebuild every 15 min)
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(unique)).digest('hex');
  const statePath = path.join(outDir, 'state.json');
  let lastHash = '';
  try { lastHash = JSON.parse(fs.readFileSync(statePath,'utf8')).hash || ''; } catch {}
  if (lastHash === contentHash && fs.existsSync(path.join(outDir,'drafts.enc'))) {
    console.log('No change since last run — nothing to write.');
    return;
  }
  const payload = { updatedAt: new Date().toISOString(), count: unique.length, sales: unique };
  fs.writeFileSync(path.join(outDir,'drafts.enc'), encryptJson(payload, passphrase));
  fs.writeFileSync(statePath, JSON.stringify({ hash: contentHash, updatedAt: payload.updatedAt, count: unique.length }, null, 2));
  console.log(`Wrote docs/drafts.enc (${unique.length} sale(s)) + docs/state.json.`);
}

run().catch(e=>{
  console.error('ERROR:', e.message);
  if(e.authenticationFailed) console.error('→ authentication failed (username or password rejected by the server)');
  if(e.responseText) console.error('→ server said:', e.responseText);
  if(e.response) console.error('→ response:', e.response);
  if(e.code) console.error('→ code:', e.code);
  process.exit(1);
});
