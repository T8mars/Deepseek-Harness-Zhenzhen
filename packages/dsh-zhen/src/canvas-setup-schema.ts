import {z} from 'zod';
import {canvasInstallCandidateSchema} from './canvas-discovery-schema.ts';
export const canvasSetupDiscoverySchema=z.object({
  candidates:z.array(canvasInstallCandidateSchema.extend({source:z.enum(['running-desktop','managed'])}).strict()).max(8),
  issues:z.array(z.string().max(200)).max(8),
}).strict();
export const canvasConnectionCheckSchema=z.object({
  binding:z.object({root:z.string().min(1).max(4096),digest:z.string().regex(/^[a-f0-9]{64}$/),instance:z.string().regex(/^[A-Za-z0-9._-]{0,128}$/)}).strict().nullable(),
  state:z.enum(['not-configured','not-running','choose-instance','needs-review','incompatible','ready','error']),
  code:z.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/),
  message:z.string().max(400),
  instances:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),version:z.string().max(64),port:z.number().int().min(1).max(65535)}).strict()).max(16),
}).strict();
export type CanvasSetupDiscovery=z.infer<typeof canvasSetupDiscoverySchema>;
export type CanvasConnectionCheck=z.infer<typeof canvasConnectionCheckSchema>;
