// Diagnostic: list all folders and find recent eBay mail in each, so we know
// which mailbox the "you made the sale" emails actually land in.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const host = process.env.IMAP_HOST, user = process.env.IMAP_USER, pass = process.env.IMAP_PASS;
const days = parseInt(process.env.LOOKBACK_DAYS || '30', 10);
const since = new Date(Date.now() - days*86400000);

const client = new ImapFlow({ host, port:993, secure:true, auth:{ user, pass }, logger:false });
await client.connect();

console.log(`Folders in ${user} (scanning last ${days} days for eBay mail):\n`);
const boxes = await client.list();
for(const box of boxes){
  const path = box.path;
  let lock;
  try { lock = await client.getMailboxLock(path); }
  catch(e){ console.log(`  [skip] ${path} (${e.message})`); continue; }
  try{
    const mb = client.mailbox;
    let total = mb && mb.exists ? mb.exists : 0;
    let ebayHits = [];
    for await (const m of client.fetch({ since }, { envelope:true, source:true })){
      const p = await simpleParser(m.source);
      const from = (p.from && p.from.text) || '';
      const subj = p.subject || '';
      const isSale = /you made the sale|your item has sold/i.test(subj);
      const isEbay = /ebay/i.test(from) || /\bsold\b|\bsale\b|order confirmed|you.?ve sold/i.test(subj);
      if(isEbay) ebayHits.push({subj, from, date:p.date, isSale});
    }
    const saleCount = ebayHits.filter(h=>h.isSale).length;
    console.log(`📁 ${path}  —  ${total} msgs, ${ebayHits.length} eBay-ish, ${saleCount} "made the sale"`);
    ebayHits.slice(0,8).forEach(h=>{
      const tag = h.isSale ? '  ★SALE ' : '        ';
      console.log(`${tag}${(h.date? new Date(h.date).toISOString().slice(0,10):'          ')}  ${String(h.subj).slice(0,72)}`);
    });
  } finally { lock.release(); }
}
await client.logout();
