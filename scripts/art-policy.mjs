import { inspectArtSource as capture } from '../packages/dsh-zhen/lib/art-source.js';
import { checkPackList } from './check-private.mjs';
/** Publication adds the private-root guard to the shared captured raster set. */
export function inspectArtSource(directory, options) { const reviewed = capture(directory, options); checkPackList([...reviewed.files.keys()]); return reviewed; }
