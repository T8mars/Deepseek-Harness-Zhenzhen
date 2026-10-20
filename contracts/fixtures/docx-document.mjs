import {zipSync,strToU8} from 'fflate';
export const wordNs='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export function exampleDocx(body='<w:p><w:r><w:t>EXAMPLE 海边人物设定：贞贞守护灯塔。</w:t></w:r></w:p>',options={}){
 const main=options.main??'word/document.xml',namespace=options.namespace??wordNs;
 const document=options.document??`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
 const parts={'[Content_Types].xml':strToU8(options.types??`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),'_rels/.rels':strToU8(options.rels??`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`),[main]:options.mainBytes??strToU8(document),...(options.extra??{})};
 return zipSync(parts,{level:options.level??6});
}
