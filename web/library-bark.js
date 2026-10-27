import {unzlibSync} from './vendor/fflate-browser.js';
import {LIBRARY_BARK_PROVENANCE,LIBRARY_BARK_RGBA_ZLIB} from './assets/bark/celtis-bark-v1.js';
import {BARK_LIBRARY_CATALOG,BARK_LIBRARY_RGBA_ZLIB} from './assets/bark/bark-library-v2.js';
import {BARK_TEXTURE_DEFAULTS} from './bark-material-defaults.js';

export const LIBRARY_BARK_STYLE='LIBRARY_CELTIS_V1';
export const libraryBarkProvenance=LIBRARY_BARK_PROVENANCE;
// The packed image version remains immutable; UI defaults are independent of it.
export const libraryBarkCatalog=BARK_LIBRARY_CATALOG.map(record=>({...record,preset:{...record.preset,...BARK_TEXTURE_DEFAULTS}}));
export const libraryBarkStyles=Object.freeze([LIBRARY_BARK_STYLE,...BARK_LIBRARY_CATALOG.map(p=>p.style)]);
export const hasLibraryBark=style=>libraryBarkStyles.includes(style);
const decoded=new Map();
export function libraryBarkMaps(size=512,style=LIBRARY_BARK_STYLE){
  if(!hasLibraryBark(style))throw Error('素材库树皮版本不存在');
  const packed=style===LIBRARY_BARK_STYLE?LIBRARY_BARK_RGBA_ZLIB:BARK_LIBRARY_RGBA_ZLIB[style];
  if(!decoded.has(style))decoded.set(style,Object.fromEntries(Object.entries(packed).map(([key,value])=>{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);return[key,unzlibSync(bytes)];})));
  const original=512;
  return Object.fromEntries(Object.entries(decoded.get(style)).map(([key,pixels])=>{
    const data=new Uint8Array(size*size*4);
    if(size===original)data.set(pixels);
    else for(let y=0;y<size;y++)for(let x=0;x<size;x++){const from=(Math.min(original-1,Math.floor((y+.5)*original/size))*original+Math.min(original-1,Math.floor((x+.5)*original/size)))*4;data.set(pixels.subarray(from,from+4),(y*size+x)*4);}
    return[key,{width:size,height:size,data}];
  }));
}
