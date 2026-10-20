# 0004 · Workspace retrieval and persistent permission checks

Date: 2026-10-20. Status: keyword retrieval implemented; live model interaction,
larger retrieval evaluation and optional vector/document parsing remain.

An explicit binding maps one knowledge space to one canonical session working
directory. A collection separately authorizes local indexing, manual Seedance
citations and automatic agent retrieval. Existing manual-citation permission
does not enable the new automatic permission. Both are off by default.

The published ToolRuntime exposes zhen_rag_search. Its execution reads the
actual Agent session, provider and WorkingDirectory service, never model-supplied
project ids. It filters project, enabled state, provider and automatic permission
before the recall limit. Results include relative file paths, lines and epochs.
The current strategy is Unicode keyword/Chinese bigram matching, not semantic
vector retrieval. Mixed Latin/Chinese boundaries are indexed consistently.

The DSH-zhen database schema 2 adds bindings, monotonic binding revisions and
session grant metadata. It does not modify upstream session storage. Every
model request for a session that used agent retrieval passes a published
llm/stream guard. The guard rechecks provider, directory, collection access and
epochs before calling the adapter. Changed permissions, reindexing or binding
changes block that session's next request. A new clean conversation is needed;
re-enabling a collection does not silently validate old references.

Only identifiers and permission versions are stored in the grant table, not a
copy of the conversation. Authorization metadata must be retained when derived
search indexes are rebuilt. This cannot recall already-sent content or control
manual clipboard copies; the interface distinguishes those cases.

Validation uses synthetic data: exact workspace isolation, manual versus agent
consent, unauthorized documents filtered before top-k, persistent stale grants,
and remove/recreate binding behavior. A real published LlmRuntime with an
isolated adapter confirmed that denied requests never reached the adapter.
The published tool execution pipeline validated canonical result schemas.
The browser confirmed binding, separate checkboxes, and revocation clearing both
permissions. No real API credential, provider request or user document was used.
