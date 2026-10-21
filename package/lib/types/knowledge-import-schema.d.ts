import { z } from 'zod';
export declare const knowledgeImportIssueCode: z.ZodEnum<{
    DOCUMENT_LIMIT: "DOCUMENT_LIMIT";
    DOCUMENT_PASSWORD: "DOCUMENT_PASSWORD";
    DOCUMENT_UNSUPPORTED: "DOCUMENT_UNSUPPORTED";
    DOCUMENT_INVALID: "DOCUMENT_INVALID";
    DECODE_TIMEOUT: "DECODE_TIMEOUT";
    DECODER_BUSY: "DECODER_BUSY";
    TEXT_ENCODING: "TEXT_ENCODING";
    HIDDEN_OR_LINK: "HIDDEN_OR_LINK";
    EXCLUDED_DIRECTORY: "EXCLUDED_DIRECTORY";
    UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT";
    FILE_TOO_LARGE: "FILE_TOO_LARGE";
    SOURCE_CHANGED: "SOURCE_CHANGED";
    NON_TEXT: "NON_TEXT";
    NO_TEXT: "NO_TEXT";
    FILE_READ_FAILED: "FILE_READ_FAILED";
}>;
export declare const knowledgeImportReportSchema: z.ZodObject<{
    project: z.ZodString;
    collectionId: z.ZodUUID;
    epoch: z.ZodNumber;
    createdAt: z.ZodISODateTime;
    examined: z.ZodNumber;
    indexed: z.ZodNumber;
    skipped: z.ZodNumber;
    failed: z.ZodNumber;
    issues: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        pathTruncated: z.ZodBoolean;
        outcome: z.ZodEnum<{
            failed: "failed";
            skipped: "skipped";
        }>;
        code: z.ZodEnum<{
            DOCUMENT_LIMIT: "DOCUMENT_LIMIT";
            DOCUMENT_PASSWORD: "DOCUMENT_PASSWORD";
            DOCUMENT_UNSUPPORTED: "DOCUMENT_UNSUPPORTED";
            DOCUMENT_INVALID: "DOCUMENT_INVALID";
            DECODE_TIMEOUT: "DECODE_TIMEOUT";
            DECODER_BUSY: "DECODER_BUSY";
            TEXT_ENCODING: "TEXT_ENCODING";
            HIDDEN_OR_LINK: "HIDDEN_OR_LINK";
            EXCLUDED_DIRECTORY: "EXCLUDED_DIRECTORY";
            UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT";
            FILE_TOO_LARGE: "FILE_TOO_LARGE";
            SOURCE_CHANGED: "SOURCE_CHANGED";
            NON_TEXT: "NON_TEXT";
            NO_TEXT: "NO_TEXT";
            FILE_READ_FAILED: "FILE_READ_FAILED";
        }>;
    }, z.core.$strict>>;
    omitted: z.ZodNumber;
}, z.core.$strict>;
export type KnowledgeImportReport = z.infer<typeof knowledgeImportReportSchema>;
export type KnowledgeImportIssue = KnowledgeImportReport['issues'][number];
