/**
 * WebCrypto helpers for the opt-in persistent vault:
 * PBKDF2-SHA256 key derivation + AES-GCM-256 payload encryption.
 * The passphrase is never stored; a wrong passphrase fails GCM auth on decrypt.
 */

export interface EncryptedPayload {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

// OWASP-recommended minimum for PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(value: unknown, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { v: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase, fromBase64(payload.salt));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.data)
    );
  } catch {
    throw new Error('Vault decryption failed: wrong passphrase or corrupted data');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
