# Seedance capability inventory

The model/settings page provides a searchable inventory of the gateway's
[published documentation](https://api.seedance.nz/docs/llms.txt) and public
[music actions](https://api.seedance.nz/api/music/actions) and
[Midjourney actions](https://api.seedance.nz/api/midjourney/actions).
The reviewed snapshot contains 275 records across 17 application categories:
211 model records, 60 action records including default aliases, and four
operation records. These are inventory counts, not executable feature counts.

| Category | Planned owner | Current behavior |
| --- | --- | --- |
| Chat | DSH | 18 exact model ids configured for text; local streaming contracts pass |
| Video, image, enhancement, motion, audio | Canvas | Documented models/protocol distinctions indexed; execution adapters remain |
| Suno, Flow Music/Lyria, Midjourney | Canvas | Distinct actions, billing SKUs, reference types, required fields, versions and synchronous exceptions indexed |
| MiniMax H3 V2 | Canvas | Exact case-sensitive model and separate V2 protocol recorded |
| Transcription, 3D, structured decisions | Canvas / DSH | Distinct synchronous/task protocols recorded; execution remains |
| Upload | Canvas | Recorded separately from generation; no upload is performed by the catalog |
| Wallet | Host | Explicit credential-backed read exists; live account remains unverified |
| Action registries | Host | Public read and differences verified on the real service |
| Task queries and settlement | Host | Eight fixed read protocols and terminal usage in the [task center](gateway-tasks.md); no job is submitted or retried |

The default remains `deepseek/deepseek-v4.1-flash`. All 18 chat routes currently
declare text input and a 4096 default response budget. Models with documented
context capacities use those configured budgets; models without a known
capacity use 262144 conservatively. These configuration limits are not a claim
about each gateway model's maximum. Native conversation model selection can
use the configured catalog after a credential is supplied. C14 mounts the
published adapter and confirms that each exact id is offered and sent unchanged
to an isolated SSE fixture. Real service verification and advanced image,
audio/video, reasoning, search and structured-output support remain open.

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
