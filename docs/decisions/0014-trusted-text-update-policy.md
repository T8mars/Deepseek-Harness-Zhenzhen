# 0014 · User-selected automatic scheduling for trusted text skills

Date: 2026-10-20. Status: implemented and locally verified; new browser controls,
positive live publication, publisher signatures and revocations remain unverified.

The previous market downloaded candidates but required individual review for
every release. The new optional source policy implements the researched rule
that a user's chosen update class should not require repeated confirmation.
Default behavior remains manual review. Opting in trusts only the fixed
first-party repository's compatible, standalone MIT text instructions with no
resources, dependencies or permissions. The policy scope is explicitly
`first-party-text-v1`; executable MCP/plugins remain outside it.

Only already installed, enabled source skills are eligible. New skills and
personal forks are never installed or changed by automation. Automatic versions
are staged while the current provider continues to serve the old text, then
activated at the next Host start. There is no forced restart, active-session
rewrite or tool approval. Manual pending choices win. Turning the source policy
off cancels automatic queues only; per-skill pause, exact-release skip and
explicit rollback preserve the user's choice across later checks and restarts.

The owned store moves from schema 2 to 3, preserving package bytes and manual
selections and defaulting automatic trust off. It records the policy, queue mode,
source revision, pauses/skips and fetched-catalog receipts. Complete package
identity is rechecked at read/activation time. Transactions prevent a later
queue-write failure from leaving earlier skills partially queued. An old binary
must refuse this newer schema rather than silently reinterpret automatic rows.

A cache's self-declared commit and body digests are insufficient evidence for
automatic scheduling. The fixed unauthenticated public reader records the exact
validated catalog/commit in SQLite after a successful pinned-source read.
Unmatched or legacy caches are not offered as the trusted rollback baseline;
they require a fresh check while installed, builtin and personal versions stay.
This prevents edited cache metadata from poisoning a genuine subsequent feed.
The receipt is local provenance bookkeeping, not an author signature or an OS
security boundary. Whole-profile compromise and signed revocation remain outside
this implementation's claims.

The UI distinguishes daily downloads, trusted-source scheduling, per-skill fixed
choices, automatic/manual pending releases and skipped updates. It displays the
pending source commit and refreshes authoritative state even when an action
reports failure. No permission grant is inferred from an instruction manifest.

The full build/type/private check passes 97 serial tests. C17 uses the actual
published DSH SkillRegistry, owned Host and strict Remote codecs across two Host
lifetimes: the old body remains before restart, the selected new body is served
afterward, personal text stays unchanged and no model credential is read.
Additional tests cover migration, default-off trust, independent daily opt-out,
disabled/new skills, manual priority, skip/pause/rollback, withdrawn candidates,
late-download opt-out, a real SQLite failure trigger, cache editing and stored
package mismatch. A Windows test cleanup hook ordering issue was corrected and
its owned temporary directory removed; it did not involve user data.

No upstream/session/credential/profile format was modified. A real source feed
has not been published, the new settings have not been browser-inspected under
the recorded access refusal, and no paid call, commit, push, PR or release ran.
The full original application goal remains unfinished and active.

The final local 82-file archive has SHA-256
`f40a95cae47cb892eafae5dd82b1d2355add2c0146ccdf087bf2129ee86b466a`.
An official-CLI disposable install resolved its expected entry bytes, kept the
18 text routes/Flash default and designated privacy flags, and opened a temporary
Host socket before shutdown/cleanup. The existing development Host was retained.
This is installation/startup evidence, not browser or real paid verification.
