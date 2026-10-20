# 0010 · Curated MCP programs and staged updates

Date: 2026-10-20. Status: implemented and locally tested; browser validation,
wider sources and signed automatic activation remain pending.

Program installation belongs to DSH-zhen's own Host package. The public DSH MCP
client is composed after explicit trust of one exact, retained installation.
No upstream files, sessions, credential layouts or profile internals change.
Two fixed source recipes provide memory and filesystem servers. Both pin a
published version, registry SHA-512 and source license commit. The installer
uses an owned pinned manager without hooks, validates the lock, fingerprints the
whole installed tree and retains source notices. Downloads remain inactive.

Enabled sources can prepare compatible candidates automatically during daily
checks. A reviewed different version becomes pending until Host restart. The
previous program and its data are retained. Disable immediately blocks new
calls, cancels pending activation and waits for already dispatched work to
finish before disposing its MCP connection. Mutations are not presented as
reversible by disabling a connection.

The public ToolRuntime final guard and around-execute seam enforce exact project
binding for tool calls and the three shared MCP resource tools. A per-connection
queue serializes reference-server operations. Persistent connection generations
also protect later LLM requests containing prior MCP results; reenabling a
connection does not resurrect a revoked session grant. Only generation metadata
is added in the plugin's own SQLite store.

The published MCP client's inherited environment requires an owned relay to
start the actual third-party child with a small environment. Credential-like
and unrelated application variables do not cross that boundary. This reduces
accidental exposure and is not claimed as an OS sandbox.

Live local checks installed both actual `2026.8.31` packages, retained their
complete source license, and exercised synthetic graph/file operations through
SDK stdio. Windows short-path/case prefix failures were observed first; native
realpath and preserved directory spelling passed the subsequent check, including
an outside-root refusal. Program hashes/dependency counts and the final evidence
are retained locally. The new C13 contract tests real DSH composition using a
synthetic MCP program. The full serial check has 64 passing tests.

Parallel Node 22.19.0 test processes intermittently failed in the module loader
before assertions, with an invalid URL or null byte in a Zod path. Failure logs
were retained; root cause is not established. The test command now serializes
test files and the complete run passes. Within-test concurrent tool calls remain
covered. This is a test execution mitigation, not a diagnosed runtime fix.

No new market UI browser verification was attempted after the existing browser
security-policy refusal. The earlier character generation remains valid and
separate; neither that artwork nor private root work documents enter this code
bundle. No commit, push, remote workflow activation or release occurred.
