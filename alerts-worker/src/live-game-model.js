// Keep the explicit legacy adapter available to captures and frozen regressions.
// All active feed consumers use this facade and the shared production entry.
import * as legacy from './game-model.js';
import runtime from '../../scoring/live-runtime.cjs';
export {preservePregameRecords} from './game-model.js';

function finish(game,summary=null) {
  if (!game) return game;
  runtime.applyLiveSnapshot(game,game.sourceCompetition,summary);
  game.modelVersion=runtime.MODEL_VERSION;
  return game;
}
export function normalizeEvent(...args) { return finish(legacy.normalizeEvent(...args)); }
export function applyContextsToGame(game,factors) {
  const changed=legacy.applyContextsToGame(game,factors);
  if (changed) finish(game);
  return changed;
}
export function enrichGame(game,summary,previousGame=null) {
  legacy.enrichGame(game,summary,previousGame?.modelVersion===runtime.MODEL_VERSION ? previousGame : null);
  finish(game,summary);
}
