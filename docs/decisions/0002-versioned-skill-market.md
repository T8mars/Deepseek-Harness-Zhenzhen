# 0002 · Versioned instruction market

Date: 2026-10-20. Status: local market implemented; remote updates remain in development.

The first catalog contains fifteen original MIT instruction skills. Each item is
a single SKILL.md with a sidecar manifest: exact version, host baseline, source,
license, SHA-256 and empty dependency/permission declarations. This release
rejects bundled executables and dependency-bearing packages instead of implying
that instruction metadata grants tool permissions.

The Host owns a separate immutable SQLite version store. First installation is
explicit after a body preview. Selecting another retained version schedules it
for the next Host start. The running provider retains its original body and
rejects stale locators. Disabling a skill immediately rejects future loads and
cancels the pending selection. Personal edits get an independent identity.
No session storage or upstream skill directories are modified.

The provider uses the published SkillRegistry extension and invalidation API.
Both an isolated real registry and the actual DSH-zhen service registration were
tested. In the Web runtime, search, preview and install worked. After a page
refresh, `/zhen-shot-list` appeared in the original slash menu. The upstream
ui-skill client caches per-session catalogs and does not subscribe to
skills/change. The market therefore explains the cache and offers a page
refresh, rather than fabricating a plugin-manager change event.

Automatic remote discovery, dependency packages and signed distribution have
not been established by these checks. Instruction digests prove integrity,
not authorship or semantic safety. Live model invocation was not exercised.
