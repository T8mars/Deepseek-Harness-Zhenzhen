import React from 'react';
import type { KnowledgeImportReport } from 'dsh-zhen';
/** Owner-only report. React escapes file names; no parser messages or document bodies. */
export declare function ImportReport({ report }: {
    report: KnowledgeImportReport;
}): React.ReactElement;
