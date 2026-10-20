import { z } from 'zod';

export const canvasInstallCandidateSchema = z.object({
  root: z.string().min(1).max(4096),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  cliVersion: z.string().min(1).max(64),
  skillVersion: z.string().min(1).max(64),
  nodeSchemaDigest: z.string().regex(/^[a-f0-9]{64}$/),
  providerCatalogDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const canvasDiscoverySchema = z.object({ candidates: z.array(canvasInstallCandidateSchema).max(8), issues: z.array(z.string().max(200)).max(8) }).strict();
export type CanvasInstallCandidate = z.infer<typeof canvasInstallCandidateSchema>;
export type CanvasDiscovery = z.infer<typeof canvasDiscoverySchema>;
