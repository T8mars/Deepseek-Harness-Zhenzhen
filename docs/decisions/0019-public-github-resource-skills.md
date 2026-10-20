# 0019 · Public GitHub skills with complete resource snapshots

Date: 2026-10-20. Status: implemented and locally verified; new browser controls
and complete creative workflows remain unverified.

The first-party text feed and mutable local-directory connector did not download
third-party reference/script/asset packages. A separate public GitHub provider now
resolves a repository/ref/path to a pinned commit, downloads a single skill or a
one-level library and preserves relative resources and original license bytes.
It uses the published SkillProvider/resourceBase and native skill-tool seams.
No upstream source, session format or credential layout changed.

Downloads are inactive until explicit `github-resources-v1` review. Daily checks
download candidates for approved sources but never approve a resource update.
The running Host keeps its mounted snapshot; reviewed replacements and rollbacks
wait for the next Host start. Personal local sources have precedence and are never
modified. Disabling/forgetting preserves bytes; explicit cleanup protects this
Host's mounted version and recorded active/pending selections.

Own schema-1 JSON records source selections and update controls. Immutable
manifests bind repository, commit, Git tree, all file hashes/modes and parsed
definitions. Complete-tree checks reject truncated metadata; raw downloads must
match Git blob identities and SHA-256. Approval, startup activation and native
loads recheck the complete snapshot. Paths and owned cache ancestors are checked
before writes/removal. Links, submodules, LFS pointers and unsupported Windows
paths fail closed. Download uses bounded public GETs without ambient credentials,
Git checkout, hooks, dependency installation or source-code execution.

This is a separate resource policy, not an expansion of first-party text trust.
The scope deliberately stops at public repositories and manually reviewed
activation. Git hashes do not prove authorship or instruction safety. Dependency
execution, signatures, revocations, crash-staging recovery and arbitrary concurrent
Host mutation/cleanup remain work; JSON change detection is not a process mutex.
Limits and user controls are described in [GitHub skills](../github-skills.md).

`npm run check` passes build/type checks, 146 tests and the private-file guard.
Nine unit tests independently construct genuine objects with system Git, then
exercise resource-only updates, tampering, rollback, daily checks, offline use,
pending-selection cancellation, failed staging, links, LFS and path boundaries. Three C21 tests use
actual published Host/Remote/SkillRegistry/ToolRuntime/native loader to verify
relative resources, invocation restrictions, restart activation, personal-source
precedence and zero credential reads.

`node scripts/smoke-github-skills.mjs` performed nine real public GETs for
`anthropics/skills`, path `skills/algorithmic-art`, commit
`dbd4588f9e1033efb41dad4bef2f7947c8993d44`. All four files were verified and
the actual native tool loaded the skill with its temporary resource directory.
The snapshot digest was
`45a4df832f312bde603fafe4c209ae3c2fdb3e069470d4ad58c6c7726ff8f9a9`.
No attached script, model or paid provider was invoked. Temporary data was removed;
no third-party package was added to this repository or a public artifact.

No commit, push, PR, remote workflow or release occurred. The running development
profile was retained; browser policy still prevents inspection of these controls.

The final local bundle contains 90 files and has SHA-256
`925f611884da1d77bf01b513858a730984e3924ab0d054c32366ba6c0454cc52`.
`npm run smoke:install` installed the exact artifact with the official CLI in a
disposable profile. Entry bytes, eighteen chat routes, Flash default, disabled
collectors and Host loopback listening passed; the temporary Host stopped and
its owned directory was removed. This did not replace the development profile.
