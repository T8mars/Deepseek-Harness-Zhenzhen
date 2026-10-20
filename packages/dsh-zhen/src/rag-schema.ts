import { z } from 'zod';
export const ragHitSchema = z.object({ id: z.string().uuid(), collectionId: z.string().uuid(), collectionName: z.string().max(100), path: z.string().min(1).max(4096), line: z.number().int().positive(), page: z.number().int().min(1).max(200).optional(), text: z.string().max(1600), epoch: z.number().int().positive() }).strict();
export const ragSourceSchema = z.object({ anchorId: z.string().uuid(), sections: z.array(ragHitSchema).min(1).max(3), firstSection: z.number().int().positive(), totalSections: z.number().int().positive(), earlierId: z.string().uuid().nullable(), laterId: z.string().uuid().nullable() }).strict();
export const ragPresentationSchema = z.discriminatedUnion('kind', [
  z.object({ schema: z.literal('dsh-zhen-rag-presentation-v1'), kind: z.literal('search'), query: z.string().max(200), hits: z.array(ragHitSchema).max(12), notice: z.string().max(1000) }).strict(),
  z.object({ schema: z.literal('dsh-zhen-rag-presentation-v1'), kind: z.literal('source'), source: ragSourceSchema, notice: z.string().max(1000) }).strict(),
]);
export type RagPresentation = z.infer<typeof ragPresentationSchema>;
