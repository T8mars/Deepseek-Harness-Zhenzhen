/** Text files use original lines; PDF lines belong to extracted page text. */
export function knowledgeLocation(hit:{path:string;line:number;page?:number}):string {
 return hit.page?`${hit.path} · 第 ${hit.page} 页（提取文本第 ${hit.line} 行附近）`:`${hit.path}:${hit.line}`;
}
