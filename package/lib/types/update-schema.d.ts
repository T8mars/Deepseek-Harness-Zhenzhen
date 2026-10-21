import { z } from 'zod';
export declare const updateSourceSchema: z.ZodObject<{
    id: z.ZodEnum<{
        dsh: "dsh";
        canvas: "canvas";
        zhen: "zhen";
        gateway: "gateway";
    }>;
    title: z.ZodString;
    current: z.ZodString;
    available: z.ZodString;
    revision: z.ZodString;
    url: z.ZodString;
    changed: z.ZodBoolean;
    state: z.ZodEnum<{
        error: "error";
        checked: "checked";
        unpublished: "unpublished";
    }>;
    message: z.ZodString;
}, z.core.$strict>;
export declare const updateReportSchema: z.ZodObject<{
    checkedAt: z.ZodString;
    automatic: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            dsh: "dsh";
            canvas: "canvas";
            zhen: "zhen";
            gateway: "gateway";
        }>;
        title: z.ZodString;
        current: z.ZodString;
        available: z.ZodString;
        revision: z.ZodString;
        url: z.ZodString;
        changed: z.ZodBoolean;
        state: z.ZodEnum<{
            error: "error";
            checked: "checked";
            unpublished: "unpublished";
        }>;
        message: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type UpdateSource = z.infer<typeof updateSourceSchema>;
export type UpdateReport = z.infer<typeof updateReportSchema>;
