# Seedance capability inventory

The model/settings page provides a searchable inventory of the gateway's
[published documentation](https://api.seedance.nz/docs/llms.txt) and public
[music actions](https://api.seedance.nz/api/music/actions) and
[Midjourney actions](https://api.seedance.nz/api/midjourney/actions).
The reviewed snapshot contains 277 records across 17 application categories:
213 model records, 60 action records including default aliases, and four
operation records. These are inventory counts, not executable feature counts.

| Category | Planned owner | Current behavior |
| --- | --- | --- |
| Chat | DSH | 19 exact text routes, 16 declared image-input routes; local contracts, actual default Flash file-tool turn and one simple-image turn pass; broader models/UI remain unverified |
| Video, image, enhancement, motion, audio | Canvas | Documented models/protocol distinctions indexed; execution adapters remain |
| Suno, Flow Music/Lyria, Midjourney | Canvas | Distinct actions, billing SKUs, reference types, required fields, versions and synchronous exceptions indexed |
| MiniMax H3 V2 | Canvas | Exact case-sensitive model and separate V2 protocol recorded |
| Transcription, 3D, structured decisions | Canvas / DSH | Distinct synchronous/task protocols recorded; execution remains |
| Upload | Canvas | Recorded separately from generation; no upload is performed by the catalog |
| Wallet | Host | One real fixed HTTPS GET and production response parsing pass; no balance or account data is retained in evidence |
| Action registries | Host | Public read and differences verified on the real service |
| Task queries and settlement | Host | Eight fixed read protocols and terminal usage in the [task center](gateway-tasks.md); no job is submitted or retried |

The default remains `deepseek/deepseek-v4.1-flash`. All 19 chat routes currently
declare text input and a 4096 default response budget; 16 also declare image input
from explicit reviewed documentation. Models with documented
context capacities use those configured budgets; models without a known
capacity use 262144 conservatively. These configuration limits are not a claim
about each gateway model's maximum. Native conversation model selection can
use the configured catalog after a credential is supplied. C14 mounts the
published adapter and confirms that each exact id is offered and sent unchanged
to an isolated SSE fixture. C37 verifies native attachment bytes and image order
for all16 declared image routes. C60 verifies default-model image transport through
the actual AgentLoop. Separate real tests now include a normally completed
AgentLoop/Flash/file-tool turn (0058) and one default Flash image with randomly
ordered color blocks (0059). Other-model vision, general image quality, official
Desktop/browser entry, audio/video, reasoning, search and structured output remain
open. See [0037](decisions/0037-chat-image-inputs.md),
[0058](decisions/0058-published-agent-loop-validation.md) and
[0059](decisions/0059-default-flash-image-validation.md).

`zhen_capabilities` gives agents a bounded, paginated metadata search without
reading a credential or sending user data. It provides no arbitrary HTTP tool,
generation command or authorization. The complete source documents and their
instructions are not inserted into model context. A returned observed item
must be matched against an actual Canvas capability and its compatibility,
quote and approval contract before work can be executed.

The initial inventory preserves important distinctions: case-sensitive
`FlashVSR_video_upscale`, the legacy video task path for selected models,
image VOSR2 versus video VOSR2, `MiniMax-H3` versus the Hailuo/OW SKUs, and
Suno/Flow actions sharing paths while retaining separate model and billing SKU
fields. Registry `sync` is an observed fact, not permission to ignore a task
response variant. Required-field lists are not complete input schemas.

The Host checks these three fixed public sources daily unless disabled, and
shows added, removed and changed action identities. Checks are unauthenticated,
bounded, redirect-refusing and cancellable. Changes never rewrite the reviewed
catalog, active routing or tool permissions. Offline or malformed responses
leave the bundled catalog usable. The real service check matched all three
reviewed hashes and found no action differences on 2026-10-20.

To prepare a new inventory, use `scripts/seedance-catalog.mjs` with separately
captured public documentation/music/MJ input files and an output candidate
path. Review the resulting facts and protocol mappings before replacing
`catalog/seedance.v1.json`, the exact chat profiles and the source baseline.
The normal build checks schema, uniqueness, fixed source identities, the
reviewed document hash and catalog/profile model membership without network
access. It does not automatically turn future document text into tools.

The extraction scope is the documented model-list region, named protocol
sections, the chat header and the two public action registries. It is not a
complete schema extraction of every optional parameter or undocumented API.
The new inventory UI, native model menu after this expansion, and actual paid
conversations remain unverified while browser access is unavailable.

0062 adds actual default Flash output-limit and pre-text cancellation evidence, plus three
published AgentLoop loopback lifecycle regressions. The two low-budget requests report
16/128 output tokens with no visible text; a separate first-delta cancellation exits
aborted/user without a replacement request. Observed reasoning_content field presence
does not enable or certify reasoning switches/replay. No catalog/model/default changes;
see [0062](decisions/0062-default-stream-lifecycle.md).

0063 verifies actual default Flash structured reasoning_details replay across two
completed user turns and one tool execution in three final requests. C68 covers
three plain reasoning fields, structured native metadata and no-reasoning tool replies.
The earlier0062 field-presence observation remains narrower. Reasoning-effort controls,
other models and precise billing remain unverified; no model/default/config changes.
See [0063](decisions/0063-native-reasoning-replay.md).


[0109](decisions/0109-api-model-inventory.md) shares model extraction between the builder and Host monitor, including explicit declarations after the main inventory. Model changes are reported by identity and protocol; line movement alone is ignored. Observations never install executable routes. Gemini4Argon has one real simple-image request and a two-request scoped Agent/tool turn; general quality and all-model coverage remain unverified. MossImage stays documented-only until the Canvas contract is confirmed; see the [Canvas handoff](handoffs/canvas-agent-moss-image.md).

[0153](decisions/0153-capability-baselines-and-task-waits.md) reviews the new documentation hash06059b without changing the277 model/action/operation facts or19 chat routes. The diff adds singular-image-path and Retry-After guidance; the official MCP section already existed in the previous baseline. Stored source comparisons now carry an optional reviewed baseline hash. Matching newly reviewed bytes retire old notices; comparisons from another catalog are rechecked under the existing automatic preference. Disabling checks stays disabled, and reading a snapshot does not write or access the network. The interface counts configured routes from the actual catalog and distinguishes model changes from changed documentation whose model list is unchanged; optional parameters still require review. The task tracker now also honors Retry-After on successful pending responses. Final packaging,actual installation,user adoption and exact CI remain separate.
