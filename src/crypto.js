// AES-256-GCM + PBKDF2(SHA-256). Node encrypts here; the phone page decrypts the
// same bytes with WebCrypto. Layout: base64( salt[16] | iv[12] | ciphertext+tag ).
import crypto from 'node:crypto';

const ITER = 150000;

export function encryptJson(obj, passphrase){
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, enc, tag]).toString('base64');
}

// Used only by the self-test to prove the phone will be able to decrypt.
export async function decryptJsonWebCrypto(b64, passphrase){
  const raw = Uint8Array.from(Buffer.from(b64, 'base64'));
  const salt = raw.slice(0,16), iv = raw.slice(16,28), data = raw.slice(28);
  const km = await crypto.webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.webcrypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:ITER, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const pt = await crypto.webcrypto.subtle.decrypt({name:'AES-GCM', iv}, key, data);
  return JSON.parse(new TextDecoder().decode(pt));
}
