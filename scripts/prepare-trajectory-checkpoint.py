"""Build HEAD plus an explicit audited overlay. Never touches the Git index.

The temporary candidate contains no junctions, symlinks or copied node_modules.
Install its third-party build/test dependencies from its own package-lock.json.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROLES = {
    'rating-core.js': 'Phase 2 dependency: aggregateLiveBonus import and equivalent live aggregation call; both hunks required together with pressure.js.',
    'scoring/shared/pressure.js': 'Phase 2 dependency: aggregateLiveBonus implementation and export; preserve existing production aggregation.',
    'scoring/shared/basketball.js': 'Phase 2 dependency: track genericTimePoints/reasons, preserve production points, expose candidatePoints split.',
    'scoring/shared/probability.js': 'Telemetry correction: NHL positioned WP uses elapsed provider clocks.',
    'scoring/shared/trajectory.js': 'Telemetry correction: NHL scoring moments use elapsed provider clocks.',
    'scoring/shared/history.js': 'Phase 3.1: optional ownership argument, suppress sustained factor only in explicit live path, inject trajectory before caps.',
    'scoring/sports/nhl.js': 'Phase 3.1: optional ownership argument and sustained replacement before NHL history/headroom caps.',
    'calibration/shadow-candidate.cjs': 'Phase 2/3/3.1 integration: explicit policy dispatch, batched finalization, off default retained; all current hunks required.',
    'scripts/shadow-candidate-report.mjs': 'Replay dependency: retain full telemetry/scoring diagnostics and batched trajectory checkpoint evaluation.',
    'test/live-phase.test.js': 'Full-suite dependency: load recordedTimelinePoints in the existing UI fixture VM; required test helper, no scoring change.',
    'test/trajectory.test.js': 'Telemetry regression for NHL elapsed clocks, coverage ordering and history duration.',
    'calibration/trajectory-policy.cjs': 'Frozen Phase 3 policy definitions, confidence treatment and trajectory calculation.',
    'calibration/trajectory-archetypes.mjs': 'Phase 3 synthetic histories through authoritative telemetry.',
    'scripts/trajectory-calibration.mjs': 'Phase 3 replay, summaries and report renderer; imported by Phase 3.1 tooling.',
    'calibration/output/trajectory-calibration.json': 'Preserved Phase 3 results consumed by regression tests.',
    'calibration/trajectory-calibration-report.md': 'Preserved Phase 3 experimental report, not renamed.',
    'test/trajectory-calibration.test.js': 'Phase 3 grid/artifact/summary regressions.',
    'test/trajectory-shadow.test.js': 'Phase 3 opt-in, caps, maturity, confidence and batch regressions.',
    'calibration/trajectory-live-policy.cjs': 'Frozen Phase 3.1 history ownership and current-urgency guardrails.',
    'calibration/trajectory-live-fixtures.mjs': 'Preserved Phase 3.1 pairs, NHL headroom, revival and missing-current-WP fixtures.',
    'scripts/trajectory-live-calibration.mjs': 'Phase 3.1 direct replay, comparisons and reporting; no broad replay rerun in this task.',
    'calibration/output/trajectory-live-calibration.json': 'Preserved Phase 3.1 replay results and validation provenance.',
    'calibration/trajectory-live-calibration-report.md': 'Preserved Phase 3.1 report, not relabelled.',
    'calibration/trajectory-history-ownership.md': 'Ownership audit and required pre-existing helper dependencies.',
    'test/fixtures/phase31-shadow-before.cjs.gz': 'Frozen pre-Phase-3.1 shadow orchestration oracle.',
    'test/helpers/phase31-oracle.cjs': 'Loads frozen oracle with candidate-local shared dependencies.',
    'test/trajectory-live.test.js': 'Phase 3.1 targeted semantics, off parity, unchanged completed path, direct/batch checks.',
    'test/trajectory-live-calibration.test.js': 'Phase 3.1 artifact, equal-game, 95/99, ownership and ablation checks.',
    'calibration/trajectory-checkpoint-fixtures.mjs': 'New unsaturated matched fixtures and historical thinning with fixed valid current WP.',
    'scripts/trajectory-review-pack.mjs': 'Fixed-checkpoint review generator, explicit policy provenance and complete diagnostics.',
    'calibration/trajectory-reviewer-pack.md': 'Blind 22-case review pack; blank human answers; no policy outputs.',
    'calibration/trajectory-diagnostic-key.json': 'Separate policy/contribution key, focused results and thinning comparisons.',
    'calibration/trajectory-focused-validation.md': 'Compact unsaturated results with retained earlier event differences.',
    'test/trajectory-checkpoint.test.js': 'Focused semantics, causal review projection, reproducibility and checkpoint off parity.',
    'scripts/prepare-trajectory-checkpoint.py': 'Reproducible explicit-overlay isolation builder; never stages content.',
    'calibration/trajectory-checkpoint-manifest.json': 'Machine-readable proposed staging manifest and source hashes.',
    'calibration/trajectory-checkpoint-manifest.md': 'Human-readable exact staging paths, hunks and dependency audit.',
}
MANIFESTS = {'calibration/trajectory-checkpoint-manifest.json', 'calibration/trajectory-checkpoint-manifest.md'}
TEMPLATE_SCRIPTS = {f'apply-recorded-excitement-history{suffix}.mjs' for suffix in ['', '-v2', '-v3', '-v4']}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parent = git('rev-parse', 'HEAD').decode().strip()
    tracked = set(git('ls-tree', '-r', '--name-only', parent).decode().splitlines())
    dirty = git('status', '--porcelain', '--untracked-files=all').decode().splitlines()
    excluded = [line for line in dirty if line[3:].replace('\\', '/') not in ROLES]
    entries = []
    for path, role in ROLES.items():
        if path not in MANIFESTS and not (ROOT / path).is_file():
            raise RuntimeError(f'Missing required checkpoint dependency: {path}')
        diff = git('diff', '--no-ext-diff', '--unified=0', parent, '--', path).decode('utf8') if path in tracked else ''
        entries.append({'path': path, 'action': 'modify' if path in tracked else 'add',
                        'scope': 'all current hunks' if path in tracked else 'entire new file',
                        'hunks': re.findall(r'^@@.*@@.*$', diff, re.M), 'reason': role,
                        'sha256': None if path in MANIFESTS else digest((ROOT / path).read_bytes())})
    manifest = {'version': 1, 'baseCommit': parent, 'stageNothingAutomatically': True,
                'assembly': 'git archive of baseCommit plus only these exact overlay paths; no workspace dependency symlinks/copies',
                'entries': entries, 'excludedDirtyPaths': excluded,
                'unchangedBaseDependencies': ['all scoring modules and sport models at baseCommit',
                    'alerts-worker/src/game-model.js and display/provider adapters',
                    'calibration/helpers.mjs, expectations.json and context-overrides.json',
                    'scripts/current-tension-calibration.mjs and Phase 2 JSON/report/tests',
                    'test/helpers/scoring-source.cjs, index.html, sw.js and browser fixtures',
                    '107 tracked test/fixtures/real-games/*.json files and compressed parity oracles',
                    'alerts-worker/package.json and package-lock.json; npm ci required inside the candidate'],
                'staticScanExclusions': {name: 'Embedded patch payload imports are generated into alerts-worker/src or alerts-worker/test; not runtime imports of this root-level migration script. Targets snapshot-history.js and sports-feed.js exist in the archived tree.' for name in sorted(TEMPLATE_SCRIPTS)},
                'hashNote': 'SHA256 covers source bytes including line endings. Two self-describing manifest files omit their own hashes. Git may normalize line endings on a future user-approved commit.'}
    (ROOT / 'calibration/trajectory-checkpoint-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    rows = ['# Proposed experimental checkpoint staging manifest', '',
            f'Base commit: `{parent}`. Apply the following overlay to that complete tracked tree. **Do not stage automatically.**', '',
            'All listed modified-file hunks are intentional dependencies; there are no partial-file exclusions. Production/default/completed behavior and policy constants remain frozen. The validation tree uses archived HEAD content plus this explicit overlay, never unstaged files outside its root.', '',
            'Action | Path | Exact hunk scope | Required role', '--- | --- | --- | ---']
    for e in entries:
        scope = '; '.join(e['hunks']) or e['scope']
        rows.append(f"{e['action']} | `{e['path']}` | `{scope}` | {e['reason']}")
    rows += ['', '## Dependencies already committed at the base', '', *[f'- {x}' for x in manifest['unchangedBaseDependencies']], '',
             'The current rating-core.js import/call hunks, pressure.js helper/export hunks and basketball.js generic-time/candidate split are included together. The live-phase test helper hunk is included because the complete UI test fixture needs recordedTimelinePoints; it is not a scoring change.', '',
             '## Deliberate exclusions', '',
             'No current non-ignored dirty change was found outside this manifest.' if not excluded else '\n'.join(f'- `{x}`: outside audited scope, preserved locally.' for x in excluded), '',
             'Ignored work/, alerts-worker/node_modules/, .wrangler/, .wrangler-config/, temporary logs, and the isolated validation receipt are not proposed for staging. Install dependency packages from the committed lockfile in the isolated tree. No local package directory is reused. Unchanged HEAD content needs no staging.', '',
             'The initial text scan flagged relative imports inside embedded payload strings in the four existing apply-recorded-excitement-history*.mjs migration scripts. Inspection confirmed these are generated Worker/test imports, not root-level runtime dependencies. Their snapshot-history.js and sports-feed.js targets are already committed. Only those template payload scans are excluded; the scripts remain in archived HEAD content.', '',
             '## Assembly and verification', '',
             'Run `python scripts/prepare-trajectory-checkpoint.py` to create a new isolated temporary tree. The builder reads git archive and copies only the paths listed above; it does not reset, stash, clean, stage, commit, or create a worktree. Run npm ci against the candidate lockfile, clear RATING_CORE_PATH/NODE_PATH/NODE_OPTIONS, and run tests with the candidate as cwd. Source hashes and exact hunk headers are in the JSON manifest. No scoring grid or promotion is part of this checkpoint.', '']
    (ROOT / 'calibration/trajectory-checkpoint-manifest.md').write_text('\n'.join(rows), encoding='utf8')
    tree = Path(tempfile.mkdtemp(prefix='sports-radar-phase31-checkpoint-'))
    archive = git('archive', '--format=zip', parent)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        z.extractall(tree)
    for path in ROLES:
        destination = tree / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, destination)
    # Validate all intended source bytes, including manifests, without invoking Git filters.
    for path in ROLES:
        assert (tree / path).read_bytes() == (ROOT / path).read_bytes(), path
    # Every static relative code import must resolve inside the candidate. Runtime
    # package imports are supplied separately from its committed package lock.
    missing = []
    for name in ['alerts-worker/src/snapshot-history.js', 'alerts-worker/src/sports-feed.js']:
        assert (tree / name).is_file(), name
    for path in sorted(tree.rglob('*')):
        if path.suffix not in {'.js', '.mjs', '.cjs'}:
            continue
        if path.name in TEMPLATE_SCRIPTS:
            continue
        source = path.read_text(encoding='utf8', errors='replace')
        for relative in re.findall(r"(?:from\s*|require\s*\(|import\s*\()\s*['\"](\.[^'\"]+)['\"]", source):
            target = (path.parent / relative).resolve()
            if not target.is_relative_to(tree):
                missing.append(f'{path.relative_to(tree)} -> outside tree: {relative}')
            elif not target.exists() and 'node_modules' not in target.parts:
                missing.append(f'{path.relative_to(tree)} -> {relative}')
    if missing:
        raise RuntimeError('Missing/escaping dependencies:\n' + '\n'.join(missing))
    (Path(tempfile.gettempdir()) / 'trajectory-checkpoint-tree.txt').write_text(str(tree), encoding='utf8')
    print(json.dumps({'tree': str(tree), 'baseCommit': parent, 'overlayFiles': len(ROLES),
                      'baseFiles': len(tracked), 'relativeImportMissing': missing, 'excludedDirtyPaths': excluded}, indent=2))

if __name__ == '__main__':
    main()
