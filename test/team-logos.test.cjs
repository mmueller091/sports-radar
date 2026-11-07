const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const logos = require('../team-logos.js');

function artwork(fill, outline) {
  const size = 24, pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) {
    const edge = x === 4 || x === 19 || y === 4 || y === 19;
    pixels.set([...(edge && outline ? outline : fill), 255], (y * size + x) * 4);
  }
  return {pixels, size};
}
function classify(fill, outline) {
  const {pixels, size} = artwork(fill, outline);
  return logos.classify(pixels, size, size);
}

test('black, dark navy, charcoal and dark red silhouettes receive a contour', () => {
  for (const rgb of [[0, 0, 0], [0, 25, 55], [25, 28, 31], [102, 0, 20]]) {
    assert.equal(classify(rgb), 'contour', rgb.join(','));
  }
});

test('white and cream artwork retain their original clean edges', () => {
  assert.equal(classify([255, 255, 255]), 'none');
  assert.equal(classify([240, 232, 212]), 'none');
});

test('the dark Capitals scoreboard artwork gets a backing before it loads', () => {
  const official = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/wsh.png';
  assert.match(logos.attributes(official), /data-logo-contrast="backing"/);
  assert.equal(logos.modeFor(official), 'backing');
  assert.equal(logos.modeFor('https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png'), 'pending');
  const image = {src:official, dataset:{logoContrast:'backing'}, naturalWidth:500, naturalHeight:500};
  logos.loaded(image);
  assert.equal(image.dataset.logoContrast, 'backing');
  const css = fs.readFileSync(require.resolve('../team-logos.css'), 'utf8');
  assert.match(css, /\.game-card \.team-name img\[data-team-logo\]\[data-logo-contrast="backing"\]/);
  assert.ok(css.indexOf('data-logo-contrast="backing"') > css.indexOf('.game-card .team-name img[data-team-logo][data-logo-contrast]'));
});

test('an authentic pale outline protects dark artwork without another outline', () => {
  assert.equal(classify([0, 0, 0], [255, 255, 255]), 'none');
  assert.equal(classify([102, 0, 20], [240, 232, 212]), 'none');
});

test('multicolor artwork is classified by its visible boundary rather than team identity', () => {
  assert.equal(classify([255, 230, 0], [0, 12, 24]), 'contour');
  assert.equal(classify([0, 12, 24], [255, 230, 0]), 'none');
  const {pixels, size} = artwork([255, 255, 255]);
  for (let x = 4; x < 20; x++) pixels.set([0, 0, 0, 255], (4 * size + x) * 4);
  assert.equal(logos.classify(pixels, size, size), 'soft');
});

test('transparent margins do not count as dark pixels or change the decision', () => {
  const {pixels, size} = artwork([255, 255, 255]);
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 0) pixels.set([12, 20, 40, 0], i);
  assert.equal(logos.classify(pixels, size, size), 'none');
});

test('thin, disconnected and unusual silhouettes preserve their separating treatment', () => {
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 3; y < 29; y++) pixels.set([5, 10, 20, 255], (y * 32 + y) * 4);
  for (let x = 2; x < 25; x++) pixels.set([5, 10, 20, 255], (16 * 32 + x) * 4);
  assert.equal(logos.classify(pixels, 32, 32), 'contour');
});

test('translucent artwork is assessed as composited on the actual dark surfaces', () => {
  const {pixels, size} = artwork([255, 255, 255]);
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) pixels[i] = 64;
  assert.equal(logos.classify(pixels, size, size), 'contour');
});

test('classification does not mutate original artwork', () => {
  const {pixels, size} = artwork([8, 16, 32]);
  const before = pixels.slice();
  logos.classify(pixels, size, size);
  assert.deepEqual(pixels, before);
});

test('CORS failure retries the identical URL once and does not suppress the logo', () => {
  const image = {src:'https://example.org/official.svg', dataset:{}, hidden:false, cors:true,
    hasAttribute() { return this.cors; }, removeAttribute() { this.cors = false; }};
  assert.equal(logos.failed(image), true);
  assert.equal(image.src, 'https://example.org/official.svg');
  assert.equal(image.hidden, false);
  assert.equal(image.dataset.logoContrast, 'unreadable');
  assert.equal(logos.failed(image), false);
  assert.doesNotMatch(logos.attributes(image.src), /crossorigin/);
});

test('canvas failures keep the image visible with restrained alpha separation', () => {
  const sandbox = {URL, document:{baseURI:'https://slatemeter.app/', createElement() { throw new Error('Canvas blocked'); }}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../team-logos.js'), 'utf8'), sandbox);
  const image = {src:'official.png', dataset:{}, naturalWidth:500, naturalHeight:500, hidden:false};
  sandbox.SlateMeterTeamLogos.loaded(image);
  assert.equal(image.dataset.logoContrast, 'unreadable');
  assert.equal(image.hidden, false);
  assert.equal(image.src, 'official.png');
});

test('a source is sampled once and PNG/SVG use the same path', () => {
  let drawings = 0;
  const context = {drawImage() { drawings++; }, getImageData() {
    const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    for (let y = 4; y < canvas.height - 4; y++) for (let x = 4; x < canvas.width - 4; x++) data.set([255, 255, 255, 255], (y * canvas.width + x) * 4);
    return {data};
  }};
  const canvas = {getContext() { return context; }};
  const sandbox = {URL, document:{baseURI:'https://slatemeter.app/', createElement() { return canvas; }}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../team-logos.js'), 'utf8'), sandbox);
  const image = src => ({src, dataset:{}, naturalWidth:500, naturalHeight:500});
  sandbox.SlateMeterTeamLogos.loaded(image('official.png'));
  sandbox.SlateMeterTeamLogos.loaded(image('official.png'));
  assert.equal(drawings, 2);
  sandbox.SlateMeterTeamLogos.loaded(image('official.svg'));
  assert.equal(drawings, 4);
  assert.equal(sandbox.SlateMeterTeamLogos.modeFor('official.png'), sandbox.SlateMeterTeamLogos.modeFor('official.svg'));
  assert.equal(sandbox.SlateMeterTeamLogos.modeFor('official.svg'), 'none');
  assert.match(sandbox.SlateMeterTeamLogos.attributes('official.svg'), /data-logo-contrast="none"/);
  assert.match(sandbox.SlateMeterTeamLogos.attributes('new-official.svg'), /data-logo-contrast="pending"/);
});

test('CORS retry is bounded per source when an image element is reused', () => {
  const image = {src:'https://example.org/first.png', dataset:{}, cors:true,
    hasAttribute() { return this.cors; }, removeAttribute() { this.cors = false; }};
  assert.equal(logos.failed(image), true);
  image.cors = true;
  assert.equal(logos.failed(image), false);
  image.src = 'https://example.org/second.svg';
  assert.equal(logos.failed(image), true);
  assert.equal(image.src, 'https://example.org/second.svg');
});

test('an old loaded resource cannot classify a new requested source', () => {
  const image = {src:'https://example.org/new.svg', currentSrc:'https://example.org/old.svg',
    naturalWidth:500, naturalHeight:500, dataset:{logoContrast:'pending'}};
  logos.loaded(image);
  assert.equal(image.dataset.logoContrast, 'pending');
  assert.equal(logos.modeFor(image.src), 'pending');
});

test('sampling preserves unusual aspect ratios at both review sizes', () => {
  const sizes = [];
  const context = {drawImage(image, x, y, width, height) { sizes.push([width, height]); },
    getImageData() { return {data:new Uint8ClampedArray(canvas.width * canvas.height * 4)}; }};
  const canvas = {getContext() { return context; }};
  const sandbox = {URL, document:{baseURI:'https://slatemeter.app/', createElement() { return canvas; }}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../team-logos.js'), 'utf8'), sandbox);
  sandbox.SlateMeterTeamLogos.loaded({src:'wide.svg', dataset:{}, naturalWidth:400, naturalHeight:200});
  assert.deepEqual(sizes, [[20, 10], [48, 24]]);
});

test('a browser without a readable canvas retains conservative separation', () => {
  const sandbox = {URL, document:{baseURI:'https://slatemeter.app/', createElement() { return {getContext() { return null; }}; }}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../team-logos.js'), 'utf8'), sandbox);
  const image = {src:'official.svg', dataset:{}, naturalWidth:100, naturalHeight:100, hidden:false};
  sandbox.SlateMeterTeamLogos.loaded(image);
  assert.equal(image.dataset.logoContrast, 'unreadable');
  assert.equal(image.hidden, false);
  assert.equal(image.src, 'official.svg');
});

test('visual review manifest covers all six leagues with authentic catalog assets', () => {
  const catalog = JSON.parse(fs.readFileSync(require.resolve('../teams.json'), 'utf8'));
  const review = JSON.parse(fs.readFileSync(require.resolve('./fixtures/ui-overhaul-cases.json'), 'utf8')).logoCases;
  assert.deepEqual([...new Set(review.map(item => item.sport))].sort(), ['CFB', 'MLB', 'NBA', 'NCAAB', 'NFL', 'NHL']);
  for (const item of review) {
    const original = catalog[item.sport].find(team => team.id === item.team[8]);
    assert.ok(original, item.team[0]);
    assert.equal(item.team[0], original.name);
    assert.equal(item.qaOnlyAlternate ? item.canonicalSource : item.team[4], original.logo);
    assert.match(item.team[4], /^https:\/\//);
  }
  const descriptions = review.map(item => item.kind).join('\n');
  for (const category of [/black/i, /navy/i, /dark red/i, /white/i, /multicolor/i, /thin|fine details/i, /unusual/i]) {
    assert.match(descriptions, category);
  }
});
