# Dependency audit snapshot

Date: 2026-10-20. Scope: this npm workspace lockfile, not every user's installed
DSH profile or a production Desktop package.

The initial npm audit reported one high and nine moderate package records.
The directly selected pnpm 10.30.0 was replaced by exact 10.34.7 from its official
registry package; the release is documented in the
[pnpm release record](https://github.com/pnpm/pnpm/releases/tag/v10.34.7).
The directly selected yaml was patched from 2.8.1 to 2.8.3. Public DSH
`plugin --profile zhen install --force` completed with pnpm 10.34.7 against the
isolated development profile.

After those changes, npm audit reports zero high/critical and eight moderate
package records. The remaining chain leads to the exact fflate 0.8.2 dependency
of published @deepseek-ai/libreoffice-kit 0.1.5, which is reachable through DSH
Office packages. Its advisory concerns malformed ZIP64 data in unzipSync:
[GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
No upstream dependency or source file was edited. The local art pack command
uses its own exact fflate 0.8.3 and creates ZIPs; it does not unzip Office files.

The upstream Office chain remains an open release-readiness issue. No claim is
made that a workspace audit verifies every installed profile or that all
document-processing paths are safe. An upstream published dependency fix needs
to pass the normal candidate and contract workflow before adoption.

Browser build metadata currently identifies two embedded third-party packages:
the published DSH Typert protocol and Zod. The build writes their complete MIT
notices into THIRD_PARTY_NOTICES.md in the bundle and fails if the embedded
package set or declared license changes. External dependencies retain their
own packaged licenses.
