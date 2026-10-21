import { z } from 'zod';
export declare const LOCAL_SKILL_POLICY: "local-directory-v1";
export declare const localSkillMode: z.ZodEnum<{
    skill: "skill";
    library: "library";
}>;
export declare const localSkillEntrySchema: z.ZodObject<{
    directory: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    digest: z.ZodString;
    bytes: z.ZodNumber;
    modelInvocable: z.ZodBoolean;
    userInvocable: z.ZodBoolean;
}, z.core.$strict>;
export declare const localSkillDraftSchema: z.ZodObject<{
    root: z.ZodString;
    mode: z.ZodEnum<{
        skill: "skill";
        library: "library";
    }>;
    identity: z.ZodString;
    digest: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        directory: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        digest: z.ZodString;
        bytes: z.ZodNumber;
        modelInvocable: z.ZodBoolean;
        userInvocable: z.ZodBoolean;
    }, z.core.$strict>>;
    skipped: z.ZodNumber;
    problems: z.ZodNumber;
}, z.core.$strict>;
export declare const localSkillRecordSchema: z.ZodObject<{
    id: z.ZodUUID;
    root: z.ZodString;
    mode: z.ZodEnum<{
        skill: "skill";
        library: "library";
    }>;
    identity: z.ZodString;
    enabled: z.ZodBoolean;
    confirmedAt: z.ZodISODateTime;
    policy: z.ZodLiteral<"local-directory-v1">;
}, z.core.$strict>;
export declare const localSkillViewSchema: z.ZodObject<{
    source: z.ZodObject<{
        id: z.ZodUUID;
        root: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
        identity: z.ZodString;
        enabled: z.ZodBoolean;
        confirmedAt: z.ZodISODateTime;
        policy: z.ZodLiteral<"local-directory-v1">;
    }, z.core.$strict>;
    state: z.ZodEnum<{
        ready: "ready";
        unavailable: "unavailable";
        disabled: "disabled";
    }>;
    entries: z.ZodArray<z.ZodObject<{
        directory: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        digest: z.ZodString;
        bytes: z.ZodNumber;
        modelInvocable: z.ZodBoolean;
        userInvocable: z.ZodBoolean;
        shadowed: z.ZodBoolean;
    }, z.core.$strict>>;
    problems: z.ZodNumber;
    skipped: z.ZodNumber;
}, z.core.$strict>;
export declare const localSkillBodySchema: z.ZodObject<{
    entry: z.ZodObject<{
        directory: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        digest: z.ZodString;
        bytes: z.ZodNumber;
        modelInvocable: z.ZodBoolean;
        userInvocable: z.ZodBoolean;
    }, z.core.$strict>;
    content: z.ZodString;
    resourceRoot: z.ZodString;
}, z.core.$strict>;
export declare const localSkillStateSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodUUID;
        root: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
        identity: z.ZodString;
        enabled: z.ZodBoolean;
        confirmedAt: z.ZodISODateTime;
        policy: z.ZodLiteral<"local-directory-v1">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type LocalSkillEntry = z.infer<typeof localSkillEntrySchema>;
export type LocalSkillDraft = z.infer<typeof localSkillDraftSchema>;
export type LocalSkillRecord = z.infer<typeof localSkillRecordSchema>;
export type LocalSkillView = z.infer<typeof localSkillViewSchema>;
export type LocalSkillBody = z.infer<typeof localSkillBodySchema>;
export type LocalSkillMode = z.infer<typeof localSkillMode>;
