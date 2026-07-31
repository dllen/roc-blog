(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.StaticShieldCrypto = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var DEFAULT_ITERATIONS = 1000000, SALT_LEN = 16, IV_LEN = 16, PBKDF2_BITS = 512;
  var subtle = root.crypto.subtle;

  function b64encode(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function')
      return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
    var CHUNK = 0x8000, s = '';
    for (var i = 0; i < arr.length; i += CHUNK)
      s += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i + CHUNK, arr.length)));
    return btoa(s);
  }
  function b64decode(str) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      var buf = Buffer.from(str, 'base64'), out = new Uint8Array(buf.length);
      out.set(buf); return out;
    }
    var s = atob(str), arr = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  }
  function randomBytes(n) { return root.crypto.getRandomValues(new Uint8Array(n)); }

  async function deriveBitsFromPassword(password, salt, iterations, useSha512) {
    var keyMaterial = await subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    var bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: useSha512 ? 'SHA-512' : 'SHA-256' },
      keyMaterial, PBKDF2_BITS);
    return new Uint8Array(bits);
  }
  async function importKeys(bits) {
    var encKey = await subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    var macKey = await subtle.importKey('raw', bits.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return { encKey: encKey, macKey: macKey };
  }
  function buildAad(meta) {
    var head = new TextEncoder().encode(meta.cipher + '|' + meta.kdf + '|'), iter = meta.iter >>> 0, b = new Uint8Array(4);
    b[0] = (iter >>> 24) & 0xff; b[1] = (iter >>> 16) & 0xff; b[2] = (iter >>> 8) & 0xff; b[3] = iter & 0xff;
    var out = new Uint8Array(head.length + 4); out.set(head, 0); out.set(b, head.length); return out;
  }
  function buildMacInput(aad, iv, salt, ct) {
    var out = new Uint8Array(aad.length + iv.length + salt.length + ct.length);
    out.set(aad, 0); out.set(iv, aad.length); out.set(salt, aad.length + iv.length); out.set(ct, aad.length + iv.length + salt.length);
    return out;
  }
  async function encryptWithKeys(encKey, macKey, iv, salt, plaintextUint8, aad) {
    var ctBuf = await subtle.encrypt({ name: 'AES-CBC', iv: iv }, encKey, plaintextUint8), ct = new Uint8Array(ctBuf);
    var macBuf = await subtle.sign('HMAC', macKey, buildMacInput(aad, iv, salt, ct));
    return { ct: ct, mac: new Uint8Array(macBuf) };
  }
  async function decryptWithKeys(meta, encKey, macKey) {
    var iv = b64decode(meta.iv), salt = b64decode(meta.salt), ct = b64decode(meta.ct), mac = b64decode(meta.mac), aad = buildAad(meta);
    var ok = await subtle.verify('HMAC', macKey, mac, buildMacInput(aad, iv, salt, ct));
    if (!ok) throw new Error('MAC_VERIFY_FAILED');
    var ptBuf = await subtle.decrypt({ name: 'AES-CBC', iv: iv }, encKey, ct);
    return new TextDecoder().decode(ptBuf);
  }
  async function encryptHtml(html, password, options) {
    options = options || {};
    var useSha512 = !!options.useSha512, iterations = options.iterations || DEFAULT_ITERATIONS;
    var meta = { cipher: 'AES-256-CBC', kdf: useSha512 ? 'PBKDF2-SHA512' : 'PBKDF2-SHA256', iter: iterations };
    var salt = randomBytes(SALT_LEN), iv = randomBytes(IV_LEN);
    var keys = await importKeys(await deriveBitsFromPassword(password, salt, iterations, useSha512));
    var enc = await encryptWithKeys(keys.encKey, keys.macKey, iv, salt, new TextEncoder().encode(html), buildAad(meta));
    meta.salt = b64encode(salt); meta.iv = b64encode(iv); meta.ct = b64encode(enc.ct); meta.mac = b64encode(enc.mac);
    return meta;
  }
  async function decryptData(meta, password) {
    var useSha512 = meta.kdf === 'PBKDF2-SHA512', salt = b64decode(meta.salt);
    var keys = await importKeys(await deriveBitsFromPassword(password, salt, meta.iter, useSha512));
    return decryptWithKeys(meta, keys.encKey, keys.macKey);
  }

  return {
    b64encode: b64encode, b64decode: b64decode, randomBytes: randomBytes,
    deriveBitsFromPassword: deriveBitsFromPassword, importKeys: importKeys,
    encryptWithKeys: encryptWithKeys, decryptWithKeys: decryptWithKeys,
    encryptHtml: encryptHtml, decryptData: decryptData,
    DEFAULT_ITERATIONS: DEFAULT_ITERATIONS, SALT_LEN: SALT_LEN, IV_LEN: IV_LEN
  };
});
