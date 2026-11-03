import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const context = vm.createContext({safeText: value => String(value ?? ''), teamLogoUrl: () => ''});
vm.runInContext(source.slice(source.indexOf('function teamLogoWithFallback('), source.indexOf('function summaryUrlFor(')), context);
vm.runInContext(source.slice(source.indexOf('function teamMarkup('), source.indexOf('function explainRating(')), context);

test('team records use the canonical tuple, preserving sport formats, rankings and navigation', () => {
  for (const [sport, record] of [['NHL','8-5-1'], ['NFL','6-2-1'], ['CFB','8-0'], ['NBA','5-2'], ['MLB','92-70'], ['NCAAB','1-0']]) {
    const team = ['Washington Capitals','WSH','3','','official.png',record,7,'Capitals','23'];
    const original = structuredClone(team);
    const html = context.teamMarkup({sport}, team, 1);
    assert.match(html, new RegExp(`<small class="team-record">${record}</small>`));
    assert.equal((html.match(/class="team-record"/g) || []).length, 1);
    assert.match(html, /class="team-rank">#7/);
    assert.match(html, /data-card-team-index="1"/);
    assert.match(html, /src="official.png"/);
    assert.match(html, /class="team-name-copy"/);
    assert.deepEqual(team, original);
  }
});

test('absent records are omitted, with no invented or duplicate placeholders', () => {
  for (const record of ['', null, undefined]) {
    const html = context.teamMarkup({sport:'NHL'}, ['Washington Capitals','WSH','3','','official.png',record,null,'Capitals','23']);
    assert.doesNotMatch(html, /team-record|0-0|undefined|null/);
    assert.match(html, /team-logo-shell/);
  }
});

test('card moment classification separates Last score from meaningful context without mutating the game', () => {
  const start = source.indexOf('  const momentMarkup =', source.indexOf('function gameCard('));
  const end = source.indexOf('\n  const accessibility =', start);
  for (const label of ['Last score', 'Decisive play', 'Latest score', undefined]) {
    const game = {moment:'A verified scoring play', momentLabel:label};
    const original = structuredClone(game);
    const html = vm.runInNewContext(source.slice(start, end) + '; momentMarkup', {game, safeText:String, displayMoment:g => g.moment});
    assert.ok(html.includes(`data-moment-kind="${label === 'Last score' ? 'last-score' : 'context'}"`));
    assert.ok(html.includes(game.moment));
    assert.deepEqual(game, original);
  }
});
