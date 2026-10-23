import {footballSituation} from './display-model.js';
// Normalization and enrichment moved from app.js; scoring uses the shared core.
import '../../rating-core.js';
const {
  SPORT_BASE,
  CLOSE_MARGIN,
  clampScore,
  factorText,
  recordFor,
  rankFor,
  parseLine,
  lineFromSummary,
  gameProgress,
  momentumImpact,
  underdogCandidate,
  upsetImpact,
  stateRating,
  rateGame,
  applyLiveSnapshot
} = globalThis.SportsRadarScore;

const LEAGUE_LOGOS = {
  NFL:'https://a.espncdn.com/i/leaguelogos/500/nfl.png',
  MLB:'https://a.espncdn.com/i/leaguelogos/500/mlb.png',
  NHL:'https://a.espncdn.com/i/leaguelogos/500/nhl.png',
  CFB:'https://a.espncdn.com/i/leaguelogos/500/ncaaf.png',
  NBA:'https://a.espncdn.com/i/leaguelogos/500/nba.png',
  NCAAB:'https://a.espncdn.com/i/leaguelogos/500/ncaab.png',
  Tennis:'https://a.espncdn.com/i/leaguelogos/500/atp.png',
  Soccer:'https://a.espncdn.com/i/leaguelogos/500/soccer.png'
};

function iconFor(sport) {
  return ({
    NFL:'◈',
    MLB:'◉',
    NHL:'✧',
    CFB:'◆',
    NBA:'●',
    NCAAB:'◇',
    Tennis:'◌',
    Soccer:'⊙'
  })[sport] || '✦';
}
function stateFromEvent(event) {
  const type = event.competitions?.[0]?.status?.type;

  if (type?.completed || type?.state === 'post') return 'completed';
  if (type?.state === 'in') return 'live';

  return 'upcoming';
}

function scoreValue(competitor) {
  const value = Number(competitor.score);
  return Number.isFinite(value) ? String(value) : '—';
}

function broadcastFor(competition) {
  const values = [];

  const add = value => {
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
  };

  (competition?.broadcasts || []).forEach(broadcast => {
    (broadcast.names || []).forEach(add);
    add(broadcast.name);
    add(broadcast.shortName);
  });

  (competition?.geoBroadcasts || []).forEach(broadcast => {
    add(broadcast.media?.shortName);
    add(broadcast.media?.name);
    add(broadcast.type?.shortName);
  });

  return [...new Set(values)].slice(0,2).join(' · ');
}

function normalizeEvent(event, sport, leagueLogo, division) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];

  if (competitors.length < 2) return null;

  const teams = competitors.slice(0,2).map(competitor => ({
    id:String(competitor.team?.id || ''),
    name:
      competitor.team?.displayName ||
      competitor.athlete?.displayName ||
      'Unknown',
    shortName:
      competitor.team?.shortDisplayName ||
      competitor.team?.name ||
      competitor.athlete?.shortName ||
      '',
    abbr:
      competitor.team?.abbreviation ||
      competitor.abbreviation ||
      '',
    score:scoreValue(competitor),
    logo:competitor.team?.logo || '',
    color:'white',
    record:recordFor(competitor),
    rank:rankFor(competitor,sport)
  }));

  const gameState = stateFromEvent(event);

  const status =
    competition?.status?.type?.shortDetail ||
    competition?.status?.type?.detail ||
    (
      gameState === 'completed'
        ? 'Final'
        : 'Scheduled'
    );

  const context =
    competition?.notes?.[0]?.headline ||
    event.name ||
    `${sport} matchup`;

  const rating = rateGame(
    sport,
    gameState,
    teams,
    event,
    competition,
    context
  );

  const eventId =
    event.id ||
    `${sport}-${event.name}`;

  const game = {
    id:eventId,
    favorite:false,
    sport,
    division,
    icon:iconFor(sport),
    leagueLogo:leagueLogo || LEAGUE_LOGOS[sport],
    startTime:event.date,
    state:gameState,
    status,
    channel:broadcastFor(competition) || 'Channel not listed',
    teams:teams.map(team => [
      team.name,
      team.abbr,
      team.score,
      team.color,
      team.logo,
      team.record,
      team.rank,
      team.shortName,
      team.id
    ]),
    line:
      gameState === 'upcoming'
        ? parseLine(
            competition?.odds?.[0],
            competition,
            sport
          )
        : null,
    context,
    why:rating.reason,
    sub:
      competition?.venue?.fullName ||
      competition?.venue?.address?.city ||
      'Live scoreboard',
    score:rating.score,
    baseScore:rating.score,
    openingScore:rating.openingScore,
    factors:rating.factors,
    underdog:rating.underdog,
    upsetText:rating.upsetText,
    upsetPoints:rating.upsetPoints,
    liveRawStatus:competition?.status,
    liveRawSituation:competition?.situation
  };

  Object.defineProperties(game,{
    sourceEvent:{value:event,enumerable:false},
    sourceCompetition:{value:competition,enumerable:false}
  });

  applyLiveSnapshot(
    game,
    competition,
    null
  );

  if (['NFL','CFB'].includes(sport)) game.footballSituation = footballSituation(game);
  return game;
}

function contextKey(game) {
  return `${game.sport}:${game.id}`;
}

function teamObjectsForRating(game) {
  return game.teams.map(team => ({
    id:String(team[8] || ''),
    name:team[0],
    abbr:team[1],
    score:team[2],
    color:team[3],
    logo:team[4],
    record:team[5],
    rank:team[6],
    shortName:team[7]
  }));
}

function applyContextsToGame(game,factors) {
  if (!game.sourceEvent || !game.sourceCompetition || !Array.isArray(factors) || !factors.length) return false;
  const accepted = factors
    .filter(factor => factor?.verified !== false && Number(factor?.confidence) >= .7 && factor?.type && factor?.text)
    .slice(0,6);
  if (!accepted.length) return false;
  game.sourceEvent.sportsRadarContextFactors = accepted.map(factor => ({
    type:factor.type,
    text:factor.text,
    confidence:Number(factor.confidence),
    verified:true
  }));
  const rating = rateGame(
    game.sport,
    game.state,
    teamObjectsForRating(game),
    game.sourceEvent,
    game.sourceCompetition,
    game.context
  );
  game.score = rating.score;
  game.baseScore = rating.score;
  game.openingScore = rating.openingScore;
  game.factors = rating.factors;
  game.why = rating.reason;
  game.underdog = rating.underdog;
  game.upsetText = rating.upsetText;
  game.upsetPoints = rating.upsetPoints;
  game.qualitativeContexts = accepted;
  applyLiveSnapshot(game,game.sourceCompetition,null);
  return true;
}

function playPosition(sport,play) {
  const period =
    Number(
      play?.period?.number ||
      play?.period?.value ||
      play?.period ||
      0
    );

  if (
    !Number.isFinite(period) ||
    period < 1
  ) {
    return null;
  }

  if (sport === 'MLB') {
    return Math.min(
      1,
      Math.max(
        0,
        (
          period -
          1 +
          (
            /bottom|bot/i.test(
              String(
                play.period?.displayValue ||
                play.inningHalf ||
                ''
              )
            )
              ? .75
              : .25
          )
        ) / 9
      )
    );
  }

  if (sport === 'NHL') {
    const clock =
      String(
        play.clock?.displayValue || ''
      ).match(
        /^(\d+):(\d+)/
      );

    const elapsed =
      clock
        ? Number(clock[1]) * 60 +
          Number(clock[2])
        : 600;

    return period > 3
      ? Math.min(
          1,
          .92 +
          Math.min(
            300,
            elapsed
          ) /
          300 *
          .08
        )
      : Math.min(
          .92,
          (
            (period - 1) *
            20 *
            60 +
            elapsed
          ) /
          (60 * 60) *
          .92
        );
  }

  const total = ({
    NFL:4,
    CFB:4,
    NHL:3,
    NBA:4,
    NCAAB:2,
    Soccer:2
  })[sport];

  const length = ({
    NFL:15,
    CFB:15,
    NHL:20,
    NBA:12,
    NCAAB:20,
    Soccer:45
  })[sport];

  if (
    !total ||
    !length
  ) {
    return null;
  }

  const clock =
    String(
      play.clock?.displayValue || ''
    ).match(
      /^(\d+):(\d+)/
    );

  const remaining =
    clock
      ? Math.min(
          length * 60,
          Number(clock[1]) * 60 +
          Number(clock[2])
        )
      : length * 30;

  return Math.min(
    1,
    Math.max(
      0,
      (
        period -
        1 +
        1 -
        remaining /
        (length * 60)
      ) / total
    )
  );
}

function scoringEvents(summary) {
  return summary?.scoringPlays?.length
    ? summary.scoringPlays
    : (summary?.plays || [])
        .filter(
          play =>
            play.scoringPlay === true
        );
}

function compactPlay(play) {
  const text =
    String(
      play?.text ||
      play?.shortText ||
      play?.type?.text ||
      ''
    )
      .replace(/\s+/g,' ')
      .trim();

  return text.length > 86
    ? `${text.slice(0,83)}…`
    : text;
}

function summarySpecificWhy(game,summary) {
  const scoring =
    scoringEvents(summary)
      .map(play => ({
        play,
        position:
          playPosition(
            game.sport,
            play
          )
      }))
      .filter(item =>
        item.position !== null
      )
      .sort(
        (a,b) =>
          a.position -
          b.position
      );

  const last =
    scoring[
      scoring.length - 1
    ];

  if (!last) {
    return null;
  }

  const text =
    compactPlay(last.play);

  if (!text) {
    return null;
  }

  const time =
    `${last.play.period?.displayValue || ''} ${last.play.clock?.displayValue || ''}`
      .trim();

  if (
    game.state === 'completed'
  ) {
    const decisive =
      /(0:00|last second|game[- ]winning|walk.off)/i
        .test(
          `${time} ${text}`
        ) ||
      (
        Number(
          last.play.period?.number
        ) >
        ({
          NHL:3,
          NFL:4,
          CFB:4,
          NBA:4,
          NCAAB:2
        })[game.sport] &&
        /goal|field goal|touchdown|basket/i
          .test(text)
      );

    return {
      label:
        decisive
          ? 'Decisive play'
          : 'Last score',

      text:
        `${time ? `${time} · ` : ''}${text}`
    };
  }

  const current =
    playPosition(
      game.sport,
      {
        period:{
          number:
            game.liveRawStatus?.period
        },
        clock:{
          displayValue:
            game.liveRawStatus?.displayClock
        }
      }
    ) ??
    gameProgress(
      game.sport,
      {
        status:
          game.liveRawStatus ||
          {}
      }
    );

  if (
    current -
    last.position >
    .12
  ) {
    return null;
  }

  return {
    label:'Latest score',
    text:
      `${time ? `${time} · ` : ''}${text}`
  };
}

function enrichGame(game,summary) {
            if (
              game.state === 'live'
            ) {
              applyLiveSnapshot(
                game,
                summary?.header?.competitions?.[0],
                summary
              );


            }

            if (['NFL','CFB'].includes(game.sport)) game.footballSituation = footballSituation(game);

            const line =
              lineFromSummary(
                summary,
                game.sport
              );

            if (
              line &&
              (
                game.state !== 'upcoming' ||
                !game.line
              )
            ) {
              game.line = line;



            }

            if (
              !game.underdog &&
              game.state !== 'upcoming'
            ) {
              const summaryCompetition =
                summary?.header
                  ?.competitions?.[0];

              const candidate =
                underdogCandidate(
                  game.sport,
                  summaryCompetition,
                  summary?.pickcenter?.[0] ||
                  summaryCompetition?.odds?.[0]
                );

              if (candidate) {
                game.underdog =
                  candidate;

                const impact =
                  upsetImpact(
                    candidate,
                    game.teams,
                    game.state,
                    game.state === 'completed'
                      ? 1
                      : gameProgress(
                          game.sport,
                          summaryCompetition
                        )
                  );

                if (impact.points) {
                  game.upsetPoints =
                    impact.points;

                  game.upsetText =
                    impact.text;

                  game.factors.push({
                    label:
                      game.state === 'completed'
                        ? 'Underdog won outright'
                        : 'Underdog threatens upset',
                    points:
                      impact.points
                  });

                  game.baseScore =
                    clampScore(
                      game.baseScore +
                      impact.points
                    );

                  game.score =
                    clampScore(
                      game.baseScore +
                      (
                        game.live?.bonus ||
                        0
                      )
                    );


                }
              }
            }

            if (
              game.state !== 'upcoming'
            ) {
              const momentum =
                momentumImpact(
                  game.sport,
                  summary,
                  game.state === 'completed'
                    ? 1
                    : gameProgress(
                        game.sport,
                        summary?.header?.competitions?.[0] ||
                        {
                          status:
                            game.liveRawStatus
                        }
                      ),
                  game.state
                );

              if (momentum.points) {
                game.momentumText =
                  momentum.text;

                game.momentumPoints =
                  momentum.points;

                game.factors.push(
                  ...momentum.factors
                );

                game.score =
                  clampScore(
                    game.score +
                    momentum.points
                  );


              }
            }

            const moment =
              summarySpecificWhy(
                game,
                summary
              );

            if (moment) {
              game.moment =
                moment.text;

              game.momentLabel =
                moment.label;


            }

            if (
              game.state !== 'completed'
            ) {
              return;
            }

            const plays =
              scoringEvents(summary);

            const last =
              plays[
                plays.length - 1
              ];

            const finalText =
              `${last?.clock?.displayValue || ''} ${compactPlay(last)}`;

            if (
              /(0:00|last second|game[- ]winning)/i
                .test(finalText) &&
              /field goal|goal|home run|touchdown/i
                .test(finalText)
            ) {
              game.factors.push({
                label:'Decisive last play',
                points:14
              });

              game.score =
                clampScore(
                  game.score +
                  14
                );


            } else {
              // One finishing award after momentum, outside its +25 cap.
              // Optional lookup keeps the original-core golden replay compatible.
              const finish = globalThis.SportsRadarScore.defensiveFinishFactor?.(game.sport,summary);
              if (finish) {
                game.factors.push(finish);
                game.score = clampScore(game.score + finish.points);
              }
            }

}
export {normalizeEvent,applyContextsToGame,enrichGame};
