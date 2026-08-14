// Offline self-test: parser on the real eBay email + crypto round-trip (Node encrypt → WebCrypto decrypt).
import { parseEmail, buildDraft, isEbaySale } from './parse.js';
import { encryptJson, decryptJsonWebCrypto } from './crypto.js';

const sample = `You made the sale for ALLEN BRADLEY 40185-802-01 OVERLOAD RELAY - Inbox • alrezaenterprise@outlook.com
eBay <ebay@ebay.com>
To: alrezaenterprise@outlook.com

Great news—your item has sold!
View order details

Your buyer's shipping details:
Mark Walker
25102 Holt 250
Forest City, MO 64451
United States

Ship by:
15 Aug, 2026

Your buyer has paid and now it's time to get a shipping label.

ALLEN BRADLEY 40185-802-01 OVERLOAD RELAY
Sold: US $271.70
Order: 12-15023-98027
Date sold: 14 Aug, 2026
Buyer: mawal-6337
Quantity sold: 1`;

let fail = 0;
function ok(name, cond){ console.log((cond?'  ✓ ':'  ✗ ')+name); if(!cond) fail++; }

console.log('Parser:');
const o = parseEmail(sample);
ok('detects eBay sale', isEbaySale(sample) && o.ebay);
ok('buyer = Mark Walker', o.buyer==='Mark Walker');
ok('no buyer email (eBay hides it)', o.email==='');
ok('eBay user = mawal-6337', o.ebayUser==='mawal-6337');
ok('country = United States', o.country==='United States');
ok('order = 12-15023-98027', o.po==='12-15023-98027');
ok('item keeps full part no.', /40185-802-01 OVERLOAD RELAY$/.test(o.items));

const draft = buildDraft(o);
console.log('\nDrafted duty message:\n');
console.log('SUBJECT:', draft.subject);
console.log(draft.body);

console.log('\nCrypto round-trip (proves the phone can decrypt):');
const pass = 'test-passphrase-123';
const blob = encryptJson({ sales:[{ buyer:o.buyer, draft }] }, pass);
const back = await decryptJsonWebCrypto(blob, pass);
ok('encrypt → decrypt matches', back.sales[0].draft.subject === draft.subject);
let wrongWorked = false;
try { await decryptJsonWebCrypto(blob, 'wrong-pass'); wrongWorked = true; } catch(e){}
ok('wrong passphrase is rejected', !wrongWorked);

console.log(fail? `\n${fail} check(s) FAILED` : '\nAll checks passed.');
process.exit(fail?1:0);
