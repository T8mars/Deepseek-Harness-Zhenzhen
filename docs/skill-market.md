# Skill market and repository updates

The market includes fifteen original MIT instruction skills. Preview a skill,
install it, then use `/` in a new conversation or refresh the existing page.
Personal edits receive an independent identity and remain local.
Each selected release is identified by id, exact version and body hash, so
releases with identical instructions still retain separate version records.

The Host checks the fixed source
[T8mars/Deepseek-Harness-Zhenzhen](https://github.com/T8mars/Deepseek-Harness-Zhenzhen)
daily, unless disabled in the market. A manual check is also available. It reads
the main commit, then downloads `market/skills.v1.json` at that exact commit.
Anonymous reads carry no credentials, conversation content or local documents.
The repository is intentionally private until the owner decides to make it
public. An optional read credential in Updates supports this private phase;
public repositories continue to work anonymously. Authenticated reads use only
the fixed repository's GitHub API and commit-pinned contents endpoint, never a
raw-domain request or redirect. The native DSH credential service owns storage.
See [0031](decisions/0031-optional-private-github-reads.md).

`npm run build` generates the public feed from the closed `skills/<id>/` folders.
Each folder contains only SKILL.md and manifest.json. The feed includes complete
instruction packages with exact versions and SHA-256 bodies; it does not scan
other workspace documents. Publishing the reviewed feed to the designated
repository is a separate operation. The initial development checkpoint now
contains the feed in the private repository; this is not a stable product release.

Downloads become candidates. By default, the interface shows the current body
next to a candidate for review; selecting a changed version stages it for the
next Host start. The current provider keeps the previous body. Previously loaded
model context cannot be recalled; refresh or use a fresh conversation when needed.

An optional, initially disabled policy trusts this fixed publisher's standalone
text updates. Enabling it allows compatible newer releases for already installed,
enabled source skills to be scheduled without confirmation for every release.
Activation still waits for the next Host start. It never installs a new skill,
updates a personal fork, re-enables a disabled skill, approves a tool call or
expands permissions. The persisted policy is scoped to `first-party-text-v1`;
future program/resource/license/permission support needs a separate policy.

| Control | Effect |
|---|---|
| Daily checks/downloads | Controls future source reads; does not cancel an existing queue |
| Trust source text updates | Automatically schedules eligible releases; turning it off cancels only automatic selections |
| Fix this skill's selection | Pauses its automatic updates and cancels its automatic queue; manual choices remain |
| Skip this automatic update | Cancels that exact release, including repeated checks/restarts; a later release can still be eligible |

Manual selections take priority over an automatic queue. An explicitly reviewed
rollback pauses automatic updates for that skill until resumed, so the source
cannot immediately undo the user's choice. A candidate disappearing from a valid
new source feed cancels its automatic queue; installed/retained versions remain.
These controls do not force a restart or replace live instructions.

The owned schema-3 SQLite store preserves immutable version bytes, selections,
personal forks, policy and queue provenance. Migration defaults automatic trust
off and preserves previously reviewed manual pending choices. Old binaries that
only understand schema 2 must not be used to open this new store; retained skill
releases do not imply application/database downgrade support. Do not delete this
database as a cache reset.

The feed accepts only first-party `zhen-*` instruction packages for the pinned
host, with no dependency, program resource or permission declarations. It rejects
duplicate ids, invalid digests, changed same-version packages and version
rollback. Validation covers the whole feed before replacing candidates. Failed
checks preserve installed versions, valid downloaded candidates and personal forks.
Explicitly reviewed local rollback remains possible from retained versions.

For automatic scheduling, the cache must also match a SQLite record of the exact
catalog and commit actually fetched by the fixed-source reader. Rewriting a
cache's self-declared version/body hashes cannot authorize an update or become
the trusted rollback baseline. A legacy cache without this record needs one new
source check; builtins, installed versions, manual choices and personal forks
remain usable. A source commit advancing without changing release bytes updates
the queue's provenance rather than inventing another skill version.

Automatic queue writes are transactional. Startup rechecks the persisted policy,
enabled/pause/skip state, source receipt and complete stored package identity
before switching; a mismatch never substitutes unverified text. This receipt is
local fetch bookkeeping, not a publisher signature, and does not protect a whole
profile compromised at the operating-system user level.

Commit pinning and digests establish which bytes were fetched; they do not prove
authorship or instruction safety. This is not a signed executable marketplace.
Third-party public GitHub resource snapshots use a separate
[download and review provider](github-skills.md). Signed catalogs, dependency
installation and security revocations remain separate work. Existing local skills connect their original
reference/script/asset directories through the separate [local source provider](local-skills.md).
Curated executable MCP programs use a distinct
[program installer and project permission lifecycle](mcp-market.md).

C17 exercises the actual published
DSH SkillRegistry and Host/Remote policy methods across two Host lifetimes with
a synthetic fixed-source feed: old text stays live before restart, the new text
appears afterward, and personal content remains unchanged. Persistence, migration,
skip/pause/rollback, late-download opt-out, transaction failure and cache rewriting
are also covered. C33 additionally uses the published native credential provider
and Gateway with fresh TEMP storage: optional credentials survive Host restart,
reference updates abort pending reads, non-owner access is refused and model
credentials stay separate. Its HTTP responses are synthetic. A separate real
private-source read through the existing gh CLI matched all fifteen packages;
that does not prove the application's real Bearer transport or browser UI.
Removing the optional credential cancels old reads while retaining downloaded
content and independent activation preferences.
