# 0018 · Connect local skills with their original resources

Date: 2026-10-20. Status: implemented and locally verified; new browser controls
and complete real-user creative workflows remain unverified.

The immutable first-party market accepted only standalone MIT instruction text.
That could not connect existing creative skills with relative reference files,
scripts or assets. A separate local-directory provider now supports one skill
folder or a one-level skill library. It reads only bounded SKILL.md definitions
and exposes the original directory through the public resourceBase seam. No
source file is copied, relicensed, executed or added to a release package.

The Host previews definitions and requires explicit `local-directory-v1` trust
bound to the scanned instruction list. This is intentionally trust in a mutable
local source: subsequent edits and new library children affect future loads.
File-state polling invalidates the public registry cache. Previously loaded
conversation instructions are not recalled. The UI supports search, previews,
manual/model invocation flags, duplicate indicators, disable and disconnect.

Own schema-1 JSON stores canonical roots, BigInt-derived directory identity,
mode, trust time and enabled state. A replaced root needs fresh confirmation.
Symlinked definition entries are refused; reads have UTF-8/byte/frontmatter
limits. Stale candidates and changes during an asynchronous read do not return
old definitions. Duplicate local names retain the earlier connected source;
rank 350 leaves project/runtime precedence to the upstream registry. Resource
execution still relies on ordinary tools and their permissions; resourceBase
is not a filesystem sandbox or tool-permission grant.

The first-party SQLite store stays schema 3. Its remote text update policy,
immutable retained versions and personal forks are independent. Local folder
following does not authorize executable remote package updates or implement a
GitHub fetcher; a connected Git checkout reflects changes once Git updates it.

`npm run check` passes build/type checks, 134 tests and the private-file guard.
Eight unit tests cover source preservation, mutable updates, stale candidates,
invocation formats, UTF-8/YAML, links, replaced roots, asynchronous disable,
duplicates and reopen. C20 uses actual published Host/SkillRegistry/ToolRuntime
and the exact locked native skill loader. It verifies resource-directory
rendering, a real reference read, model invocation refusal for manual skills,
disable, zero credential reads and cache invalidation for edits/new children.
Malformed definitions remain watched so in-place repairs appear again. A
configuration change during discovery returns an incomplete observation; an
authoritative empty catalog cannot be cached from that race.
No model, real user material, attached script or paid provider was invoked.

Third-party GitHub catalogs/downloads, signed/revoked packages, dependency
installation, actual Canvas/paid transport and broader delivery remain work.
No upstream source, credential layout or session format changed. No commit,
push, remote workflow, PR or public release occurred in this milestone.

The final 87-file local bundle has SHA-256
`571cd8a9fa772b64cd13aa7883e2cb21ce6ee0dc79080ca83ee53274635680e8`. The official CLI
installed it into a disposable profile; expected entry bytes, eighteen chat
routes, Flash default, disabled collectors and Host socket passed. The temporary
Host stopped and its owned directory was removed. The existing development
service was retained; new browser controls were not inspected.
