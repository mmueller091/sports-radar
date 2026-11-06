/**
 * Generate human-reviewable X/Buffer drafts from a saved SlateMeter /feed JSON.
 * No network access, API tokens, scheduling, or publishing.
 * Usage: node scripts/preview-social-posts.mjs path/to/feed.json
 */
import {readFileSync} from 'node:fs';
import {draftExcitementPost} from '../social/hashtag-registry.mjs';

const path=process.argv[2];
if(!path||process.argv.length!==3){
  console.error('Usage: node scripts/preview-social-posts.mjs path/to/feed.json');
  process.exitCode=2;
}else{
  try{
    const feed=JSON.parse(readFileSync(path,'utf8'));
    if(!Array.isArray(feed.games))throw new Error('Expected /feed JSON with a games array');
    const drafts=[];
    for(const game of feed.games){
      if(game.state!=='live')continue;
      try{
        const draft=draftExcitementPost(game);
        if(draft.eligible)drafts.push({game,draft});
      }catch(error){
        // Unsupported sports or incomplete scores are never posted or drafted.
      }
    }
    drafts.sort((a,b)=>b.game.score-a.game.score);
    if(!drafts.length)console.log('No live games at or above 85 with complete draft data.');
    for(const {game,draft} of drafts){
      console.log(`\n${game.sport} ${game.id} | REVIEW ONLY${draft.missingTeamHashtags.length?' | No confirmed tag for: '+draft.missingTeamHashtags.join(', '):''}\n`);
      console.log(draft.text+'\n');
      for(const pending of draft.unverifiedTeamTags){
        if(pending.candidate)console.log(`Unverified suggestion for ${pending.team}: ${pending.candidate} (${pending.verification})`);
      }
    }
  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}
