import { z } from 'zod';
export declare const mcpId: z.ZodEnum<{
    memory: "memory";
    filesystem: "filesystem";
}>;
export declare const mcpReleaseSchema: z.ZodObject<{
    id: z.ZodEnum<{
        memory: "memory";
        filesystem: "filesystem";
    }>;
    version: z.ZodString;
    integrity: z.ZodString;
    gitHead: z.ZodString;
    node: z.ZodString;
    license: z.ZodString;
    checkedAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const mcpInstallationSchema: z.ZodObject<{
    release: z.ZodObject<{
        id: z.ZodEnum<{
            memory: "memory";
            filesystem: "filesystem";
        }>;
        version: z.ZodString;
        integrity: z.ZodString;
        gitHead: z.ZodString;
        node: z.ZodString;
        license: z.ZodString;
        checkedAt: z.ZodISODateTime;
    }, z.core.$strict>;
    digest: z.ZodString;
    packages: z.ZodNumber;
    installedAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const mcpArchiveSchema: z.ZodObject<{
    archiveId: z.ZodUUID;
    installation: z.ZodObject<{
        release: z.ZodObject<{
            id: z.ZodEnum<{
                memory: "memory";
                filesystem: "filesystem";
            }>;
            version: z.ZodString;
            integrity: z.ZodString;
            gitHead: z.ZodString;
            node: z.ZodString;
            license: z.ZodString;
            checkedAt: z.ZodISODateTime;
        }, z.core.$strict>;
        digest: z.ZodString;
        packages: z.ZodNumber;
        installedAt: z.ZodISODateTime;
    }, z.core.$strict>;
    retainedAt: z.ZodISODateTime;
    programRetained: z.ZodBoolean;
    verified: z.ZodBoolean;
}, z.core.$strict>;
export declare const mcpSelectionSchema: z.ZodObject<{
    id: z.ZodEnum<{
        memory: "memory";
        filesystem: "filesystem";
    }>;
    active: z.ZodString;
    pending: z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"">]>;
    enabled: z.ZodBoolean;
    workspace: z.ZodString;
    epoch: z.ZodNumber;
}, z.core.$strict>;
export declare const mcpMarketSnapshotSchema: z.ZodObject<{
    schemaVersion: z.ZodDefault<z.ZodLiteral<2>>;
    archives: z.ZodDefault<z.ZodArray<z.ZodObject<{
        archiveId: z.ZodUUID;
        installation: z.ZodObject<{
            release: z.ZodObject<{
                id: z.ZodEnum<{
                    memory: "memory";
                    filesystem: "filesystem";
                }>;
                version: z.ZodString;
                integrity: z.ZodString;
                gitHead: z.ZodString;
                node: z.ZodString;
                license: z.ZodString;
                checkedAt: z.ZodISODateTime;
            }, z.core.$strict>;
            digest: z.ZodString;
            packages: z.ZodNumber;
            installedAt: z.ZodISODateTime;
        }, z.core.$strict>;
        retainedAt: z.ZodISODateTime;
        programRetained: z.ZodBoolean;
        verified: z.ZodBoolean;
    }, z.core.$strict>>>;
    automatic: z.ZodBoolean;
    checkedAt: z.ZodString;
    message: z.ZodString;
    nextEpoch: z.ZodDefault<z.ZodNumber>;
    candidates: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            memory: "memory";
            filesystem: "filesystem";
        }>;
        version: z.ZodString;
        integrity: z.ZodString;
        gitHead: z.ZodString;
        node: z.ZodString;
        license: z.ZodString;
        checkedAt: z.ZodISODateTime;
    }, z.core.$strict>>;
    installations: z.ZodArray<z.ZodObject<{
        release: z.ZodObject<{
            id: z.ZodEnum<{
                memory: "memory";
                filesystem: "filesystem";
            }>;
            version: z.ZodString;
            integrity: z.ZodString;
            gitHead: z.ZodString;
            node: z.ZodString;
            license: z.ZodString;
            checkedAt: z.ZodISODateTime;
        }, z.core.$strict>;
        digest: z.ZodString;
        packages: z.ZodNumber;
        installedAt: z.ZodISODateTime;
    }, z.core.$strict>>;
    selections: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            memory: "memory";
            filesystem: "filesystem";
        }>;
        active: z.ZodString;
        pending: z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"">]>;
        enabled: z.ZodBoolean;
        workspace: z.ZodString;
        epoch: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type McpId = z.infer<typeof mcpId>;
export type McpRelease = z.infer<typeof mcpReleaseSchema>;
export type McpInstallation = z.infer<typeof mcpInstallationSchema>;
export type McpArchive = z.infer<typeof mcpArchiveSchema>;
export type McpSelection = z.infer<typeof mcpSelectionSchema>;
export type McpMarketSnapshot = z.infer<typeof mcpMarketSnapshotSchema>;
export declare const mcpMarketViewSchema: z.ZodObject<{
    snapshot: z.ZodObject<{
        schemaVersion: z.ZodDefault<z.ZodLiteral<2>>;
        archives: z.ZodDefault<z.ZodArray<z.ZodObject<{
            archiveId: z.ZodUUID;
            installation: z.ZodObject<{
                release: z.ZodObject<{
                    id: z.ZodEnum<{
                        memory: "memory";
                        filesystem: "filesystem";
                    }>;
                    version: z.ZodString;
                    integrity: z.ZodString;
                    gitHead: z.ZodString;
                    node: z.ZodString;
                    license: z.ZodString;
                    checkedAt: z.ZodISODateTime;
                }, z.core.$strict>;
                digest: z.ZodString;
                packages: z.ZodNumber;
                installedAt: z.ZodISODateTime;
            }, z.core.$strict>;
            retainedAt: z.ZodISODateTime;
            programRetained: z.ZodBoolean;
            verified: z.ZodBoolean;
        }, z.core.$strict>>>;
        automatic: z.ZodBoolean;
        checkedAt: z.ZodString;
        message: z.ZodString;
        nextEpoch: z.ZodDefault<z.ZodNumber>;
        candidates: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<{
                memory: "memory";
                filesystem: "filesystem";
            }>;
            version: z.ZodString;
            integrity: z.ZodString;
            gitHead: z.ZodString;
            node: z.ZodString;
            license: z.ZodString;
            checkedAt: z.ZodISODateTime;
        }, z.core.$strict>>;
        installations: z.ZodArray<z.ZodObject<{
            release: z.ZodObject<{
                id: z.ZodEnum<{
                    memory: "memory";
                    filesystem: "filesystem";
                }>;
                version: z.ZodString;
                integrity: z.ZodString;
                gitHead: z.ZodString;
                node: z.ZodString;
                license: z.ZodString;
                checkedAt: z.ZodISODateTime;
            }, z.core.$strict>;
            digest: z.ZodString;
            packages: z.ZodNumber;
            installedAt: z.ZodISODateTime;
        }, z.core.$strict>>;
        selections: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<{
                memory: "memory";
                filesystem: "filesystem";
            }>;
            active: z.ZodString;
            pending: z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"">]>;
            enabled: z.ZodBoolean;
            workspace: z.ZodString;
            epoch: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    node: z.ZodString;
    incompatible: z.ZodArray<z.ZodString>;
    recipes: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            memory: "memory";
            filesystem: "filesystem";
        }>;
        title: z.ZodString;
        package: z.ZodString;
        version: z.ZodString;
        integrity: z.ZodString;
        gitHead: z.ZodString;
        node: z.ZodString;
        license: z.ZodString;
        description: z.ZodString;
        access: z.ZodString;
        runtime: z.ZodEnum<{
            error: "error";
            ready: "ready";
            unavailable: "unavailable";
            idle: "idle";
            draining: "draining";
        }>;
        maintenance: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type McpMarketView = z.infer<typeof mcpMarketViewSchema>;
export declare const MCP_RECIPES: {
    readonly memory: {
        readonly id: "memory";
        readonly title: "项目记忆";
        readonly package: "@modelcontextprotocol/server-memory";
        readonly version: "2026.8.31";
        readonly integrity: "sha512-ljj/3S4aGjxdNSQWw6gucKKGnTLdBPWxzapyY/MT2tOVyZwvxChvevXSLPwx59nKJAlVpUVW+cOlnVRXRwiqMQ==";
        readonly entry: "dist/index.js";
        readonly gitHead: "a40bc270fb5ece62673f8a1196f57116d885c5eb";
        readonly node: "";
        readonly license: "SEE LICENSE IN LICENSE";
        readonly description: "在当前项目的独立记忆文件中记录实体、关系和观察。";
        readonly access: "读写此连接的记忆数据；工具结果会提供给会话所选模型。";
    };
    readonly filesystem: {
        readonly id: "filesystem";
        readonly title: "项目文件";
        readonly package: "@modelcontextprotocol/server-filesystem";
        readonly version: "2026.8.31";
        readonly integrity: "sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==";
        readonly entry: "dist/index.js";
        readonly gitHead: "a40bc270fb5ece62673f8a1196f57116d885c5eb";
        readonly node: "";
        readonly license: "SEE LICENSE IN LICENSE";
        readonly description: "通过官方参考服务器整理所选项目中的文件。";
        readonly access: "可读写所选项目目录；工具结果会提供给会话所选模型。";
    };
};
