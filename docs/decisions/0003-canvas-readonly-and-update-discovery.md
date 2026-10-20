# 0003 · Canvas read-only adapter and update discovery

Date: 2026-10-20. Status: implemented and locally tested; live Canvas and remote
GitHub workflow execution remain unverified.

The Canvas MCP uses an explicitly selected, already installed zcanvas-cli. Its
complete local file closure is fingerprinted, including resources. Changed
files require reconnection. Discovery, exact compatibility checks, loopback
transport and secureStore come from the existing CLI. The status tool returns
the server's compat field unchanged. Business reads pass through selectInstance
before using the existing paired session; no environment token or raw settings
endpoint is used.

Seven tools expose status, capabilities, workspaces, models, capability graph,
run intent lookup and creator-session lookup. Server initialization and tool
listing do not pair, launch Canvas, or submit work. No paid submission tool is
exposed while the previously identified ambiguous POST retry path is unresolved.
The tool result boundary removes credential fields and signed URL parameters;
transport exceptions become bounded diagnostics.

Validation includes an actual SDK stdio client, the published DSH MCP client
and ToolRuntime registering/disposal of all seven tools, compatibility report
preservation, closure drift refusal and an isolated CLI fixture. These are
not an installed Canvas integration or a paid-generation test. The connection
page rendered in the actual DSH Web runtime without a real Canvas connection.

The update monitor checks four fixed public sources, once daily when enabled:
npm next for DSH, a commit-pinned Canvas package manifest, DSH-zhen releases,
and Seedance llms.txt SHA-256. It sends no credentials or user content. Real
checks matched the current DSH, Canvas and gateway baseline; the configured
DSH-zhen releases API returned 404 and is displayed as unavailable.

The scheduled workflow records immutable candidate metadata and opens a
deduplicated PR in the configured downstream repository. Failed feeds retain
their previous candidates. The workflow has not been pushed or activated.
Dependency preparation, canary promotion, signed package distribution and
application activation are still separate required work. No upstream branch
is merged and no running application is automatically replaced.

Actions checkout/setup-node refs were resolved from their official repositories
and pinned to full commits. The write-permission job runs only from schedule
or manual dispatch in the configured repository, never from a fork PR event.
