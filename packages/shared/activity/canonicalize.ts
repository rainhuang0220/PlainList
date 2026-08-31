function normalizeString(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

export function canonicalize(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(normalizeString(value));
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export function canonicalHash(value: unknown): string {
  const text = unescape(encodeURIComponent(canonicalize(value)));
  const words: number[] = [];
  for (let index = 0; index < text.length; index += 1) words[index >> 2] = (words[index >> 2] ?? 0) | (text.charCodeAt(index) << (24 - (index % 4) * 8));
  const bitLength = text.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - bitLength % 32));
  words[((bitLength + 64 >> 9) << 4) + 15] = bitLength;
  const hash = [1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225];
  const constants = [1116352408,1899447441,-1245643825,-373957723,961987163,1508970993,-1841331548,-1424204075,-670586216,310598401,607225278,1426881987,1925078388,-2132889090,-1680079193,-1046744716,-459576895,-272742522,264347078,604807628,770255983,1249150122,1555081692,1996064986,-1740746414,-1473132947,-1341970488,-1084653625,-958395405,-710438585,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,-2117940946,-1838011259,-1564481375,-1474664885,-1035236496,-949202525,-778901479,-694614492, -200395387,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,-2067236844,-1933114872,-1866530822,-1538233109,-1090935817,-965641998];
  for (let offset = 0; offset < words.length; offset += 16) {
    const work = words.slice(offset, offset + 16); for (let i = 16; i < 64; i += 1) { const a = work[i - 15]; const b = work[i - 2]; work[i] = (((a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ a >>> 3) + work[i - 7] + ((b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ b >>> 10) + work[i - 16]) | 0; }
    let [a,b,c,d,e,f,g,h] = hash; for (let i = 0; i < 64; i += 1) { const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7); const choice = (e & f) ^ (~e & g); const temp1 = (h + s1 + choice + constants[i] + work[i]) | 0; const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10); const majority = (a & b) ^ (a & c) ^ (b & c); const temp2 = (s0 + majority) | 0; h=g; g=f; f=e; e=(d+temp1)|0; d=c; c=b; b=a; a=(temp1+temp2)|0; }
    hash[0]=(hash[0]+a)|0; hash[1]=(hash[1]+b)|0; hash[2]=(hash[2]+c)|0; hash[3]=(hash[3]+d)|0; hash[4]=(hash[4]+e)|0; hash[5]=(hash[5]+f)|0; hash[6]=(hash[6]+g)|0; hash[7]=(hash[7]+h)|0;
  }
  return hash.map((item) => (item >>> 0).toString(16).padStart(8, '0')).join('');
}
