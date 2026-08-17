// Email parsing + import-duty draft builder.
// Ported from the tested Export Dispatch parser; focused on eBay sale notifications.

export const SETTINGS = {
  ownDomain: process.env.OWN_DOMAIN || 'inmateto.com',
  name: 'AL REZA ENTERPRISE',
  signer: 'Aliabbas Vakil',
  addr: 'Mill Ni Chali Road, Near Railway Crossing, Kumbharwada, Bhavnagar, Gujarat, India - 364001',
  email: process.env.EXPORTER_EMAIL || 'sales@alrezaenterprise.com',
  phone: '+91-814-038-5618',
  iec: 'AUDPV2368M',
  gst: '24AUDPV2368M1Z4',
  ad: '0240034-5720008',
  pol: 'India (Bhavnagar / Ahmedabad)',
  scheme: 'Export under LUT (CSB V) — zero rated',
  dutySubject: 'Important: possible import duty & customs charges — Order {po}',
  dutyBody:
`Dear {buyer},

Thank you for your order ({po}) for {items}, being shipped to {country}.

First, could you please reply with your email address? We will use it to send you the shipment tracking, invoice and any customs documents directly.

Also, an important note regarding customs: any import duty, customs clearance charges, VAT / GST or other taxes levied by the customs authorities in {country} are NOT included in our invoice and are payable by the buyer / consignee at the destination. We recommend checking the applicable import duty with your local customs broker in advance, so that customs clearance and delivery are not delayed.

We will share the tracking details as soon as the booking is confirmed.

Warm regards,
INMATETO`
};

const COUNTRIES = {"united kingdom":"GB","uk":"GB","england":"GB","great britain":"GB","united states":"US","usa":"US","us":"US","united arab emirates":"AE","uae":"AE","dubai":"AE","germany":"DE","france":"FR","italy":"IT","spain":"ES","netherlands":"NL","belgium":"BE","canada":"CA","australia":"AU","new zealand":"NZ","saudi arabia":"SA","ksa":"SA","qatar":"QA","kuwait":"KW","oman":"OM","bahrain":"BH","singapore":"SG","malaysia":"MY","indonesia":"ID","thailand":"TH","vietnam":"VN","philippines":"PH","japan":"JP","south korea":"KR","korea":"KR","china":"CN","hong kong":"HK","taiwan":"TW","bangladesh":"BD","sri lanka":"LK","pakistan":"PK","south africa":"ZA","nigeria":"NG","kenya":"KE","egypt":"EG","turkey":"TR","brazil":"BR","mexico":"MX","argentina":"AR","peru":"PE","colombia":"CO","ecuador":"EC","bolivia":"BO","chile ":"CL","uruguay":"UY","paraguay":"PY","venezuela":"VE","panama":"PA","costa rica":"CR","guatemala":"GT","dominican republic":"DO","russia":"RU","poland":"PL","sweden":"SE","norway":"NO","denmark":"DK","finland":"FI","ireland":"IE","portugal":"PT","switzerland":"CH","austria":"AT","greece":"GR","israel":"IL","india":"IN"};

export function iso(country){ if(!country) return ""; return COUNTRIES[country.trim().toLowerCase()] || ""; }
export function flag(country){ const c=iso(country); if(!c) return "📦"; return String.fromCodePoint(...[...c].map(ch=>127397+ch.charCodeAt(0))); }

export function isEbaySale(text){
  return /you made the sale|your item has sold|you got paid|your item has been paid for/i.test(text||"");
}

export function parseEmail(text){
  const out={buyer:"",email:"",company:"",country:"",port:"",po:"",hs:"",incoterm:"",carrier:"",items:"",pkgs:"",weight:"",ebay:false,ebayUser:"",value:"",stage:""};
  if(!text) return out;
  const myDomain=(SETTINGS.ownDomain||"alrezaenterprise.com").toLowerCase();

  const emails=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  out.email=(emails.find(e=>!e.toLowerCase().includes(myDomain))||emails[0]||"");

  let m=text.match(/(?:regards|thanks|thank you|best|sincerely|cheers)[,!\s]*[\r\n]+[ \t]*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,2})/i);
  if(!m) m=text.match(/^\s*From\s*:\s*"?([A-Za-z][A-Za-z.'\- ]{1,40}?)"?\s*[<\r\n]/im);
  if(!m) m=text.match(/(?:Dear|Hi|Hello)[ \t]+([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)?)/);
  if(m) out.buyer=m[1].trim();

  for(const key of Object.keys(COUNTRIES).sort((a,b)=>b.length-a.length)){
    const re=new RegExp("\\b"+key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i");
    if(re.test(text)){ out.country=key.replace(/\b\w/g,c=>c.toUpperCase());
      if(key==="uk")out.country="United Kingdom"; if(key==="usa"||key==="us")out.country="United States"; if(key==="uae")out.country="United Arab Emirates"; break; }
  }

  m=text.match(/\bHS\s?(?:N|code)?\s*[:#]?\s*(\d[\d.\s]{4,12}\d)/i);
  if(m) out.hs=m[1].replace(/\s+/g,"").trim();

  // ---- eBay "you made the sale" order-confirmation format ----
  if(isEbaySale(text) || /ebay@ebay\.com|View order details/i.test(text)){
    out.ebay=true;
    out.email="";
    if(/ebay/i.test(out.buyer)) out.buyer="";
    // item title — works for "You made the sale for X" and "You got paid for X"
    let em=text.match(/(?:You made the sale for|You got paid for|Your item .*?sold[:\s-]*?|sale for)\s+([^\n]+)/i);
    let title=em?em[1].replace(/\s*-\s*Inbox\b.*$/i,"").replace(/\s*[•|].*$/,"").trim():"";
    let qm=text.match(/Quantity\s*sold\s*:?\s*(\d+)/i);
    if(title) out.items=(qm?qm[1]+" pcs ":"")+title;
    // order number: orderid=NN-NNNNN-NNNNN (paid email) or "Order: NN-..." or transid fallback (unpaid)
    let om=text.match(/orderid=(\d{2}-\d{4,7}-\d{4,7})/i) || text.match(/Order\s*(?:no\.?|number|id)?\s*:?\s*(\d{2}-\d{4,7}-\d{4,7})/i);
    if(om) out.po=om[1];
    if(!out.po){ const tm=text.match(/transid=(\d{6,})/i); if(tm) out.po=tm[1]; }
    let bm=text.match(/(?:^|\n)\s*Buyer\s*:?\s*\n?\s*([a-z0-9][a-z0-9_.\-]{2,})/i); if(bm) out.ebayUser=bm[1];
    // stage: awaiting payment vs paid / ready to ship (check "hasn't paid" first — that email also says "time to ship")
    if(/hasn.?t paid|reminder will be sent|buyer to pay/i.test(text)) out.stage='awaiting';
    else if(/has been paid for|you got paid|has paid|get a shipping label|\bship by\b/i.test(text)) out.stage='ready';
    else out.stage='sale';
    let sm=text.match(/(?:Sold|paid)\s*:?\s*((?:US\s*)?\$[\d,]+\.\d{2})/i); if(sm) out.value=sm[1].replace(/\s+/g," ").trim();
    // Buyer + city + country from the "...shipping details:" block. The address is the run of
    // lines right after the label, ending at a blank gap or "SHIP BY" / "Your buyer" etc.
    // The LAST line of that block is the destination country (works for ANY country).
    let region=text.match(/shipping details\s*:?\s*([\s\S]{0,360})/i);
    if(region){
      const block = region[1].split(/\n\s*\n|SHIP BY|Your buyer|View order|time to get a shipping label|Unless your funds/i)[0];
      const lines = block.split(/\n/).map(s=>s.trim()).filter(Boolean);
      if(lines.length>=2){
        if(!/^\d/.test(lines[0])) out.buyer = lines[0];                       // first line = buyer name / company
        out.country = lines[lines.length-1].replace(/[.,;]\s*$/,"").trim();   // last line = destination country
        if(lines.length>=3) out.port = lines[lines.length-2].split(",")[0].replace(/\s+\d{2,}.*$/,"").trim();  // city
      }
    }
  }
  return out;
}

export function fillTemplate(tpl, o){
  const map={
    buyer:o.buyer||"Sir/Madam", country:o.country||"the destination country",
    po:o.po||"(no ref)", hs:o.hs||"(please confirm)", items:o.items||"your ordered goods",
    name:SETTINGS.name, signer:SETTINGS.signer, addr:SETTINGS.addr, email:SETTINGS.email,
    phone:SETTINGS.phone, iec:SETTINGS.iec, gst:SETTINGS.gst, ad:SETTINGS.ad, pol:SETTINGS.pol, scheme:SETTINGS.scheme
  };
  return tpl.replace(/\{(\w+)\}/g,(mm,k)=> map[k]!==undefined? map[k] : mm);
}

export function buildDraft(o){
  return {
    to: o.email || "",                 // eBay hides buyer email → empty; contact via eBay Messages
    subject: fillTemplate(SETTINGS.dutySubject, o),
    body: fillTemplate(SETTINGS.dutyBody, o)
  };
}
