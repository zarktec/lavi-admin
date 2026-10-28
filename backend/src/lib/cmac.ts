import { createCipheriv } from "node:crypto";

// AES-CMAC (RFC 4493) con AES-128.

function aesEcb(key: Buffer, block: Buffer): Buffer {
  const c = createCipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

function dbl(b: Buffer): Buffer {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = ((b[i] << 1) | (i < 15 ? b[i + 1] >> 7 : 0)) & 0xff;
  if (b[0] & 0x80) out[15] ^= 0x87;
  return out;
}

function xor(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i];
  return out;
}

export function aesCmac(key: Buffer, msg: Buffer): Buffer {
  const k1 = dbl(aesEcb(key, Buffer.alloc(16)));
  const k2 = dbl(k1);
  const n = Math.max(1, Math.ceil(msg.length / 16));
  const complete = msg.length > 0 && msg.length % 16 === 0;
  let last: Buffer;
  if (complete) {
    last = xor(msg.subarray((n - 1) * 16, n * 16), k1);
  } else {
    const pad = Buffer.alloc(16);
    const rest = msg.subarray((n - 1) * 16);
    rest.copy(pad);
    pad[rest.length] = 0x80;
    last = xor(pad, k2);
  }
  let x: Buffer = Buffer.alloc(16);
  for (let i = 0; i < n - 1; i++) x = aesEcb(key, xor(x, msg.subarray(i * 16, (i + 1) * 16)));
  return aesEcb(key, xor(x, last));
}
