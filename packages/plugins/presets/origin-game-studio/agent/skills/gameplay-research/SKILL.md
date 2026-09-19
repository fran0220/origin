---
name: gameplay-research
description: Using the origin-game-knowledge service for direction and tuning — the depth ladder, the genre card's system profile and conventions, concept norms as tuning starting points, procedures and formulas as reference, and how research lands in the graph.
---

Gameplay research is evidence about named games, retrieved with provenance.
This skill keeps a corpus fact from silently becoming a design rule, and a
norm from silently becoming this game's number.

## The service and its four tools

`origin-game-knowledge` is the public, credential-free MCP service at
`https://knowledge.origingame.dev/mcp`; it is not a gateway `/v1` route.
Selection in `the plugin-declared origin-game-knowledge MCP server` is not availability: discover the mounted
tools and read their descriptors before planning a call, and report an absent
or erroring service as such instead of describing a search that did not run.
Do not invent tool names, filters or fields. The current surface:

- `gameplay_search` — `query`, optional `focus` (`gameplay`, `core_loop`,
  `system_module`, `tuning`, `table`, `design_note`, `procedure`, `formula`,
  `convention`), optional `genre`, `limit` ≤ 10. Every hit states `depth` and
  a section `path` inside the record.
- `gameplay_get` — one complete record by id, title or alias, exactly as
  returned by a search; a recalled title is a guess until it resolves.
- `genre_browse` — no argument lists the genres; a knowledge genre id or one
  of the Project's card ids (`platformer`, `top-down-action`,
  `first-person-exploration`, `racing`, `puzzle-board`, `card-deck`,
  `tower-defense`, `survival-crafting`) returns the games, the derived
  `systemProfile` and the genre's `conventions`.
- `concept_compare` — no argument lists the concept axes and ids; a concept
  with an optional `genre` returns every game's value and `norms`.

Every answer carries `catalogRevision`. Keep it with anything you take from
the answer; a citation without it cannot be re-read later.

## The depth ladder

`depth` says what an answer licenses:

- `index` identifies a game — title, genre, summary, tags. It is a lead to
  search further, never a sourced fact about how the game plays.
- `sourced` carries constants, tables, procedures and design notes extracted
  from cited documentation. It is evidence about that game, to be inspected
  for applicability; it is not proof that this game should behave the same.
- `verified-code` cites pinned source code. Its `sources` entries of kind
  `source-code` keep `url` and `title` in the served bundle because the
  citation is what you open; its procedures and formulas were read from
  those pinned files.

A record's `summary` and `gameplay` exist at every depth; its `tuning`,
`tables`, `procedures`, `formulas` and `designNotes` are empty at `index`.
Say which tier a claim came from when you write it down.

## Start from the card

Before direction work, browse the Project's genre card. For a card that maps
to more than one knowledge genre (`top-down-action`,
`first-person-exploration`, `puzzle-board`), the listing's `games` merge all
of them but `systemProfile` and `conventions` are the first mapped genre's;
browse each `mappedGenres` id separately for its own profile.

- `systemProfile.occurrence` counts how many sourced games in the genre carry
  each system concept; `dependsOn` counts the edges between them. Together
  they say which systems the genre's games actually build and in what order
  they feed each other — a checklist of seams to decide on, not a list to
  implement.
- `conventions` are corpus-derived claims about named games. Each has
  `holds` (the sourced games it is true of), `exceptions` (sourced games it
  is not) and `evidence` (`gameId` + `ref`, a system, tuning or procedure id
  inside that game's record, opened with `gameplay_get`). A convention is a
  question this game must answer, not advice it must follow: read the
  exceptions as carefully as the holds, decide, and record the decision with
  the convention's path. `gameplay_search` with `focus: convention` finds
  conventions by wording.

## Numbers: norms are starting points

`concept_compare` returns `norms` as one entry per unit the concept is stated
in — `n`, `min`, `median`, `max`, `unit` — overall and, when a `genre` is
given, for that genre. Entries in different units are never pooled, and
neither may you: a duration norm in seconds and one in frames are two facts.
A constant whose `quantity` is `null` is one the parser could not read as a
single number (a range, a list, an expression, a word number); read its
`value` as stated instead of treating it as missing.

When a norm seeds a tunable in `src/tuning.ts`, write the provenance beside
the value: concept id, genre, the norm you chose (`n`/median or the specific
game's value), and `catalogRevision`. Prefer the genre norm when its `n` is
large enough to mean something and the overall norm otherwise; prefer one
named game's value when the chosen direction is explicitly that game's feel
and say so. The seeded value is where live tuning starts, not where it ends:
the dial, the comparison and the person's judgement replace it, and a value
that moved is written back to source and checkpointed as the substrate skills
require. A norm never overrides a measured result.

## Mechanics: procedures and formulas are reference

`procedures` (ordered steps with what each does and reads) and `formulas`
(an expression with its variables) describe how a named game resolves a
mechanic; `tables` hold its structured rows. On a `verified-code` record they
were read from the pinned files the record's citations name. All of it is reference
only: read it, compare it to this game's camera, controls, progression and
scope, and write this game's version fresh against its own seams and
`src/tuning.ts`. Nothing from a knowledge answer is copied into the project
tree — code retrieval and vendoring are the `recipe-craft` skill's ladder,
and a knowledge record is never on it.

`designNotes` are attributed statements by the game's developers about why
a system is the way it is. Cite the note with its game; do not generalise it
into a rule for this project without the project's own evidence.

## Where research lands

Put the decision and its references in the design graph, never in a parallel
research plan. A knowledge citation is a node `references` entry whose
`source.location` is the record's `id` with the section `path` a search
returned (`/tuning/<id>`, `/procedures/<id>`, `/conventions/<genre>/<id>`)
and whose `source.revision` is the `catalogRevision`; its `purpose` says what
the node takes from it. Read `read_design_schema` for the exact reference
contract before writing one.

A knowledge-derived attempt that the stage refuted goes to
`docs/experiments.md` with the citation, the observation and the reason.
A rule that then held for this project across milestones is what the
ordinary refinement write distils into the Space ledger, if the person or the
agent chooses to; research itself writes nothing to the ledger and starts no
pass.

## What this is not

Research is not a code library, an asset catalog or a design authority.
`origin-examples` supplies vendorable modules and `origin-assets` supplies
binary art, each through its own tools and disciplines. A shallow answer, an
`index`-only genre or a concept with no norm in this genre is a finding to
report, not a gap to fill from memory.
