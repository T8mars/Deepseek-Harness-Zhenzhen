# 0015 · MCP restart, re-download and retained program restoration

Date: 2026-10-20. Status: implemented and locally verified; new UI, actual
filesystem-server repair, multi-Host coordination and broader deployment remain unverified.

Previously a changed/missing registered program caused launch refusal, but the
normal installer refused to replace that existing version. The market now has a
deliberate maintenance path instead of asking users to delete program/data files.
The Host can restart a connection, re-download a registered root version or
restore a matching retained program. All use owned paths and public DSH plugin/
ToolRuntime lifecycle seams; upstream files/protocols remain unchanged.

Re-download holds the per-source operation lock, disables the connection and
cancels pending selection, then drains/disposes its runtime before replacement.
It verifies the same published root identity and installs with lifecycle hooks
disabled. Complete dependency-tree pinning remains. It does not promise the
same transitive resolution or generated install bytes; a new explicit trust
decision is required after maintenance even if the version string is unchanged.
The separate memory file/project binding survives, and new generations never
resurrect old session grants.

The old program/installation metadata are retained under a generated archive id.
Damaged bytes are preserved with an unverified marker, never treated as a good
rollback image. Restore rechecks the full original hash and keeps the replaced
program as another record. Linked destinations are refused before moves; no
project or memory-directory operation is part of replacement. In-process save
failure restores the prior layout. Pre-move records support discovery after
interruption while the connection remains off. This is not an OS backup service
or coordination with an unrelated Host using the same profile.

The owned market snapshot gains schema 2 and bounded archive records; the grant
SQLite schema stays 1. Native Windows paths use realpath spelling. The old test
that compared the unexpanded temporary alias now compares its native canonical
form, matching the actual project-path contract rather than a short-path prefix.
The new runtime status distinguishes download/maintenance from loaded state;
loaded still does not mean a continuous health check. The UI explains maintenance
effects before the operation and requires explicit re-enable afterward.

The full build/type/private check passes 106 serial tests. New tests exercise
metadata/storage failure, damaged/missing trees, a linked quarantine target,
retained-record discovery and restoration after an interrupted move. C18 runs
the actual published DSH MCP client/ToolRuntime against a synthetic SDK server,
proving calls drain before replacement, tool definitions unregister, old grants stay
revoked and restart produces a new server boot with the same data binding.

An additional real pinned `@modelcontextprotocol/server-memory@2026.8.31`
installation passed create/read, re-download, restore and read again with nine
tools on Node 22.19.0. The original full digest was restored and the synthetic
memory file stayed byte-identical. The freshly reinstalled tree had a different
digest with the same root SHA-512, supporting the decision to require renewed
trust. The script stopped all temporary programs and removed its owned data.
No real user document, model provider, paid request or installed Canvas was used.

Archive retention currently caps at 100 without automatic deletion. Signed
program catalogs/revocations, broader sources, automatic code activation and
complete deployment remain part of the original unfinished goal. No commit,
push, remote workflow, PR or production release occurred in this milestone.

The final 82-file local bundle has SHA-256
`b510c9c23ff5188175792caa3bac5894e45e22e15612a26c1fd37de140c709d5`.
The official CLI installed it in a disposable profile, resolved its expected
entry bytes and preserved all 18 text routes, the Flash default and disabled
collectors. The temporary Host listened, stopped and its owned directory was
cleaned. The existing development service/profile was retained. This does not
substitute for browser or real-model verification.
