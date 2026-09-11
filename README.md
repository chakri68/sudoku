# daily sudoku

One Sudoku per day, rebuilt from the date every time you ask for it.

There's no database. There's no `/api/puzzle/today`. The date **is** the puzzle:
hash `2026-09-11`, seed a PRNG with the result, shuffle a grid, carve out clues.
Do that again tomorrow, next year, on someone else's phone, and you get the same
81 characters back. A puzzle from 2004 isn't stored anywhere. It's just waiting to
be recomputed.

```
date string → SHA-256 → seed → PRNG → solved grid → carve clues → verify unique
```

Open `/2004-08-06`. That grid has always been that date's grid, and it'll still be
there when the hosting bill lapses, because there's nothing to host.

## running it

```bash
npm install
npm run dev
```

Then there's a CLI, which is genuinely the nicer way to poke at the generator:

```bash
npm run sudoku -- 2026-09-11      # one puzzle, its seeds, and a validity check
npm run sudoku -- --range 2026-01-01 30
npm run sudoku -- --tune 2000     # difficulty distribution over sampled dates
npm run sudoku -- --fixtures      # golden fixtures as JSON
```

No build step for that one. Node 24 runs the TypeScript directly.

```bash
npm test         # 92 tests
npm run build
```

## how it actually works

**Seeds are namespaced.** Every subsystem hashes its own string, so changing how
difficulty gets picked can't disturb the board:

```
sudoku:v1:classic:2026-09-11:board:0
sudoku:v1:classic:2026-09-11:removal:0
sudoku:v1:classic:2026-09-11:difficulty
```

That shape is a permanent contract. Adding to it is fine; reordering it is not.

**The PRNG is five lines of integer arithmetic.** Mulberry32, with `Math.imul` so
the multiplies stay in 32-bit space instead of drifting into float64 — which is
the usual way a "deterministic" generator quietly stops being one. Golden tests
pin the exact output stream.

**Boards come from transforms, not search.** Start from a canonical grid, then
permute digits, shuffle bands, rows, stacks, columns, maybe transpose. Every step
maps a valid grid to a valid grid, so it can't fail and can't backtrack. About
1.2 × 10¹² reachable grids, generated in microseconds. The order of those
transforms is frozen — reordering them is harmless individually and changes every
puzzle in history collectively.

**Uniqueness is an invariant, not a check.** The carver only clears a cell if the
grid still has exactly one solution without it, so an ambiguous puzzle can't be
published. The solution counter bails at two, which turns a potentially enormous
search into an instant answer on ambiguous grids.

**Difficulty is scored, not counted.** Clue count is a bad proxy — a 28-clue grid
that falls to hidden singles is gentler than a 34-clue grid that stalls. So a
human-style solver runs the techniques a person would actually reach for (naked
and hidden singles, locked candidates, pairs, triples, X-Wing) and the score sums
the work.

The first attempt at this used "hardest technique required" and it didn't work:
sampled grids are bimodal, either falling to singles alone or running out of logic
entirely, with almost nothing between. Two of the four bands were unreachable.
Summing the work tracks how much hunting a solve takes, and that varies smoothly.

Weights were fitted against sampled grids. Over 3000 dates:

| difficulty | share | target | clues (min/med/max) |
| ---------- | ----- | ------ | ------------------- |
| easy       | 20.4% | 20%    | 36 / 39 / 42        |
| medium     | 39.3% | 40%    | 29 / 31 / 34        |
| hard       | 29.5% | 30%    | 26 / 28 / 30        |
| expert     | 10.8% | 10%    | 22 / 25 / 28        |

Mean generation 3.3 ms, worst case 234 ms, zero fallbacks, zero ambiguous grids.
Generation runs in a Web Worker, falling back to the main thread if the worker
won't start — the result is identical either way, which is rather the point.

**Retries are deterministic too.** Not every board lands in the band the date
asked for, so it tries again with a different seed and a different clue floor.
"Attempt 7 worked" is a fact about the date, not about when you ran it.

## versioning

`GENERATOR_VERSION` is baked into every seed string. Bump it and every puzzle in
history re-rolls, which is why golden fixtures exist: if `2026-09-11` ever stops
producing fingerprint `314dbf` without a version bump, determinism broke and the
test suite says so. Old links can pin the old generator with `?v=1`.

## routes

```
/                today
/2026-09-11      that date
/archive         calendar
/about           the explanation
```

History-API routing, so static hosts need a catch-all rewrite to `index.html`.
There's a `_redirects` for Netlify and Cloudflare; other hosts want their own
equivalent.

## the look

Amber-phosphor CRT terminal — pure black, one amber accent doing all the emphasis,
JetBrains Mono throughout with Press Start 2P reserved for titles. Glow instead of
shadow. The `>` prompt prefix on sidebar headings doubles as the collapse chevron.

Note that `spec.md` asked for a newspaper puzzle page (Cormorant Garamond, warm
paper, thin rules) and `ui_theme.md` asked for this. The theme file won.

Keyboard-complete: arrows move, digits fill, `N` toggles notes, `H` hints, `P`
pauses, `Ctrl+Z` undoes. Roving tabindex so you tab into the grid once instead of
81 times. Conflicts are marked with a corner tick as well as colour. Reduced
motion skips the boot sequence entirely.

## what's not here

No accounts, no sync, no leaderboards, no server. PWA support and the
date-derived visual themes from the spec are both skipped — the latter because a
per-date accent would fight the one-accent rule the style guide is built on.

## layout

```
src/
  core/board.ts          81 cells, units, peers, serialisation
  generator/             date → seed → grid → carved puzzle
  solver/                bitmask solver, solution counter, human-technique solver
  game/                  state, undo, persistence, timer, streaks
  ui/                    board, keypad, panels, calendar, modal
  workers/               generation off the main thread
  cli/                   the CLI above
tests/                   92 tests: golden RNG, fixtures, validity, a11y-adjacent
```
