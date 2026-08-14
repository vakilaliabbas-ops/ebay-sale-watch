// Dump the text of TERASAKI-related eBay emails so we can see which email carries
// the buyer name / address / order number after payment.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function stripHtml(h){ return (h||'').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<\/(p|div|tr|table|li|br|h[1-6])>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n'); }

const client = new ImapFlow({ host:process.env.IMAP_HOST, port:993, secure:true,
  auth:{ user:process.env.IMAP_USER, pass:process.env.IMAP_PASS }, logger:false });
await client.connect();
const lock = await client.getMailboxLock('INBOX');
const since = new Date(Date.now()-30*86400000);
try{
  for await (const m of client.fetch({ since }, { source:true })){
    const p = await simpleParser(m.source);
    const subj = p.subject || '';
    if(!/terasaki/i.test(subj)) continue;
    if(!/you made the sale|you got paid|your item has sold|time to ship|ready to ship/i.test(subj)) continue;
    const body = (p.text || stripHtml(p.html) || '').replace(/\n{3,}/g,'\n\n');
    console.log('\n########################################');
    console.log('SUBJECT:', subj);
    console.log('DATE   :', p.date);
    console.log('----------------------------------------');
    console.log(body.slice(0, 1600));
  }
} finally { lock.release(); }
await client.logout();
