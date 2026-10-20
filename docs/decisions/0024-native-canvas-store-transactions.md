# 0024 · Preserve Canvas auth progress across native writers

Date: 2026-10-20. Status: implemented and locally verified, unreleased. Actual
application/window and production deployment remain unverified.

The connection flow's native store could overwrite a different process's context
while protecting a credential. Seven regression cases against the original module
fail, including lost records, stale snapshot overwrite and missing conditional
deletion. The canonical Canvas workspace now serializes the complete read/modify/
write operation among participating native writers, preserving the v1 JSON shape
and DPAPI protection. Encryption stays outside the critical section. The update
reads fresh state and checks pairing identity after protection, before commit.

A complete owner receipt is atomically linked into a lock. Unique recovery claims
coordinate dead-owner removal, and entrants verify claims plus their own identity.
Live PIDs are never stolen based on age. Waits are bounded to two monotonic-clock
seconds. Known orphan candidates are removed by exact receipt identity. Candidate
files are fsynced before rename; malformed/link sidecars fail closed. Unsupported
hard-link filesystems never fall back to an unlocked write. This is cooperative
coordination, not protection against arbitrary direct file changes or legacy
unlocked writers. Crash/PID reuse/network-share/physical-disk limits stay explicit.

The public snapshot writer rejects outdated or untracked snapshots over existing
data. Pairing records cannot replace another live request; session commit checks
the claimed pairing atomically. Session/pending cleanup can specify the expected
identity. CLI auth cleanup now uses it, and Patch cleanup targets one approval ID.
Recipe signing initialization selects one shared identity across processes.

DSH passes its exact pairing identity when clearing denial/issued progress.
Original e670 CLI compatibility remains exercised. C26 adds an independently
hashed snapshot of the unreleased updated store/coordinator, clearly separate
from the original committed auth/client/store fixtures. Test-only native code
and license are excluded from the plugin archive.

Thirteen native concurrency/fault cases and the three prior store cases pass on
Node 22; four actual CLI command cases pass. Electron/Node 20's seven-file matrix
passes 42 tests, including installer/resource, recipe and capability checks.
Feature-sync remains current with 39 actions, 319 runtime entries and 84 accounted
nodes. Existing unrelated Canvas matrix failures remain recorded, not hidden.

C26's three checks cover snapshot identity, replacement during protection after
DSH's own checks have passed, and actual published Host/Remote/MCP stdio with
Windows DPAPI. The native conditional commit refuses the stale one-time token;
the new request remains. A new native session also authenticates an isolated
workspace GET from the child, and the original e670 reader reads the same v1 file.
No provider credential is read and no real application/window/paid call occurs.
All credential fixtures and test data are confined to system TEMP and removed.

Canvas data layout, version, protected runtimes, production installation and
published tags remain unchanged. Its source CLI fingerprint changes and must
be explicitly reviewed/pinned again; no automatic trust or activation is added.
The new DSH bundle and its local installation are recorded after final checks.

Final DSH verification passes 200 tests, build, types and private-file checks.
The 101-file archive SHA-256 is
9efdb69df3ef16074e5ef1ac5f8342a8282503c10d2b46325c18af2510d3e0a9.
Official CLI disposable installation verifies exact entry bytes, eighteen routes,
Flash default, disabled collectors, Host socket and cleanup. The owned developer
runtime was stopped through its original terminal after PID/lease checks; exit
and port release preceded replacement. Its installed entry SHA-256 is
c748c672c5e65cda4709b276c80abf5bfce3221940bcfa12fb6bf1ff3a3816e1,
verified through the public CLI.

The complete reviewed Canvas source CLI fingerprint is
fae0b706964edbebfc630853a66d32ec591dbb4dc05661f4bf22e86284cb1ec9.
It mounted ten tools through published ToolRuntime and returned APP_NOT_RUNNING
without provider credential reads. The plugin-owned config changed only after
comparing its expected old digest. No real pairing or provider call was created.
Both protected Canvas runtimes retain their expected hashes; worktree, context,
index/unmerged and diff checks pass. No commit, push, PR or public release occurred.
