import { z } from 'zod';
export const updateSourceSchema = z.object({ id: z.enum(['dsh', 'canvas', 'zhen', 'gateway']), title: z.string(), current: z.string(), available: z.string(), revision: z.string(), url: z.string(), changed: z.boolean(), state: z.enum(['checked', 'unpublished', 'error']), message: z.string() }).strict();
export const updateReportSchema = z.object({ checkedAt: z.string(), automatic: z.boolean(), sources: z.array(updateSourceSchema) }).strict();
export type UpdateSource = z.infer<typeof updateSourceSchema>;
export type UpdateReport = z.infer<typeof updateReportSchema>;
