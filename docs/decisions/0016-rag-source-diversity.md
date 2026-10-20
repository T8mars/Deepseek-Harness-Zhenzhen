# 0016 · Preserve distinct sources in keyword retrieval

Date: 2026-10-20. Status: implemented and locally verified with synthetic data.
Real-corpus relevance, new browser copy and broad performance remain unverified.

A reproduced query returned twelve excerpts from one repetitive long document
while four other matching files were hidden. The previous global BM25 window
allowed overlapping chunks from one source to consume every result position.

The owned KnowledgeStore now ranks authorized matches within each document,
then returns first excerpts across documents before second excerpts, up to the
existing twelve-hit limit. BM25 still orders each round. Scores are materialized
before the window calculation because SQLite FTS auxiliary functions cannot run
in that window context; intermediate rows omit excerpt text. Project/collection/
provider/Agent consent filtering remains inside the initial query. Unauthorized
matches cannot consume positions. Source line numbers and verbatim excerpts,
the public hit shape and SQLite schema 2 remain unchanged; no reindex is needed.

This favors source coverage over multiple highly ranked chunks from one file.
Documents imported into multiple collections remain distinct; cross-collection
deduplication is not claimed. Query behavior is still an all-keywords lexical
intersection, not semantic question answering. The form and Agent parameter
description now explain how to supply spaced keywords.

`npm run check` passed build, type checking, 108 serial tests and the private-file
guard. A deterministic, invented 12-document corpus passes 21 keyword cases.
The evaluation runs the prior SQL only for its explicit single-term diagnostic,
against the same database: the five relevant files have document recall 1/5
with the old window and 5/5 with the new ordering. These small, curated cases
do not establish a general retrieval score. C11 also exercises the published
DSH ToolRuntime, exact project/collection consent, diverse sources, validated
citations and revoked historical access. No model provider is invoked.

`node scripts/evaluate-rag.mjs` writes bounded synthetic evidence under the
ignored runtime directory and removes its owned temporary corpus/database.
Existing user indexes, grants, data and running development Host are retained.
No upstream source, Canvas project, credential, paid endpoint, commit, push,
remote workflow or public release was involved. The two existing imagegen
character assets and separate art package remain available; no duplicate
generation or replacement was necessary in this milestone.

The final local bundle contains 82 files, SHA-256
`4e4e09bb6b18ecc1257d7d874a04f181a371880f4121c4cfdc707f485c47617a`. The official CLI
installed it into a fresh disposable profile; entry digest, 18 model routes,
Flash default, disabled collectors and Host socket passed. The temporary Host
was stopped and its owned directory removed. No browser rendering or paid
model request was tested; the running development profile was not upgraded.
