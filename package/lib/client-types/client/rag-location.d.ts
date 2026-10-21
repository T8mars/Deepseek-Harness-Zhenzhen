/** Text files use original lines; PDF/DOCX refer to extracted text positions. */
export declare function knowledgeLocation(hit: {
    path: string;
    line: number;
    page?: number;
}): string;
