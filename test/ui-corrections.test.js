import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const context = vm.createContext({safeText: value => String(value ?? ''), teamLogoUrl: () => ''});
vm.runInContext(source.slice(source.indexOf('function teamLogoWithFallback('), source.indexOf('function summaryUrlFor(')), context);
vm.runInContext(source.slice(source.indexOf('function teamMarkup('), source.indexOf('function explainRating(')), context);
const liveNoteStart=source.indexOf('  const rawLiveNote=',source.indexOf('function gameCard('));
const liveNoteEnd=source.indexOf('\n  const phase =',liveNoteStart);
const cardLiveNote=game=>vm.runInNewContext(source.slice(liveNoteStart,liveNoteEnd)+'; liveNote',{game});

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

test('verified NHL power-play badge stays beside the team name on game cards', () => {
  const team=['Florida Panthers','FLA','1','','official.png','9-5-2',null,'Panthers','26'];
  const game={sport:'NHL',state:'live',live:{phase:'1st',note:'Florida Panthers power play'},manpowerQuality:{state:'consistent'}};
  const html=context.teamMarkup(game,team,0);
  assert.match(html, /class="team-name-text"[\s\S]*?class="team-power-play"[\s\S]*?<\/span><small class="team-record">9-5-2<\/small>/);
  assert.equal((html.match(/class="team-power-play"/g)||[]).length,1);
});

test('NHL power play uses the badge instead of a situation sentence, including coincident penalties', () => {
  const team=['Washington Capitals','WSH','3','','official.png','8-6-0',null,'Capitals','23'];
  const verified={sport:'NHL',state:'live',live:{phase:'2nd',note:'Washington Capitals power play'},manpowerQuality:{state:'consistent'}};
  assert.match(context.teamMarkup(verified,team,1),/class="team-power-play"[^>]*>PP<\/span>/);
  assert.equal(cardLiveNote(verified),'');

  const offsetting={...verified,manpowerQuality:{state:'unknown',reasons:['overlapping-penalties']}};
  assert.doesNotMatch(context.teamMarkup(offsetting,team,1),/team-power-play/);
  assert.equal(cardLiveNote(offsetting),'');

  const earlyPull={...verified,liveRawStatus:{period:2},live:{phase:'2nd',note:'Washington Capitals pulled the goalie',sportImpact:{manpower:{pulled:false}}}};
  assert.equal(cardLiveNote(earlyPull),'');
  const confirmedLate={...earlyPull,liveRawStatus:{period:3},live:{...earlyPull.live,sportImpact:{manpower:{pulled:true}}}};
  assert.equal(cardLiveNote(confirmedLate),'Washington Capitals pulled the goalie');
  assert.equal(cardLiveNote({...confirmedLate,live:{...confirmedLate.live,note:'Pulled the goalie with a power play'}}),'Pulled the goalie');
  assert.equal(cardLiveNote({...verified,sport:'NBA'}),'Washington Capitals power play');
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
