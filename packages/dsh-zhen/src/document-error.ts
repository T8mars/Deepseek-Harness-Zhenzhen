export const documentFailureCodes=['DOCUMENT_LIMIT','DOCUMENT_PASSWORD','DOCUMENT_UNSUPPORTED','DOCUMENT_INVALID','DECODE_TIMEOUT','DECODER_BUSY','TEXT_ENCODING'] as const;
export type DocumentFailureCode=typeof documentFailureCodes[number];
/** Fixed diagnostic metadata only. Never derive report text from a parser error. */
export function documentFailure(code:DocumentFailureCode,message:string):Error&{documentFailureCode:DocumentFailureCode}{return Object.assign(Error(message),{documentFailureCode:code});}
/** Never expose a grant callback's arbitrary error/cause at decoder boundaries. */
export function assertDocumentAuthority(kind:'PDF'|'Word',assertCurrent:()=>void):void {
  try{assertCurrent();}catch{throw Error(`资料权限已变化，${kind} 导入已停止。`);}
}
