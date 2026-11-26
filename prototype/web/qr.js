/* Novora QR encoder - byte mode, ECC level M, versions 1..10 (max 213 bytes).
   Classic script (no modules, no deps). Public API:
     NovoraQR.matrix(text) -> { size, modules: boolean[][], version, mask, ecc }
     NovoraQR.encode(text) -> { version, size, modules, blocks, codewords, mask }
     NovoraQR.toCanvas(canvas, text, opts) -> { size, version }
   Throws on text longer than version 10 capacity (~213 bytes UTF-8). */
var NovoraQR = (function () {
  'use strict';

  var ECC_M = {
    1: { ecc: 10, groups: [[1, 16]] },
    2: { ecc: 16, groups: [[1, 28]] },
    3: { ecc: 26, groups: [[1, 44]] },
    4: { ecc: 18, groups: [[2, 32]] },
    5: { ecc: 24, groups: [[2, 43]] },
    6: { ecc: 16, groups: [[4, 27]] },
    7: { ecc: 18, groups: [[4, 31]] },
    8: { ecc: 22, groups: [[2, 38], [2, 39]] },
    9: { ecc: 22, groups: [[3, 36], [2, 37]] },
    10: { ecc: 26, groups: [[4, 43], [1, 44]] }
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  var REMAINDER = [0, 0, 7, 7, 7, 7, 7, 7, 0, 0, 0];
  var MAX_VERSION = 10;

  /* --- GF(256), primitive polynomial 0x11D --- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
    LOG[0] = 0;
  })();

  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGen(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var a = EXP[i], ng = new Array(g.length + 1);
      for (var k = 0; k < ng.length; k++) ng[k] = 0;
      for (var j = 0; j < g.length; j++) { ng[j + 1] ^= g[j]; ng[j] ^= mul(g[j], a); }
      g = ng;
    }
    return g.reverse(); /* highest degree first, length n+1 */
  }

  function rsRemainder(data, gen, eccLen) {
    var rem = new Array(eccLen);
    for (var i = 0; i < eccLen; i++) rem[i] = 0;
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ rem[0];
      rem.shift(); rem.push(0);
      for (var k = 0; k < eccLen; k++) rem[k] ^= mul(gen[k + 1], factor);
    }
    return rem;
  }

  /* --- UTF-8 --- */
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function dataCodewords(v) {
    var t = ECC_M[v], n = 0;
    for (var i = 0; i < t.groups.length; i++) n += t.groups[i][0] * t.groups[i][1];
    return n;
  }

  function chooseVersion(byteLen) {
    for (var v = 1; v <= MAX_VERSION; v++) {
      var countBits = v < 10 ? 8 : 16;
      var need = 4 + countBits + 8 * byteLen;
      if (need <= dataCodewords(v) * 8) return v;
    }
    return 0;
  }

  /* --- BCH helpers --- */
  function formatBits(mask) {
    var data = mask; /* ECC level M = 00 */
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(v) {
    var rem = v;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (v << 12) | rem;
  }

  /* --- bit buffer --- */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.push = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };
  BitBuf.prototype.toBytes = function () {
    var out = [];
    for (var i = 0; i + 8 <= this.bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | this.bits[i + j];
      out.push(b);
    }
    return out;
  };

  function encode(text) {
    var bytes = utf8(String(text));
    var version = chooseVersion(bytes.length);
    if (!version) throw new Error('QR: Text zu lang fuer Version ' + MAX_VERSION + ' (' + bytes.length + ' Bytes)');
    var t = ECC_M[version];
    var eccLen = t.ecc;
    var capBits = dataCodewords(version) * 8;
    var bb = new BitBuf();
    bb.push(4, 4); /* byte mode */
    bb.push(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) bb.push(bytes[i], 8);
    var term = Math.min(4, capBits - bb.bits.length);
    if (term > 0) bb.push(0, term);
    while (bb.bits.length % 8 !== 0) bb.bits.push(0);
    var data = bb.toBytes();
    var pad = [0xEC, 0x11], p = 0;
    while (data.length < capBits / 8) data.push(pad[p++ & 1]);

    /* split into blocks */
    var blocks = [], off = 0;
    for (var g = 0; g < t.groups.length; g++) {
      var nb = t.groups[g][0], dl = t.groups[g][1];
      for (var b = 0; b < nb; b++) { blocks.push({ data: data.slice(off, off + dl) }); off += dl; }
    }
    var gen = rsGen(eccLen);
    for (var bi = 0; bi < blocks.length; bi++) blocks[bi].ecc = rsRemainder(blocks[bi].data, gen, eccLen);

    /* interleave */
    var codewords = [], maxLen = 0;
    for (var m = 0; m < blocks.length; m++) maxLen = Math.max(maxLen, blocks[m].data.length);
    for (var idx = 0; idx < maxLen; idx++) {
      for (var k = 0; k < blocks.length; k++) if (idx < blocks[k].data.length) codewords.push(blocks[k].data[idx]);
    }
    for (var e = 0; e < eccLen; e++) {
      for (var k2 = 0; k2 < blocks.length; k2++) codewords.push(blocks[k2].ecc[e]);
    }

    var size = 17 + 4 * version;
    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var mods = buildMatrix(version, size, codewords, mask);
      var score = penalty(mods, size);
      if (!best || score < best.score) best = { score: score, mods: mods, mask: mask };
    }
    return { version: version, size: size, modules: best.mods, blocks: blocks, codewords: codewords, mask: best.mask, ecc: 'M' };
  }

  function buildMatrix(version, size, codewords, mask) {
    var mods = [], fn = [];
    for (var y = 0; y < size; y++) {
      mods.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    function set(y, x, dark) { mods[y][x] = !!dark; fn[y][x] = true; }

    /* timing patterns */
    for (var i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    /* finder patterns + separators */
    function finder(cx, cy) {
      for (var dy = -1; dy <= 7; dy++) {
        for (var dx = -1; dx <= 7; dx++) {
          var x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          var d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          set(y, x, d !== 2 && d !== 4);
        }
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

    /* alignment patterns */
    var al = ALIGN[version], last = al.length - 1;
    for (var a = 0; a < al.length; a++) {
      for (var b2 = 0; b2 < al.length; b2++) {
        if ((a === 0 && b2 === 0) || (a === 0 && b2 === last) || (a === last && b2 === 0)) continue;
        var cx2 = al[b2], cy2 = al[a];
        for (var dy2 = -2; dy2 <= 2; dy2++) {
          for (var dx2 = -2; dx2 <= 2; dx2++) {
            set(cy2 + dy2, cx2 + dx2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
          }
        }
      }
    }

    /* reserve format areas (values written later) */
    for (var f = 0; f < 9; f++) {
      if (f !== 6) { set(f, 8, false); set(8, f, false); }
    }
    for (var f2 = 0; f2 < 8; f2++) {
      set(size - 1 - f2, 8, false);
      set(8, size - 1 - f2, false);
    }
    set(size - 8, 8, true); /* dark module */

    /* version info */
    if (version >= 7) {
      var vb = versionBits(version);
      for (var vi = 0; vi < 18; vi++) {
        var bit = ((vb >>> vi) & 1) === 1;
        var xa = size - 11 + (vi % 3), ya = Math.floor(vi / 3);
        set(ya, xa, bit); set(xa, ya, bit);
      }
    }

    /* data placement (zigzag) */
    var bitIdx = 0, total = codewords.length * 8, up = true;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        var yy = up ? size - 1 - vert : vert;
        for (var j = 0; j < 2; j++) {
          var xx = right - j;
          if (fn[yy][xx]) continue;
          if (bitIdx < total) mods[yy][xx] = ((codewords[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
      }
      up = !up;
    }

    /* mask (data modules only) */
    for (var my = 0; my < size; my++) {
      for (var mx = 0; mx < size; mx++) {
        if (!fn[my][mx] && maskFn(mask, mx, my)) mods[my][mx] = !mods[my][mx];
      }
    }

    /* format info */
    var fb = formatBits(mask);
    function fbit(i) { return ((fb >>> i) & 1) === 1; }
    for (var k = 0; k <= 5; k++) mods[k][8] = fbit(k);
    mods[7][8] = fbit(6);
    mods[8][8] = fbit(7);
    mods[8][7] = fbit(8);
    for (var q = 9; q < 15; q++) mods[8][14 - q] = fbit(q);
    for (var r = 0; r < 8; r++) mods[8][size - 1 - r] = fbit(r);
    for (var s = 8; s < 15; s++) mods[size - 15 + s][8] = fbit(s);

    return mods;
  }

  function maskFn(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  /* --- penalty rules N1..N4 --- */
  function penalty(mods, size) {
    var score = 0, x, y;
    /* N1: runs of 5+ same colour */
    for (y = 0; y < size; y++) {
      var run = 1;
      for (x = 1; x < size; x++) {
        if (mods[y][x] === mods[y][x - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
    for (x = 0; x < size; x++) {
      var run2 = 1;
      for (y = 1; y < size; y++) {
        if (mods[y][x] === mods[y - 1][x]) { run2++; if (run2 === 5) score += 3; else if (run2 > 5) score++; }
        else run2 = 1;
      }
    }
    /* N2: 2x2 blocks */
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = mods[y][x];
        if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) score += 3;
      }
    }
    /* N3: finder-like 1:1:3:1:1 patterns */
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function scanLine(get, len) {
      var add = 0;
      for (var i = 0; i + 11 <= len; i++) {
        var m1 = true, m2 = true;
        for (var j = 0; j < 11; j++) {
          var v = get(i + j) ? 1 : 0;
          if (v !== pat1[j]) m1 = false;
          if (v !== pat2[j]) m2 = false;
          if (!m1 && !m2) break;
        }
        if (m1) add += 40;
        if (m2) add += 40;
      }
      return add;
    }
    for (y = 0; y < size; y++) (function (yy) { score += scanLine(function (i) { return mods[yy][i]; }, size); })(y);
    for (x = 0; x < size; x++) (function (xx) { score += scanLine(function (i) { return mods[i][xx]; }, size); })(x);
    /* N4: dark proportion */
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mods[y][x]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  /* --- canvas rendering --- */
  function toCanvas(canvas, text, opts) {
    opts = opts || {};
    var qr = encode(text);
    var margin = opts.margin == null ? 4 : opts.margin;
    var target = opts.px || 180;
    var total = qr.size + margin * 2;
    var scale = Math.max(1, Math.floor(target / total));
    var dim = total * scale;
    canvas.width = dim; canvas.height = dim;
    var ctx = canvas.getContext('2d');
    var light = opts.light || '#ffffff';
    // Modules must stay dark on the white quiet zone: the design's --text is
    // near-white and would produce an unreadable (low contrast) code.
    var dark = opts.dark || '#0a0d12';
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = dark;
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      }
    }
    return { size: dim, version: qr.version };
  }

  return {
    matrix: function (text) { var q = encode(text); return { size: q.size, modules: q.modules, version: q.version, mask: q.mask, ecc: q.ecc }; },
    encode: encode,
    toCanvas: toCanvas
  };
})();
