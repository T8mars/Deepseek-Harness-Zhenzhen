# 0012 · Published upstream candidate preparation and validation

Date: 2026-10-20. Status: implemented and locally checked; remote execution,
an actual newer DSH release, canary and production promotion remain unverified.

The candidate workflow now prepares exact published dependency pins rather than
only recording discovery metadata. The read-only preparation job resolves npm
`next`, verifies the corresponding GitHub release tag/commit and every directly
referenced DSH publication, checks independent overrides, installs without
lifecycle hooks and runs the owned contracts and disposable installation smoke.
It does not edit, merge or publish upstream source.

Forty-two upgrade-guide blob identities and 190 fresh shipped Web-template rows
form the current observation baseline. Rows include config-key shape and a
canonical default-value digest, so changes to values also require review. Only
fresh public templates are inspected; real settings, credentials and session
contents are not read. Reviews bind target commit, source identity and concrete
rationale. An overridden row disappearing cannot be waived with a review entry.
An existing observation baseline cannot silently be recaptured over drift.

A separate fresh publisher job has write permission. It installs no candidate
dependencies and evaluates no candidate scripts. A bounded JSON envelope carries
only a fixed list of owned pin/lock/observation/generated metadata paths. Pure
builtin validation compares the trusted Git base, exact expected manifest edits,
all package integrities, registry origins, generated compatibility source and
source differences before writing files. Private research names and arbitrary
source/scripts cannot pass this path. Failed preparation can produce a discovery
draft, never a partially rewritten dependency set. No merge, production release
or active application update runs in the workflow.

The owned instruction transport retains a reviewed Host-version lineage rather
than invalidating installed personal instructions whenever the runtime pin
changes. A synthetic compatibility expansion reopens a real SkillMarket database
and preserves its immutable releases, personal text and provider access. It does
not prove compatibility with a real newer upstream runtime and adds no resources,
dependencies or executable permissions to instruction packages.

The launcher also exposed a concrete lifecycle issue: it could install a changed
same-version artifact while an old Host was running. It now reserves the local
port before acquiring/recovering ownership and calling any profile-mutating CLI.
The parent lock remains across the Host socket handoff until shutdown. Tests
cover collisions, live ownership, dead owners and malformed records. The real
development Host stayed running; an attempted check refused before mutation and
its installed marker was unchanged. Direct uncooperative CLI launches remain
outside this cooperative guard.

The CLI plugin help probe unexpectedly initialized an empty global profile,
because plugin arguments are forwarded to pnpm. Only that newly created profile
was removed after checking its exact resolved path, creation time and absence of
a link; no profile contents were read. Future probes use isolated homes or public
documentation. The launcher installation forwards `--force --ignore-scripts` to
replace changed local artifacts without running dependency lifecycle hooks.

Current real npm metadata for 23 direct DSH packages matches the installed lock.
The real `next` version still equals `0.2.1-rc.2` with the pinned commit and SRI,
so no dependency was upgraded. Preparation, policy, Git collection, personal-skill
preservation, version precedence and public-profile contracts were tested locally.
No workflow, commit, push, PR, paid request or production release occurred. New UI
inspection is still pending under the recorded browser-policy refusal; it was
not bypassed.

The final full build/type/private check passes all 78 serial tests. The new
81-file local archive has SHA-256
`f91fefd2126713fe340cb6c25aaca3611413176254dc7a35f1392df25d8d8b46`.
The official CLI installed the old `4a661c04d4fa8e07` archive and then replaced it
with this same-version artifact in a disposable profile. Resolving our package
entry through public CLI/pnpm exec verified that the installed bytes changed to
the current build; composition retained 18 routes, the Flash default and all
designated collector disable flags. The temporary Host listened, stopped and its
owned directory was cleaned. No browser, real provider, active profile update or
paid call participated.
