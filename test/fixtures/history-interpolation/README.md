# Display-only history fixtures

Public, read-only `/game/{sport}/{id}` responses captured from the existing
SlateMeter alerts Worker on November 3, 2026. Gzip contains the response bytes;
no rating, timestamp, classification, or supporting event was edited.

- NFL 401873024: Cardinals–Cowboys, completed overtime.
- CFB 401856847: Oklahoma State–Iowa State, completed regulation.
- NHL 401892629: Golden Knights–Bruins, completed shootout.
- NBA 401909903: Celtics–Magic, completed regulation.
- NFL 401873033: Chiefs–Broncos, incomplete historical coverage.

The primary 475-snapshot Pelicans fixture remains in `../market-timeline/`
unchanged. The visual harness also uses the existing compact NBA transition
fixture and the archived sparse Chiefs fixture from `../timeline-clarity/`.
The latter is an actual older capture with only final snapshots, not a
synthetically thinned live history.

These files are test/audit evidence only and never enter the site build.
