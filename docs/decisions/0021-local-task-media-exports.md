# 0021 · Save task media without exposing signed result URLs

Date: 2026-10-20. Status: implemented and locally verified; live media, new
browser controls and Canvas asset association remain unverified.

The task center could observe success but could not preserve expiring results.
An owned exporter now saves selected existing-task media to an explicit local
directory. It supports per-result or sequential batch actions, cancellation,
path copying and retained export history. Generation and Canvas approval remain
unchanged; no operation submits or resubmits a paid task.

The task reader keeps at most ten recent result-source sets in Host memory for
five minutes. An export preview issues bounded five-minute opaque references;
only source hostnames reach the client. Source addresses never enter SQLite or
Remote results. The exporter has separate schema-1 receipts containing local
paths, sizes, types and SHA-256. Task state stays schema 1. Removing records never
removes completed exports.

The media client makes anonymous HTTP(S) GETs without API keys, cookies, Referer,
ambient agents or proxies. Each target and redirect undergoes public-address
validation over all DNS answers, then a chosen address is pinned into the actual
connection. Private/reserved/mapped/local targets and unsafe schemes or userinfo
are refused. The transfer is bounded to 2 GiB, three redirects and five minutes,
with an idle timeout. Known byte signatures decide output types; active formats
are refused. No decoding, extraction, execution or re-encoding occurs.

Staging stays in the owned directory with ancestor/identity checks. Destination
identity is rechecked; COPYFILE_EXCL prevents overwrites and the saved file is
rehash-verified before a receipt. Copy is not claimed atomic. A process crash can
leave an unrecorded destination or temporary staging. A completed file survives
receipt-storage failure, with a visible unrecorded receipt and idempotent retry.
Normal network cancellation removes owned partial staging. A local copy already
started can finish; finished user files are retained. These checks are not a
sandbox against another malicious process running as the same OS user.

The full check passes build/type checks, 173 tests and private-file guards.
Twelve unit tests exercise real Node address classification, checked DNS pinning,
redirect/rebind refusal, exact streaming bytes/hashes, format/size gates, actual
SQLite reopen, concurrent clicks, expiration, cancellation, junctions, destination
replacement, no overwrite and receipt-write failure. C23 adds three contracts
using actual published Host/Remote and a real isolated HTTP media stream. They
validate closed URL-free codecs, no credential on the media request, old-key
generation cancellation and retained files after restart/remove/forget. Only the
final media socket is mapped to a synthetic local server; real TLS/CDN behavior
and real service results were not exercised.

The initial unit run exposed FIFO test-cleanup ordering on Windows: the temporary
directory hook ran before SQLite close. Resource closure now precedes removal;
all twelve tests and contracts pass. Four specifically identified synthetic
directories were verified inside system TEMP and removed after handles closed.
No user files or Canvas database were involved.

Native folder picking, safe Canvas import/association, interrupted-export recovery,
media inspection and broader result formats remain work. No upstream source,
Desktop protocol, credential layout or conversation persistence changed. No real
provider/media/paid call was made by the validation. No commit, push, PR or public
release occurred.

The final 96-file bundle has SHA-256
`21ce43091c1da559f35cb92ade7f192f06c4f136d3f03567f3ef35c87c90af08`.
Official CLI installation into a disposable profile passed expected entry bytes,
eighteen routes, Flash default, disabled collectors and Host socket checks, then
cleaned up. The owned development Host was subsequently stopped through its
original terminal after process/lease verification, and the checked archive was
installed by the owned launcher. The live entry digest matches the build; its
loopback socket is running. No browser was opened or inspected.
