# 0001 · Published runtime and local development foundation

Date: 2026-10-20. Status: implemented foundation, product development continues.

DSH-zhen is an independently built npm bundle installed through the published
DSH plugin command. The workspace pins DSH 0.2.1-rc.2 and Cordis 4.0.5. It does
not modify the upstream source tree or private profile formats. A dedicated
development DSH_HOME lives under ignored `.runtime/`.

The bundle supplies a creator panel and theme through documented slots, a Host
credential/wallet service, and the default Seedance model configuration. A
public `credentialOnboarding: false` option disables the official key prompt
without removing the general Models settings panel. This works on the pinned
Web runtime; it does not establish equivalent Desktop behavior.

The published Typert generator fails to recognize Remote decorators resolved
from npm declarations. We use the protocol's public `createTypertRemoteInfo`
factory and the loader's explicitly supported hand-written schema contribution.
The protocol is unchanged. Tests validate the contribution with the upstream
loader and compare its methods with the live decorated Cordis service.

Local bundle filenames include a content digest: replacing the contents of a
same-version tarball at an unchanged path did not refresh the installed pnpm
package during testing. Old archives are retained for package-manager rollback
and resolution. Installation remains a public CLI operation.

The local knowledge index is owned by DSH-zhen, separate from session storage.
The current implementation supports UTF-8 text, Markdown, CSV and JSON, with
bounded imports, lexical Chinese lookup, project-space filtering, revocation
epochs and separate permission for citation use with Seedance. It is not yet
an automatically invoked Agent retrieval tool or a PDF/OCR/vector pipeline.

Validation: build and TypeScript checks passed; actual Web runtime displayed the
creator panel in light and dark modes. Automated checks cover composition,
credential boundaries, RPC schemas, wallet failure handling, local index
isolation, stale references and private-file publication guards. Live gateway
chat, live wallet access, packet-level outbound verification, Canvas integration
and production signed updates remain unverified.
