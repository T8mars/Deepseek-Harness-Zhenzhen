import { z } from 'zod';
export declare const ragHitSchema: z.ZodObject<{
    id: z.ZodString;
    collectionId: z.ZodString;
    collectionName: z.ZodString;
    path: z.ZodString;
    line: z.ZodNumber;
    page: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    epoch: z.ZodNumber;
}, z.core.$strict>;
export declare const ragSourceSchema: z.ZodObject<{
    anchorId: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        collectionId: z.ZodString;
        collectionName: z.ZodString;
        path: z.ZodString;
        line: z.ZodNumber;
        page: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        epoch: z.ZodNumber;
    }, z.core.$strict>>;
    firstSection: z.ZodNumber;
    totalSections: z.ZodNumber;
    earlierId: z.ZodNullable<z.ZodString>;
    laterId: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const ragPresentationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    schema: z.ZodLiteral<"dsh-zhen-rag-presentation-v1">;
    kind: z.ZodLiteral<"search">;
    query: z.ZodString;
    hits: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        collectionId: z.ZodString;
        collectionName: z.ZodString;
        path: z.ZodString;
        line: z.ZodNumber;
        page: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        epoch: z.ZodNumber;
    }, z.core.$strict>>;
    notice: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    schema: z.ZodLiteral<"dsh-zhen-rag-presentation-v1">;
    kind: z.ZodLiteral<"source">;
    source: z.ZodObject<{
        anchorId: z.ZodString;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            collectionId: z.ZodString;
            collectionName: z.ZodString;
            path: z.ZodString;
            line: z.ZodNumber;
            page: z.ZodOptional<z.ZodNumber>;
            text: z.ZodString;
            epoch: z.ZodNumber;
        }, z.core.$strict>>;
        firstSection: z.ZodNumber;
        totalSections: z.ZodNumber;
        earlierId: z.ZodNullable<z.ZodString>;
        laterId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    notice: z.ZodString;
}, z.core.$strict>], "kind">;
export type RagPresentation = z.infer<typeof ragPresentationSchema>;
