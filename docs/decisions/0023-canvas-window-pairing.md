# 0023 · Complete Canvas pairing from the connection page

Date: 2026-10-20. Status: implemented with synthetic native-contract verification;
the actual application approval window and new UI remain unverified.

Creators previously had to invoke the CLI to pair. The connection page now offers
request, status and completion actions. It requests three read scopes by default;
asset transfer and browser handoff require an extra checkbox. It never requests
canvas write or run execute. The real Canvas window still approves the code and
scope subset. No pairing action is registered as an Agent tool, no approval is
sent by DSH, and there is no automatic creation, polling or paid call.

The Host reuses the reviewed CLI's exact instance handshake, requestAgentControl
and original secureStore functions. A separate schema-1 progress locator contains
only CLI/config/instance/pairing references, expiry and the handoff choice. It
contains neither the verification code, poll secret nor access token. Only the
authenticated connection UI receives the human verification code. Poll secrets
and session tokens remain in original native storage and Host memory.

Pending progress survives Host restart. Concurrent UI creation/completion calls
share a promise and the Host serializes operations. Completion waits for approval,
handles denial/expiry/issued status, saves through secureStore and verifies the
server session. Changed config/CLI/instance or replaced native pending records
fail before persistence. Another native pending request is not deliberately
adopted or overwritten. Native record replacement during either network wait is
checked again. The original store's cross-process read/modify/write operations
are not upgraded into a transaction by this adapter; no global lock is claimed.

An explicit native credential-file override is resolved to the same path for
Host and MCP. Only its path is forwarded, never tokens, provider secrets or the
file-credential opt-in. Without an override, the original store default remains.
Re-pairing updates the shared CLI login for that instance; the UI explains this.
Existing broader native grants are displayed as the server reports them.

Fifteen units and two C25 contracts cover the workflow using immutable original
Canvas auth/client/store modules from commit
`e6702dc7770bcbe7d4895be22a06f4c7123a085b`, with provenance hashes and its MIT
license. The auth factory and HTTP client execute over a real isolated loopback
server. Tests include missing approval, subset grants, denial, expiry, one-time
claim response loss, protection failure, Host close/config changes, duplicate
requests and foreign pending replacement during network waits. Default tests
inject an ephemeral test cipher; separate Windows tests execute original DPAPI
with synthetic secrets solely in system TEMP.

C25 also uses the published DSH Host, Remote codecs, MCP stdio and ToolRuntime.
A synthetic pairing saved by the Host is read by the actual MCP child through
the same overridden native file and Windows DPAPI, then authenticates one bounded
synthetic workspace GET. Provider credential reads remain zero, public outputs
contain no access token or poll secret, and the Agent still sees ten read/plan
tools. No actual user database, production key, real application approval or
provider was exercised. Source fixtures are test-only and excluded from the
plugin archive; original source content and license are checked.

Initial failures were a fixture-generated arrow-function object lacking
parentheses and a fixture route allowlist missing the connection status GET.
Both were corrected and their logs retained. Type errors were corrected before
verification. The full checks and final local installation are recorded after
the final build; earlier 195/196-test passes are historical checkpoints.

New visual controls, real installed app compatibility, trusted-window approval,
shared-store cross-process transactions and the paid two-approval/ledger flow
remain work. Browser policy refusal remains in force; no alternate UI surface
was used. No Canvas source, version, protected runtime or production installation
was changed in this increment. Private root files remain local only.

Final verification: `npm run check` passes 197 tests, build, types and private-file
guards. The two C25 tests also pass after strengthening the override to a relative
Host path, proving it is resolved consistently before the MCP working directory
changes. All temporary pairing/profile roots are removed.

The final 101-file local archive has SHA-256
`ad90f7626dd503c5d6f2cb6be11e6131883229e27f2629e058f07fa55be040b4`.
The official CLI installs it in a disposable profile and verifies entry bytes,
eighteen model routes, Flash default, disabled collectors, Host socket and cleanup.
The owned developer runtime was then stopped through its original terminal after
process/lease checks. Exit and port release preceded installation. The new entry
SHA-256 `575dcce0b10a6d3f81d0b813de0b615c2eab3f889e172701d1fdd3efbf2f4ce7`
matches through the public CLI. The development Host is live on its loopback
socket. The real source CLI still reports APP_NOT_RUNNING; no real pairing was
created, no user credential was tested and no browser was inspected.
