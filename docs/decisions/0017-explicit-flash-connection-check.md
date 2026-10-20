# 0017 · Explicit, single-submit Flash connection check

Date: 2026-10-20. Status: implemented and locally verified; real gateway, new
browser control and production distribution remain unverified.

Saving a credential or reading a wallet could not establish that default chat
worked. The model/wallet page now prepares one fixed short Flash request and
asks the user to confirm its possible usage charge. The Host uses the public
`llm.prepareCall` seam and one-shot stream, capturing the adapter generation
before confirmation. No upstream file/protocol changed. The Remote accepts
a receipt UUID and exact policy value, never an arbitrary prompt, model, URL,
tool or credential parameter.

The request contains one constant message and a 32-token output request with
no session/history/tools. Preview expires after five minutes. A successful
SQLite claim precedes dispatch and can never become retryable. Duplicate
clicks read existing state. Foreign/lost Host claims remain untracked. A failed
completion save leaves the claim consumed. Credential changes invalidate
previews and request local cancellation. Cancel and the 45 s deadline do not
imply that provider processing or charges were reversed.

The separate metadata database uses schema 1, at most 100 receipts and ten-item
public history. Old terminal/expired metadata is pruned; unresolved claimed
rows are retained. Receipts contain no key, provider error text, model reply,
signed URL or user material. A normal nonempty text finish passes; truncated,
empty and oversized responses do not. Indexes, grants and conversation formats
are untouched. Historical success is not general gateway certification.

`npm run check` passes build/type checks, 122 tests and the private-file guard.
C19 uses actual DSH/Host/Remote/pi-ai loopback for wire parameters, preview
without key resolution, one request on error, cancellation, credential changes
and captured generations across registry replacement. Nine unit tests cover
concurrent confirmations, expiration, unknown owners, output bounds, claim/
completion storage failures, retention and actual synthetic-child termination/
database reopen. The child has no provider or user key. Public docs match the
reviewed SHA-256. No real credential or paid request was used.

This provides a live-check path once the user configures a local credential
and confirms in the interface. Canvas remains the creative-job owner. Actual
Canvas, paid transport, broader markets/signatures, new browser surfaces and
full delivery remain unfinished. No commit, push, PR, remote workflow or
production release occurred.

The final 84-file local bundle has SHA-256
`8dd93c5c44675142609089198b49148d4f4bd3095b6530c1b528c491d0f0b842`. The official CLI
installed it into a disposable profile; entry bytes, eighteen model routes,
Flash default, disabled collectors and Host socket checks passed. The temporary
Host stopped and owned data was removed. Two stale generated declarations
were removed from the owned build directory; TypeScript now skips declaration
emission on errors. Type checking passed again. The existing development Host
was retained, so its running code is not claimed to contain this new control.
