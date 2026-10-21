const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js','utf8');
const scoreLogic = app.slice(app.indexOf('const SPORT_BASE'),app.indexOf('function normalizeEvent'));
const fixtures = `
  const cfb = {notes:[],competitors:[{team:{displayName:'Minnesota'}},{team:{displayName:'Iowa'}}]};
  const worldSeries = {notes:[{headline:'World Series - Game 1'}],competitors:[{team:{displayName:'Brewers'}},{team:{displayName:'Rays'}}]};
  const scheduledTeams = [{score:'0'},{score:'0'}];
  const ordinary = rateGame('CFB','upcoming',scheduledTeams,{name:'Minnesota vs Iowa'},cfb,'');
  const championship = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays'},worldSeries,'');
  const postseason = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays',season:{type:3}},{notes:[],competitors:[]},'');
  assert.equal(ordinary.score,36);
  assert.equal(championship.score,85);
  assert.ok(championship.score > ordinary.score);
  assert.equal(postseason.score,60);
  assert.ok(!ordinary.factors.some(item => /close/i.test(item.label)));
  const final = rateGame('NFL','completed',[{score:'24'},{score:'27'}],{name:'Jaguars vs Texans'},{status:{type:{detail:'Final'}}},'');
  assert.ok(final.score > final.openingScore);
  console.log('Score model fixtures passed');
`;
vm.runInNewContext(`${scoreLogic}\n${fixtures}`,{assert,console});
