# 0020 · Track existing gateway tasks and terminal settlement

Date: 2026-10-20. Status: implemented and locally verified; new browser controls
and a real account remain unverified.

The capability inventory described media protocols but could not query an
already accepted gateway task after disconnect or restart. An owned Host service
and task-center page now retain existing ids and query eight fixed protocols:
OpenAI-style video, legacy video, image, audio, 3D, music, Midjourney and MiniMax
V2. Generation and approval remain on the Canvas integration path. No upstream
source, session format, credential layout or Canvas implementation changed.

Own schema-1 SQLite records safe status/progress, task identity, tracking policy,
query times and terminal usage. It does not retain credentials, signed URLs,
prompts, lyrics, titles, provider failure text or full response bodies. Only a
terminal valid usage amount/currency is reported as settlement; old cost/quota,
running usage and absent values cannot become a final charge or inferred refund.

Adding a record performs no network read. Explicit tracking survives Host restart;
a five-second scheduler queries one due record at a time. Same-record requests
share one promise. Persisted cooldown and error backoff also constrain manual
refresh, with Retry-After support. Terminal and unknown states stop automatic
tracking. A terminal record without usage can be manually refreshed later.
Queries use current ctx.credentials once per operation, bounded responses and
redirect-refusing GETs. No endpoint creates, retries creation, cancels, deletes
upstream records or fetches media. Pause/remove refer only to local tracking.

Replacing credentials through our connection page aborts the old generation and
pauses tracking; late responses cannot update the record. External native setting
changes take effect at the next credential resolution, following the public seam.
Removing a record during a query cannot resurrect it. Results remain in Canvas
or the originating service until safe media transfer/asset association is added.

The full public source was read again without credentials: 790392 bytes,
SHA-256 `cd7d81ab06320a5d653a64e7413ca3834523fc7881b7b2bbf5077d2d878245e5`,
matching the reviewed baseline. The complete MiniMax section includes a distinct
DELETE operation; it was not mistaken for a universal cancellation capability.
No live task id or key was supplied or queried.

`npm run check` passes build/type checks, 158 tests and the private-file guard.
Nine units cover bounded parsing, independent protocol facts, identity mismatch,
usage semantics, redaction, real SQLite reopen, explicit tracking, Retry-After,
mid-response interruption, cancellation generations, removal races and limits.
Three C22 contracts use published Cordis/Host/Remote with actual isolated HTTP
transport. They verify eight independently specified GET paths and strict codecs,
a real Host timer after restart, no credential reads for list/add, and new-key
resolution after an old in-flight query is invalidated. All data is synthetic.

Browser inspection remains unavailable under the existing tool policy. Live
gateway settlement, downloads, Canvas paid submission and provider cancellation
remain unverified. No paid call, commit, push, PR, remote workflow or public
release occurred. Root private research files remain excluded.

The 93-file bundle has SHA-256
`b441b77e53a962d5d09dfe99fc32d1d43281fc1654fbf829d22ab54a2eb60494`.
The official CLI installed the exact archive in a disposable profile; entry
bytes, eighteen chat routes, Flash default, disabled collectors and Host socket
passed. That Host and temporary directory were cleaned up. After verifying the
existing development process belonged to this workspace, its original terminal
was interrupted and both parent/child termination and port release were confirmed.
The owned launcher then installed the checked archive with the public CLI and
started without opening a browser. The installed entry digest matches the build;
only the loopback socket was inspected, not the UI.
