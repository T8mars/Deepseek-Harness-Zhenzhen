# 0005 · User-supplied character art containers

Date: 2026-10-20. Status: local import and packaging policy implemented;
redistribution of community artwork is not confirmed.

The creator panel and existing sidebar/conversation brand slots accept locally
provided raster assets. A browser-only IndexedDB store holds originals and
display preferences. No art is sent to the Host, model or a remote service.
The code distribution contains only original abstract fallbacks. Actual art
files in the separate brand-assets directory are ignored by Git.

Users can select individual images or a directory with manifest.json. A full
directory import validates every referenced asset before one atomic transaction
replaces the local set. The manifest supports hero portrait, hero mark and
sidebar mark plus dark variants. Missing variants reuse the general asset;
failed rendering falls back to an abstract mark or water graphic.

The first implementation accepts static PNG, JPEG and WebP, bounded to 2 MiB
and 4096 by 4096 per image. Header/PNG integrity inspection precedes full browser
image decoding. Animated images and SVG are excluded. Auto display uses the
creator area's width; narrow layouts do not instantiate portrait images. Users
can choose stage, compact, mark-only or disable their images. Focus and scale
change container display only. Reduced-motion has no animated raster to stop.

The separate pack:art command captures a closed set of manifest-listed files
and writes a local ZIP. Redistribution is refused unless confirmedByUser is
true and the confirmation date, permitted redistribution, license description
and source are recorded. This is a user declaration, not a rights certification.
The command does not upload or publish. Runtime import remains available for
private local use when redistribution has not been confirmed.

Validation: format, path, symlink and redistribution tests passed. The real Web
runtime imported a synthetic PNG and a complete directory, retained them after
reload, and kept the previous image/credit after a missing-file import failed.
The four required background colors were observed. Light/dark input colors and
control borders were inspected, as were mark-only fallback, disabled images and
390px layouts without horizontal overflow. All synthetic assets/credits were
removed afterward. No community character was generated, described or copied.

The public art guide documents supported slots and local ZIP import. Additional
state/character slots require documented upstream extension surfaces; this
implementation does not patch the upstream avatar or Desktop resources.

Later on the same date, the user directed an Internet search for existing
community artwork. One unchanged 512px WebP from Sutera-Diffusus/dsh-whale-musume
at commit 894f9701bf4e9fcdabd47b646d63f44c3eb574cb was captured in the ignored
local brand-assets directory, with its source, SHA-256 and source LICENSE.
It was imported into the real Web homepage for local preview. The manifest keeps
confirmedByUser=false and redistribution=unknown; pack:art refused this set as
expected. The repository-wide MIT notice is retained without asserting separate
artwork rights. No third-party plugin code was installed.

The real image exposed clipping in the compact container: a fixed 300px image
inside a 220px stage. The image now fits the compact stage; its original bytes
remain unchanged. The browser displayed the complete original in light mode.
