import test from 'node:test';
import assert from 'node:assert/strict';
import teams from '../teams.json' with {type:'json'};
import registry from '../social/hashtags.json' with {type:'json'};
import {auditSocialHashtags,formatSocialAudit,SPORTS} from '../scripts/audit-social-hashtags.mjs';

test('offline audit accounts for every canonical team and separates candidate from missing',()=>{
  const report=auditSocialHashtags();
  assert.equal(report.total.total,SPORTS.reduce((n,sport)=>n+teams[sport].length,0));
  assert.equal(report.total.total,report.total.verified+report.total.candidate+report.total.missing);
  for(const sport of SPORTS){
    const counts=report.bySport[sport];
    assert.equal(counts.total,counts.verified+counts.candidate+counts.missing);
    assert.equal(counts.candidate,counts.unverified.length);
    assert.equal(counts.missing,counts.unlisted.length);
    assert.deepEqual(counts.unknownRegistryIds,[]);
  }
  assert.deepEqual(report.problems,[]);
  assert.match(formatSocialAudit(report),/Only first-party verified or owner-approved tags are auto-posted/);
  assert.equal(report.bySport.NHL.verified,32);
  assert.equal(report.bySport.NHL.candidate,0);
  for(const sport of ['NFL','NBA']){
    assert.equal(report.bySport[sport].verified,teams[sport].length);
    assert.equal(report.bySport[sport].candidate,0);
  }
});

test('live/upcoming feed audit prioritizes all game teams without double-counting repeat opponents',()=>{
  const feed={games:[
    {sport:'NCAAM',state:'live',teams:[['Wake Forest','','','','','','','','154'],['Vanderbilt','','','','','','','','238']]},
    {sport:'NCAAB',state:'upcoming',teams:[{id:'150',name:'Duke Blue Devils'},{id:'999999',name:'Unknown'}]},
    {sport:'NCAAB',state:'completed',teams:[{id:'251'},{id:'57'}]},
    {sport:'NCAAB',state:'upcoming',teams:[{id:'154'},{id:'294'}]}
  ]};
  const report=auditSocialHashtags({feed});
  assert.equal(report.priority.games,3);
  assert.equal(report.priority.teams,4);
  assert.equal(report.priority.verified,3);
  assert.equal(report.priority.missing,1);
  assert.equal(report.priority.items[0].name,'Vanderbilt Commodores');
  assert.match(formatSocialAudit(report),/Jacksonville Dolphins/);
});

test('audit rejects invalid feed format without fetching anything',()=>{
  assert.throws(()=>auditSocialHashtags({feed:{games:null}}),/games array/);
});

test('November 5 basketball slate reflects batch1 approvals and four remaining unverified teams',()=>{
  const games=[
    ['154','238'],['294','57'],['324','150'],['2649','127'],
    ['2241','251'],['219','356'],['2065','2641'],['13','12']
  ].map(([a,b],i)=>({sport:'NCAAB',state:i===0?'live':'upcoming',
    teams:[{id:a},{id:b}]}));
  const priority=auditSocialHashtags({feed:{games}}).priority;
  assert.equal(priority.teams,16);
  assert.equal(priority.verified,12);
  assert.equal(priority.missing,4);
  assert.deepEqual(priority.items.filter(x=>x.status==='missing').map(x=>x.name).sort(),[
    'Bethune-Cookman Wildcats','Cal Poly Mustangs',
    "Gardner-Webb Runnin' Bulldogs",'Jacksonville Dolphins'
  ]);
});

test('verified entries contain official handles and attributable first-party proof',()=>{
  for(const entries of Object.values(registry.teams)){
    for(const entry of Object.values(entries)){
      if(entry.verification!=='official-site')continue;
      assert.ok(entry.account);
      assert.ok(entry.sourceUrls.includes(`https://x.com/${entry.account}`));
      assert.ok(entry.sourceUrls.some(url=>!url.startsWith('https://x.com/')
        &&!url.includes('blinkfire.com/')&&!url.includes('puckbeat.com/')));
      assert.match(entry.lastVerifiedAt,/^20\d\d-\d\d-\d\d$/);
    }
  }
});
