import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeTeamSchedule} from '../alerts-worker/src/sports-feed.js';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const context = vm.createContext({games:[],safeText:String,teamLogoUrl:()=>'',teamSignalMarkup:()=>'',
  LEAGUE_LOGOS:{},displayLine:()=>({label:'Line',text:''}),isWatched:()=>false,
  teamMarkup:()=>'',possessionMarkup:()=>'',isWinningTeam:()=>false,trendFor:()=>''});
for (const name of ['teamScheduleFromCanonical','canonicalTeamGame','teamScheduleView','teamGameDate',
  'teamGameTimeLabel','teamSpotlightMarkup','teamScheduleResultMarkup','teamScheduleRowMarkup','gameCard']) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0,name);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}

for (const sport of ['NFL','CFB','NBA','NCAAB','NHL','MLB']) {
  for (const state of ['upcoming','completed']) {
    test(`${sport} ${state} team schedule and spotlight omit broadcast metadata`,()=>{
      const status = state === 'completed' ? {state:'post',shortDetail:'Final'} : {state:'pre',shortDetail:'Scheduled'};
      const payload = {events:[{id:'game',date:'2026-11-15T18:00:00Z',competitions:[{status:{type:status},
        broadcasts:[{names:[{name:'Hidden Network'}]}],competitors:[
          {homeAway:'away',team:{id:'1',displayName:'Our Team'},score:state === 'completed' ? '21' : ''},
          {homeAway:'home',team:{id:'2',displayName:'Opponent Team',abbreviation:'OPP',logos:[{href:'logo.png'}]},score:state === 'completed' ? '14' : ''}
        ]}]}]};
      const row = normalizeTeamSchedule(payload,'1',sport)[0];
      assert.equal(row.broadcast,'[object Object]');
      const team = {sport,id:'1'};
      for (const broadcast of [row.broadcast,{name:'Hidden Network'},[{name:'Hidden Network'},'Other Network'],'Hidden Network']) {
        const view = {...row,broadcast};
        const html = context.teamScheduleRowMarkup(view,team);
        const spotlight = context.teamSpotlightMarkup('Next Game',{row:view},team);
        for (const markup of [html,spotlight]) {
          assert.doesNotMatch(markup,/\[object Object\]|Hidden Network|Other Network|Broadcast|broadcast|network/i);
          assert.match(markup,/Opponent Team/);
          assert.match(markup,/data-opponent-id="2"/);
        }
        assert.match(html,/team-schedule-date/);
        assert.match(html,/@/);
        assert.match(html,/logo\.png/);
        assert.doesNotMatch(html,/<strong>Opponent Team<\/strong><span>/);
        if (state === 'completed') assert.match(html,/<b>W<\/b><strong>21-14<\/strong>/);
        else assert.match(html,/team-schedule-result"><strong>[^<]+<\/strong>/);
      }
      const details = context.teamScheduleRowMarkup({...row,week:'Week 3',note:'Rivalry'},team);
      assert.match(details,/Week 3 · Rivalry/);
    });
  }
}

test('Radar game card retains valid broadcast',()=>{
  const game = {id:'game',sport:'NBA',state:'upcoming',status:'Scheduled',sub:'Tonight',score:50,
    channel:'ESPN',teams:[['Away','AWY',''],['Home','HME','']]};
  assert.match(context.gameCard(game),/<strong>Broadcast<\/strong><span>ESPN<\/span>/);
});
