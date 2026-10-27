/* Shared scoring module; supports classic browser scripts and Worker/Node bundling. */
(function (root) {
  const SPORT_FLOOR = 32;
  const SCHEDULE_SCARCITY = {NFL:10,MLB:0,NHL:5,CFB:8,NBA:5,NCAAB:3,Tennis:2,Soccer:4};
  const SPORT_BASE = Object.fromEntries(
    Object.entries(SCHEDULE_SCARCITY).map(([sport,points]) => [sport,SPORT_FLOOR + points])
  );

  const NFL_DIVISIONS = {
    BUF:'AFC East',MIA:'AFC East',NE:'AFC East',NYJ:'AFC East',
    BAL:'AFC North',CIN:'AFC North',CLE:'AFC North',PIT:'AFC North',
    HOU:'AFC South',IND:'AFC South',JAX:'AFC South',TEN:'AFC South',
    DEN:'AFC West',KC:'AFC West',LAC:'AFC West',LV:'AFC West',
    DAL:'NFC East',NYG:'NFC East',PHI:'NFC East',WSH:'NFC East',
    CHI:'NFC North',DET:'NFC North',GB:'NFC North',MIN:'NFC North',
    ATL:'NFC South',CAR:'NFC South',NO:'NFC South',TB:'NFC South',
    ARI:'NFC West',LAR:'NFC West',SF:'NFC West',SEA:'NFC West'
  };

  const NHL_DIVISIONS = {
    BOS:'Atlantic Division',BUF:'Atlantic Division',DET:'Atlantic Division',FLA:'Atlantic Division',
    MTL:'Atlantic Division',OTT:'Atlantic Division',TB:'Atlantic Division',TOR:'Atlantic Division',
    CAR:'Metropolitan Division',CBJ:'Metropolitan Division',NJ:'Metropolitan Division',
    NYI:'Metropolitan Division',NYR:'Metropolitan Division',PHI:'Metropolitan Division',
    PIT:'Metropolitan Division',WSH:'Metropolitan Division',
    CHI:'Central Division',COL:'Central Division',DAL:'Central Division',MIN:'Central Division',
    NSH:'Central Division',STL:'Central Division',UTA:'Central Division',WPG:'Central Division',
    ANA:'Pacific Division',CGY:'Pacific Division',EDM:'Pacific Division',LA:'Pacific Division',
    LAK:'Pacific Division',SJ:'Pacific Division',SJS:'Pacific Division',SEA:'Pacific Division',
    VAN:'Pacific Division',VGK:'Pacific Division'
  };

  const NBA_DIVISIONS = {
    BOS:'Atlantic Division',BKN:'Atlantic Division',NY:'Atlantic Division',NYK:'Atlantic Division',
    PHI:'Atlantic Division',TOR:'Atlantic Division',
    CHI:'Central Division',CLE:'Central Division',DET:'Central Division',IND:'Central Division',
    MIL:'Central Division',
    ATL:'Southeast Division',CHA:'Southeast Division',MIA:'Southeast Division',
    ORL:'Southeast Division',WSH:'Southeast Division',
    DEN:'Northwest Division',MIN:'Northwest Division',OKC:'Northwest Division',
    POR:'Northwest Division',UTA:'Northwest Division',
    GS:'Pacific Division',GSW:'Pacific Division',LAC:'Pacific Division',
    LAL:'Pacific Division',PHX:'Pacific Division',SAC:'Pacific Division',
    DAL:'Southwest Division',HOU:'Southwest Division',MEM:'Southwest Division',
    NO:'Southwest Division',NOP:'Southwest Division',SA:'Southwest Division',SAS:'Southwest Division'
  };

  const MLB_DIVISIONS = {
    BAL:'AL East',BOS:'AL East',NYY:'AL East',TB:'AL East',TOR:'AL East',
    CWS:'AL Central',CHW:'AL Central',CLE:'AL Central',DET:'AL Central',
    KC:'AL Central',KCR:'AL Central',MIN:'AL Central',
    ATH:'AL West',OAK:'AL West',HOU:'AL West',LAA:'AL West',SEA:'AL West',TEX:'AL West',
    ATL:'NL East',MIA:'NL East',NYM:'NL East',PHI:'NL East',WSH:'NL East',
    CHC:'NL Central',CIN:'NL Central',MIL:'NL Central',PIT:'NL Central',STL:'NL Central',
    ARI:'NL West',COL:'NL West',LAD:'NL West',SD:'NL West',SDP:'NL West',
    SF:'NL West',SFG:'NL West'
  };

  const LEAGUE_DIVISIONS = {
    NFL:NFL_DIVISIONS,
    NHL:NHL_DIVISIONS,
    NBA:NBA_DIVISIONS,
    MLB:MLB_DIVISIONS
  };

  const CONTEXT_WEIGHTS = {
    former_captain_return:10,
    first_game_back:10,
    former_star_return:8,
    star_injury_return:8,
    championship_rematch:8,
    playoff_rematch:6,
    rivalry:7,
    major_trade_storyline:6,
    historic_streak:6,
    season_debut:5,
    milestone_chase:5,
    playoff_race:5,
    coach_return:4,
    star_hot_streak:4,
    notable_recent_performance:2,
    team_win_streak:3,
    elite_efficiency_profile:4,
    strength_of_schedule:3,
    confirmed_key_starters:4,
    ace_pitching_matchup:5,
    star_absence:-5,
    multiple_stars_out:-8
  };

  const CONTEXT_LABELS = {
    former_captain_return:'Former captain returns',
    first_game_back:'First game back against former team',
    former_star_return:'Former star returns',
    star_injury_return:'Star player returns from injury',
    championship_rematch:'Championship rematch',
    playoff_rematch:'Playoff rematch',
    rivalry:'Rivalry context',
    major_trade_storyline:'Major trade storyline',
    historic_streak:'Historic streak',
    season_debut:'Notable season debut',
    milestone_chase:'Major milestone chase',
    playoff_race:'Playoff race implications',
    coach_return:'Coach returns to former team',
    star_hot_streak:'Star player hot streak',
    notable_recent_performance:'Recent notable performance',
    team_win_streak:'Team winning streak',
    elite_efficiency_profile:'Elite efficiency profile',
    strength_of_schedule:'Battle-tested schedule',
    confirmed_key_starters:'Confirmed key starters',
    ace_pitching_matchup:'Confirmed ace pitching matchup',
    star_absence:'Notable star absence',
    multiple_stars_out:'Multiple major absences'
  };

  const CLOSE_MARGIN = {
    NFL:14,
    MLB:3,
    NHL:3,
    CFB:14,
    NBA:12,
    NCAAB:12,
    Tennis:3,
    Soccer:3
  };

  const api = {SPORT_FLOOR,SCHEDULE_SCARCITY,SPORT_BASE,NFL_DIVISIONS,NHL_DIVISIONS,NBA_DIVISIONS,MLB_DIVISIONS,LEAGUE_DIVISIONS,CONTEXT_WEIGHTS,CONTEXT_LABELS,CLOSE_MARGIN};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (root.SportsRadarScoring ||= {}).shared_config = api;
  }
})(globalThis);
