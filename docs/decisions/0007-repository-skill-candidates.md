# 0007 · Repository instruction candidates

Date: 2026-10-20. Status: first-party candidate downloads and review UI implemented;
publication and a successful live feed remain unverified.

The Host downloads the instruction-only feed from the designated repository,
using a discovered main commit followed by a fixed raw URL at that commit.
Requests are unauthenticated, redirect-refusing, time-bounded and size-bounded.
There is no arbitrary source URL, shell command, zip extraction or program install.
Daily checks can be disabled independently of application update checks.

The market validates all candidates before replacement. A same-version content
or manifest change and a numeric version rollback are refused. Installed and
pending versions provide additional rollback anchors. Cache failure preserves
the offline bundled catalog; source failure preserves the last validated cache.
Candidate discovery does not invalidate or mutate active SkillProvider bodies.
Reviewed selection still uses the existing next-Host-start activation boundary.

Synthetic tests cover commit pinning, offline cache/restart, personal versions,
all-or-nothing rejection, tampering, rollback, unsupported resources/permissions,
concurrent checks, persistent opt-out, oversized replies and cancellation.
The actual Web runtime displayed a source failure while retaining 15 browsable
skills and the installed skill. Disabling automatic checks survived reload;
the setting was restored afterward. Light/dark and 390px layouts were observed.

A transient full-suite run reported a Node path containing a null byte, a Git
subprocess failure and an MCP child startup failure. The affected tests and the
subsequent complete 56-test check passed; the transient cause is not established.
This observation is retained rather than described as a diagnosed product bug.

Public feed publication, positive live update display, executable MCP packages,
signed release promotion and task-aware automatic activation are not established
by these tests. See skill-market.md for the supported workflow.
