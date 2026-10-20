# 0009 · Authorized community artwork generation

Date: 2026-10-20. Status: generated assets and independent art package prepared;
new artwork's live UI inspection remains pending.

The user explicitly authorized community derivatives and the imagegen skill.
That instruction replaces the earlier project restriction against generating
the character or requiring user-uploaded art. Creation and integration can
proceed without repeating an approval request for the same scope.

Two assets were generated with the built-in image_gen tool, using the previously
captured community reference: a creator-home illustration and a sidebar/header
avatar. Both saved outputs are transparent RGBA PNGs, 1254 by 1254 pixels and
below the existing 2 MiB individual-file limit. They were copied into the local
brand-assets directory without raster modification. Full prompts, hashes,
source revision and the user's authorization are retained beside them.

The independent manifest records that authorization, a community-derivative
license reference and the source project's complete MIT notice. An optional
bounded license.notice field preserves that text in the closed art ZIP; no
extra files are discovered or copied into it. The resulting local ZIP contains
exactly the two generated PNGs and manifest.json. The two image hashes match
the source outputs byte-for-byte. No upload, push or public release occurred.

The generated files remain separate from the main code bundle and root private
work instructions. The original community image remains available separately;
generation does not replace or rewrite the source attribution.

The browser tool rejected acquisition of the localhost preview under its URL
security policy. No alternate browser, raw protocol or indirect UI workaround
was used. This leaves the new generated set's actual light/dark/narrow rendering
unverified. Earlier local-container and original-image UI results remain scoped
to those earlier assets. Build/type checking, 59 automated checks and the local
art ZIP integrity check passed independently.
