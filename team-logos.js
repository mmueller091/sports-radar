/* Artwork-aware logo separation. The official image remains the displayed asset.
 * Classification reads a tiny rasterization of its alpha boundary; it never
 * rewrites pixels, changes the image URL, or requests a replacement logo.
 */
(function (root) {
  'use strict';

  // Exact asset URLs only: an alternate/light logo must not inherit the treatment
  // of a different mark belonging to the same team. Add only after visual review.
  // This official scoreboard mark needs a stronger pixel-following halo
  // without a rectangular background or replacement artwork.
  const ARTWORK_OVERRIDES = Object.freeze({
    'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/wsh.png': 'halo'
  });
  const cache = new Map();
  const corsDenied = new Set();
  const modes = ['none', 'soft', 'contour'];
  // Match styles.css: brand charcoal, surface, hover, active, and raised surface.
  const backgrounds = [[25, 28, 31], [34, 38, 41], [41, 45, 48], [48, 52, 55], [58, 62, 65]];
  const channel = value => (value /= 255) <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  const luminance = (r, g, b) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
  const surfaceLuminances = backgrounds.map(rgb => luminance(...rgb));

  function classify(pixels, width, height) {
    if (!pixels || width < 1 || height < 1 || pixels.length < width * height * 4) return 'soft';
    let boundary = 0, weak = 0, lost = 0, visible = 0;
    const alpha = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : pixels[(y * width + x) * 4 + 3] / 255;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const opacity = pixels[i + 3] / 255;
      if (opacity < .2) continue;
      visible += opacity;
      // Include holes and fine strokes, not just the outer bounding rectangle.
      // An existing pale outline is allowed to do its job without another halo.
      if (Math.min(alpha(x - 1, y), alpha(x + 1, y), alpha(x, y - 1), alpha(x, y + 1)) >= opacity * .72) continue;
      const contrast = Math.min(...surfaceLuminances.map((surface, index) => {
        const rgb = backgrounds[index];
        const light = luminance(...rgb.map((value, component) => pixels[i + component] * opacity + value * (1 - opacity)));
        return (Math.max(light, surface) + .05) / (Math.min(light, surface) + .05);
      }));
      boundary += opacity;
      if (contrast < 3) weak += opacity;
      if (contrast < 1.7) lost += opacity;
    }
    if (!visible || !boundary) return 'soft';
    if (weak / boundary < .18 && lost / boundary < .08) return 'none';
    return weak / boundary >= .58 || lost / boundary >= .35 ? 'contour' : 'soft';
  }

  function keyFor(source) {
    try { return new URL(source, root.document?.baseURI || 'https://slatemeter.app/').href; }
    catch { return String(source || ''); }
  }

  function modeFor(source) {
    const key = keyFor(source);
    return ARTWORK_OVERRIDES[key] || cache.get(key) || 'pending';
  }

  function attributes(source) {
    // Put this before src so the request is CORS-readable from its first load.
    const cors = corsDenied.has(keyFor(source)) ? '' : ' crossorigin="anonymous"';
    return `data-team-logo data-logo-contrast="${modeFor(source)}"${cors} decoding="async"`;
  }

  function sample(image) {
    const canvas = root.document.createElement('canvas');
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return 'unreadable';
    let mode = 'none';
    // Protect tiny phone/search logos as well as larger Game Center artwork.
    // Preserve aspect ratio while sampling: no invented stretched silhouette.
    for (const size of [20, 48]) {
      const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = classify(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (modes.indexOf(result) > modes.indexOf(mode)) mode = result;
    }
    return mode;
  }

  function loaded(image) {
    if (!image?.dataset || !image.naturalWidth || !image.naturalHeight) return;
    const key = keyFor(image.currentSrc || image.src);
    // The helper has no srcset. Do not classify a previous resource while a
    // reused image element is waiting for a different official asset.
    if (image.currentSrc && key !== keyFor(image.src)) return;
    let mode = ARTWORK_OVERRIDES[key] || cache.get(key);
    if (!mode) {
      try { mode = sample(image); }
      catch { mode = 'unreadable'; } // Keep the original image, with conservative separation.
      cache.set(key, mode);
      if (cache.size > 2048) cache.delete(cache.keys().next().value);
    }
    image.dataset.logoContrast = mode;
  }

  function failed(image) {
    // A server that denies canvas access must never turn a valid logo into a
    // missing-image fallback. Retry the same official URL as an ordinary image.
    if (!image?.dataset || !image.hasAttribute?.('crossorigin')) return false;
    const key = keyFor(image.src);
    if (image.dataset.logoCorsRetried === key) return false;
    corsDenied.add(key);
    if (corsDenied.size > 2048) corsDenied.delete(corsDenied.values().next().value);
    image.dataset.logoCorsRetried = key;
    image.dataset.logoContrast = 'unreadable';
    image.removeAttribute('crossorigin');
    image.src = image.src;
    return true;
  }

  const api = Object.freeze({attributes, loaded, failed, classify, modeFor});
  root.SlateMeterTeamLogos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
