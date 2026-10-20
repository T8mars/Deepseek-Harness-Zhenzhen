# 0013 · Versioned Canvas planning through the existing control plane

Date: 2026-10-20. Status: implemented and locally tested; installed Canvas,
actual creative handlers, new browser surfaces and paid execution remain unverified.

The adapter advances beyond the original seven reads with three public entries:
`canvas_capability_tools`, `canvas_inspect` and `canvas_plan`. The existing Canvas
versioned controller already defines 39 high-level tools and 73 direct L0
operations. The adapter consumes that surface instead of creating another node,
model, Story or media execution layer. The eight existing canvas read/simulation
tools are also available with explicit project and canvas references.

Before planning, the reviewed local CLI surface is projected to the public
catalog, compared with the paired server and checked for known protocol/version,
hashes, operation policies and scope boundaries. Internal handler/service names
are not exposed. Only advertised plan/preview/inspect/verify operations with L0,
no approval and the reviewed read/preview scopes pass. Existing server scope
authorization remains authoritative; discovery does not grant new permissions.
Result identity, request scope, source digests, permission scope and declared
zero canvas/provider/file writes must match. Transport ambiguity has no alternate
route or automatic POST retry.

Initial implementation assumed every L0 operation required only canvas:read.
Source inspection disproved that: asset, run and browser previews have distinct
existing scopes. The final adapter preserves those exact reviewed scopes and
does not collapse them to a generic read grant. Browser handoff was inspected
as well: its helper returns an unexecuted, visible-host handoff and never opens
a browser itself. This work did not invoke any real browser handoff or bypass
the previously recorded browser access refusal.

The connection UI can read the cross-checked catalog and retains a configured
instance ID. The handoff skill is now immutable release 1.0.1 with concrete
discovery/planning instructions. Earlier installed releases and personal copies
remain under the existing market retention/update rules. A full-check failure
exposed a test fixture that assumed the first bundled skill would remain 1.0.0;
the identity/migration scenarios now use an explicit fixture version while
separate catalog verification still checks the actual shipped releases.

Reconnection also needed a real runtime fix: CommonJS caching could retain a
previous CLI's code after a changed closure was explicitly reviewed again.
Only cache entries within that selected CLI are evicted for a new digest; the
previous digest stays refused. The regression loads changed code after review.
No upstream or Canvas repository file, database, session format, credential
layout or generated file was changed.

C16 covers all 39/73 public facts through a synthetic CLI, all eight inspection
routes, no resubmission after timeout, wrong-result rejection, secret/URL
redaction, bounded inputs, real SDK and published DSH MCP/ToolRuntime stdio,
and the actual Host/Remote catalog method without model credentials. A separate
public-source check executes the immutable original policy helper with an inert
dispatch, confirming 73 L0 accepts and 123 non-direct refusals. This does not
exercise real creative handlers, installed Canvas or a paid provider.

Creation plans may replace earlier in-memory plans; they are not advertised as
fully idempotent. No apply/run/approval/paid submission endpoint is exposed, and
the unresolved Canvas paid-POST transport issue is unchanged. Real pairing,
creation results, safe paid execution, usable secure media/handoff transfer and
complete delivery remain work within the original goal.

The full build, type check, 85 serial tests and private-file guard pass. The
catalog UI reuses the reviewed theme colors, wraps long tool names and provides
a labelled focusable scroll list; actual browser layout/accessibility validation
remains pending. The new surface was not inspected through another browser or an
indirect UI path after the recorded policy refusal.

The final 82-file local bundle has SHA-256
`e57e8b7982b757a5a2c0392ffedafd7728c53f545171162b5a22bf146cc6e878`.
An official-CLI disposable installation resolved the expected entry bytes,
retained all 18 text routes and privacy defaults, and opened a temporary Host
socket. It was stopped and cleaned; the existing development profile was not
updated. No Git commit, push, PR, release or remote workflow was created.
