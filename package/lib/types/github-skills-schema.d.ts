import { z } from 'zod';
export declare const GITHUB_SKILL_POLICY: "github-resources-v1";
export declare const githubSkillSpecSchema: z.ZodObject<{
    repository: z.ZodString;
    reference: z.ZodString;
    path: z.ZodString;
    mode: z.ZodEnum<{
        skill: "skill";
        library: "library";
    }>;
}, z.core.$strict>;
export declare const githubSkillFileSchema: z.ZodObject<{
    location: z.ZodEnum<{
        origin: "origin";
        package: "package";
    }>;
    path: z.ZodString;
    gitSha: z.ZodString;
    sha256: z.ZodString;
    bytes: z.ZodNumber;
    mode: z.ZodEnum<{
        100644: "100644";
        100755: "100755";
    }>;
}, z.core.$strict>;
export declare const githubSkillReleaseSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    spec: z.ZodObject<{
        repository: z.ZodString;
        reference: z.ZodString;
        path: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
    }, z.core.$strict>;
    sourceId: z.ZodString;
    revision: z.ZodString;
    tree: z.ZodString;
    license: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        location: z.ZodEnum<{
            origin: "origin";
            package: "package";
        }>;
        path: z.ZodString;
        gitSha: z.ZodString;
        sha256: z.ZodString;
        bytes: z.ZodNumber;
        mode: z.ZodEnum<{
            100644: "100644";
            100755: "100755";
        }>;
    }, z.core.$strict>>;
    entries: z.ZodArray<z.ZodObject<{
        directory: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        digest: z.ZodString;
        bytes: z.ZodNumber;
        modelInvocable: z.ZodBoolean;
        userInvocable: z.ZodBoolean;
    }, z.core.$strict>>;
    problems: z.ZodNumber;
    digest: z.ZodString;
}, z.core.$strict>;
export declare const githubSkillSourceSchema: z.ZodObject<{
    id: z.ZodString;
    spec: z.ZodObject<{
        repository: z.ZodString;
        reference: z.ZodString;
        path: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
    }, z.core.$strict>;
    enabled: z.ZodBoolean;
    automatic: z.ZodBoolean;
    active: z.ZodString;
    pending: z.ZodString;
    latest: z.ZodString;
    checkedAt: z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodISODateTime]>;
    state: z.ZodEnum<{
        checked: "checked";
        unavailable: "unavailable";
        idle: "idle";
    }>;
    policy: z.ZodLiteral<"github-resources-v1">;
}, z.core.$strict>;
export declare const githubSkillStateSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        spec: z.ZodObject<{
            repository: z.ZodString;
            reference: z.ZodString;
            path: z.ZodString;
            mode: z.ZodEnum<{
                skill: "skill";
                library: "library";
            }>;
        }, z.core.$strict>;
        enabled: z.ZodBoolean;
        automatic: z.ZodBoolean;
        active: z.ZodString;
        pending: z.ZodString;
        latest: z.ZodString;
        checkedAt: z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodISODateTime]>;
        state: z.ZodEnum<{
            checked: "checked";
            unavailable: "unavailable";
            idle: "idle";
        }>;
        policy: z.ZodLiteral<"github-resources-v1">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const githubSkillSourceViewSchema: z.ZodObject<{
    id: z.ZodString;
    spec: z.ZodObject<{
        repository: z.ZodString;
        reference: z.ZodString;
        path: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
    }, z.core.$strict>;
    enabled: z.ZodBoolean;
    automatic: z.ZodBoolean;
    active: z.ZodString;
    pending: z.ZodString;
    latest: z.ZodString;
    checkedAt: z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodISODateTime]>;
    state: z.ZodEnum<{
        checked: "checked";
        unavailable: "unavailable";
        idle: "idle";
    }>;
    policy: z.ZodLiteral<"github-resources-v1">;
    running: z.ZodString;
    skills: z.ZodArray<z.ZodObject<{
        directory: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        digest: z.ZodString;
        bytes: z.ZodNumber;
        modelInvocable: z.ZodBoolean;
        userInvocable: z.ZodBoolean;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const githubSkillSummarySchema: z.ZodObject<{
    license: z.ZodString;
    digest: z.ZodString;
    revision: z.ZodString;
    schemaVersion: z.ZodLiteral<1>;
    spec: z.ZodObject<{
        repository: z.ZodString;
        reference: z.ZodString;
        path: z.ZodString;
        mode: z.ZodEnum<{
            skill: "skill";
            library: "library";
        }>;
    }, z.core.$strict>;
    sourceId: z.ZodString;
    tree: z.ZodString;
    bytes: z.ZodNumber;
    fileCount: z.ZodNumber;
    skillCount: z.ZodNumber;
}, z.core.$strict>;
export declare const githubSkillPreviewSchema: z.ZodObject<{
    release: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        spec: z.ZodObject<{
            repository: z.ZodString;
            reference: z.ZodString;
            path: z.ZodString;
            mode: z.ZodEnum<{
                skill: "skill";
                library: "library";
            }>;
        }, z.core.$strict>;
        sourceId: z.ZodString;
        revision: z.ZodString;
        tree: z.ZodString;
        license: z.ZodString;
        files: z.ZodArray<z.ZodObject<{
            location: z.ZodEnum<{
                origin: "origin";
                package: "package";
            }>;
            path: z.ZodString;
            gitSha: z.ZodString;
            sha256: z.ZodString;
            bytes: z.ZodNumber;
            mode: z.ZodEnum<{
                100644: "100644";
                100755: "100755";
            }>;
        }, z.core.$strict>>;
        entries: z.ZodArray<z.ZodObject<{
            directory: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            digest: z.ZodString;
            bytes: z.ZodNumber;
            modelInvocable: z.ZodBoolean;
            userInvocable: z.ZodBoolean;
        }, z.core.$strict>>;
        problems: z.ZodNumber;
        digest: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        spec: z.ZodObject<{
            repository: z.ZodString;
            reference: z.ZodString;
            path: z.ZodString;
            mode: z.ZodEnum<{
                skill: "skill";
                library: "library";
            }>;
        }, z.core.$strict>;
        enabled: z.ZodBoolean;
        automatic: z.ZodBoolean;
        active: z.ZodString;
        pending: z.ZodString;
        latest: z.ZodString;
        checkedAt: z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodISODateTime]>;
        state: z.ZodEnum<{
            checked: "checked";
            unavailable: "unavailable";
            idle: "idle";
        }>;
        policy: z.ZodLiteral<"github-resources-v1">;
        running: z.ZodString;
        skills: z.ZodArray<z.ZodObject<{
            directory: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            digest: z.ZodString;
            bytes: z.ZodNumber;
            modelInvocable: z.ZodBoolean;
            userInvocable: z.ZodBoolean;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    comparisonAvailable: z.ZodBoolean;
    added: z.ZodArray<z.ZodString>;
    removed: z.ZodArray<z.ZodString>;
    changed: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const githubSkillFilePreviewSchema: z.ZodObject<{
    path: z.ZodString;
    location: z.ZodEnum<{
        origin: "origin";
        package: "package";
    }>;
    sha256: z.ZodString;
    bytes: z.ZodNumber;
    encoding: z.ZodEnum<{
        text: "text";
        opaque: "opaque";
    }>;
    content: z.ZodString;
}, z.core.$strict>;
export type GithubSkillSpec = z.infer<typeof githubSkillSpecSchema>;
export type GithubSkillFile = z.infer<typeof githubSkillFileSchema>;
export type GithubSkillRelease = z.infer<typeof githubSkillReleaseSchema>;
export type GithubSkillSource = z.infer<typeof githubSkillSourceSchema>;
export type GithubSkillSourceView = z.infer<typeof githubSkillSourceViewSchema>;
export type GithubSkillSummary = z.infer<typeof githubSkillSummarySchema>;
export type GithubSkillPreview = z.infer<typeof githubSkillPreviewSchema>;
export type GithubSkillFilePreview = z.infer<typeof githubSkillFilePreviewSchema>;
