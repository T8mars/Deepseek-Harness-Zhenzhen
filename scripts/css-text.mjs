import {readFile} from 'node:fs/promises';

// CSS input preprocessing treats CRLF and CR as LF. Normalize before the text
// loader embeds styles in JavaScript, so Git checkout newlines do not change it.
export function cssTextPlugin(){
  return {name:'dsh-zhen-css-text',setup(build){
    build.onLoad({filter:/\.css$/},async({path})=>({contents:(await readFile(path,'utf8')).replace(/\r\n?/g,'\n'),loader:'text',watchFiles:[path]}));
  }};
}
