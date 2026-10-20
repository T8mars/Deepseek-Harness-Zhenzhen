# Seedance chat compatibility

Baseline contracts checked on 2026-10-20 against published DSH / llm-pi-ai
0.2.1-rc.2 and Node 22.19.0 on Windows use example credentials and loopback.
The live wallet verification is recorded in [0036](decisions/0036-seedance-credential-events.md).
[0037](decisions/0037-chat-image-inputs.md) records one separately authorized real Flash
stream: fixed text, max_tokens 32, one request, normal completion, reported usage
41 input / 11 output tokens. No reply text or credential is retained. This is an
isolated production-service/runtime check, not a browser or full Agent-loop test.

Current narrow live evidence, using the same pinned published SDK:

- [0063](decisions/0063-native-reasoning-replay.md): the actual default Flash uses native reasoning_details across two completed user turns and a single tool execution. Three final real requests preserve native structured replay and canonical tool results; include_usage=true is accepted. Three earlier one-request verifiers were incomplete due to overstrict assumptions and remain recorded. C68 separately covers three plain-field variants, structured opaque metadata and legal tool-only replies. No reasoning controls/config changes or other-model/billing/UI claim.

- [0062](decisions/0062-default-stream-lifecycle.md): two real default Flash requests with max_tokens16/128 end as max-tokens before visible text. A separate request is cancelled on its first actual SSE delta, before a terminal frame or visible text; Agent ends aborted/user with no replacement request. Backend stop/refund and live cancellation after visible text are unverified. C67 covers complete AgentLoop limit, post-text cancel and pre-text cancel over loopback.

- [0058](decisions/0058-published-agent-loop-validation.md): an actual AgentLoop/default-model/file-tool turn completes normally in two real Flash requests; a separate Native L0 plan-to-card test is intentionally cancelled after planning.
- [0059](decisions/0059-default-flash-image-validation.md): one real default Flash request through the actual AgentLoop and durable attachment store correctly identifies the left-to-right order of three randomly selected color blocks. The inline image matches the native projection; max_tokens is256 and the turn completes normally. This is a simple synthetic-image check, not general vision quality, other-model, browser or Desktop proof.

The complete bundle config selects provider `seedance`, model
`deepseek/deepseek-v4.1-flash`, OpenAI Chat Completions and the Host credential
reference `SEEDANCE_API_KEY`. The gateway's [chat documentation](https://api.seedance.nz/docs/llms.txt)
uses `max_tokens`. The generic adapter otherwise chooses
`max_completion_tokens` for this custom provider. Its public compatibility
setting now explicitly chooses `max_tokens`; this changes our bundle only.

The reviewed catalog now configures all 18 documented chat ids as text routes;
the Flash default remains unchanged. C14 verifies native adapter discovery and
an exact-id local SSE request for each route. Configured output/context budgets
do not establish gateway limits. See [capability coverage](seedance-capabilities.md)
for the distinction between model records, observed media actions and execution.

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| `node --test contracts/seedance-stream.test.mjs`: the actual published adapter sends the full model id to loopback `/v1/chat/completions`, streams Chinese text and preserves synthetic usage 7 input / 2 output / 9 total | Gateway SSE field variation, error payloads and actual token accounting | Other-model/full UI conversations and precise billing; actual default-model file/image turns are separately recorded above |
| Fragmented tool arguments/ToolRuntime loopback; 0058 actual published AgentLoop performs a real TEMP file read, sends its canonical tool result to Flash and completes normally | Broader tools, free-form turns and official Desktop entry | Media generation, browser uploads or paid Native tool execution |
| Missing/revoked named credentials make no HTTP request; synthetic values pass through `ctx.credentials` | Live credential rotation and broader account scope | Credential-file layout is never depended on; real fixed wallet/Flash reads are separate checks |
| Synthetic 401 → AUTH, 402 → PI_AI_ERROR, 429 → RATE_LIMIT, 500 → SERVER; each sends one request | Distinct 402 / quota reporting through a future supported adapter seam | Precise insufficient-balance classification |
| C67 actual AgentLoop preserves received text on loopback cancel, exits pre-text waiting and ends max-tokens without continuation; real0062 pre-text cancellation ends aborted/user with one request | Live cancellation after visible text, service-side cancellation and broader real streaming failures | Cancellation refunds, server billing cessation or recovery of accepted paid jobs |

The pinned adapter classifies provider error text and does not retain structured
HTTP status in these failure events. A generic error must not be represented as
verified insufficient balance. The wallet remains a separate explicit Host read.

The local watchdog test uses 150 ms; production retains the configured 120 s
request and idle limits. The adapter and route use no automatic retry. These
checks do not establish gateway idempotency or permit retrying paid tools.
Fifteen explicitly documented routes now declare text and image input. C37 uses
the published durable attachment store and adapter against loopback SSE, comparing
the actual ordered inline bytes with native request projections. The three other
routes retain native text placeholders. C60 additionally verifies that the actual
AgentLoop preserves a default-model image through the adapter wire. Decision0059
records one real simple-image result. Browser uploads, other-model vision and
general visual quality remain unverified. Default native reasoning replay is separately
verified in0063. Audio/video inputs, reasoning-effort controls, other-model replay,
structured output and cache pricing remain disabled or unverified. The historical0037 fixed
connection check remains text-only; it is separate from0058/0059.

## Explicit short connection check

After installing the current bundle and restarting the Host, the model/wallet
page offers a fixed Flash check. Previewing shows the constant message and
prepares the current `seedance` adapter generation without a model request.
The user must separately confirm the request and possible usage charge. It
requests `max_tokens: 32`, including reasoning use when the provider counts
reasoning in that budget. No exact monetary quote is made.

The request uses the configured Seedance route and exact Flash model. If you
changed that route's connection settings, the check uses those settings. It
carries no conversation, RAG result, attachment or tool declaration. It is not
an Agent tool or an automatic startup/CI request. One five-minute receipt can
dispatch once. Duplicate confirmation, failure, lost responses, cancellation
and process restart never make that receipt retryable. A new receipt is a new
independent check requiring another explicit confirmation.

A durable Host claim precedes dispatch. Receipts store fixed request facts,
timestamps, safe status codes and token counts, never the reply or provider
error payload. The separate owned SQLite schema is 1. History returns ten
receipts; at most 100 are retained, with old completed/expired metadata pruned.
Unresolved claimed records are not silently discarded to bypass that cap.
Other-Host/interrupted claims display as untracked, without asserting that
processing stopped. Cancel requests stop local reading and promise no refund.

A passed receipt establishes only that one short text stream ended normally.
Empty/truncated responses remain incomplete. Tools, images, cache pricing,
other models and creative jobs need separate checks. Historical success does
not certify the current key or change `status.gatewayVerified`.

C19 uses the actual prepared-call API, Host/Remote and pi-ai against loopback:
preview resolves no credential value; wire parameters are fixed; errors send
once; cancellation closes the connection; registry replacement after preview
retains the captured generation. Unit tests terminate an owned synthetic child,
reopen its database and refuse to replay the claim. Storage failures prove a
successful claim must precede dispatch, and a failed completion write never
authorizes replay. Full checks pass 122 tests. These are local contracts, not
live gateway/browser verification. Public docs still match the reviewed hash.

Native reasoning replay may use a plain signed field or structured reasoning_details.
Preserve the native adapter state; do not coerce one representation to another or reject
a valid tool response without thinking. C68 verifies these paths through the published
AgentLoop. TokenUsage separates non-cache input from cacheReadTokens/cacheWriteTokens;
its partial counters alone do not establish billing. See0063.
