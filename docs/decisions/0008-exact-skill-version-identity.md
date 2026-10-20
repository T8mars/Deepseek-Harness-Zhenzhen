# 0008 · Exact instruction release identity

Date: 2026-10-20. Status: own skill-store schema 2 implemented and migration tested.

Two instruction releases may have identical body bytes while their versions or
manifests differ. Schema 1 used the body hash as the stored version key, which
could silently collapse those releases. Schema 2 uses a hash of the complete
validated package internally, while retaining the body SHA-256 in its manifest.
The public selection identifies id, body hash and version together.

Migration runs transactionally in the DSH-zhen-owned skill database. It retains
package bytes and translates active/pending references before replacing the
version table. It does not change upstream skills or session storage. Older
code refuses the newer schema; reverting code alone is not a database downgrade.
No selection is inferred from an update check.

The interface compares both installed version and body digest, and retained
release buttons use version identities. Legacy calls that omit a version still
work when the body identifies one release; ambiguous calls fail with a refresh
instruction. A reviewed update to a disabled skill keeps its current provider
disabled and enables the selected release only at the next Host start.
Disabling still cancels pending activation.

Tests preserve both identical-body versions, reject ambiguous old selectors,
retain the active body before restart, activate the exact selected release,
exercise explicit rollback, preserve disabled state until restart, and migrate a
synthetic schema-1 database with a pending selection. A wider installed-user
migration matrix and backup/recovery workflow remain outside these checks.
