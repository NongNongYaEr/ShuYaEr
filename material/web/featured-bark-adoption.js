import {featuredBarkOptions,featuredBarkSettings} from './featured-bark.js';
import {instantiateLibraryEntry,EFFECT_LIBRARY_BUILTINS} from './effect-library.js';
import {layerIndex} from './surface-layers.js';

export function adoptFeaturedBark(document,options,hashes,{regenerate=false}={}){
 const next=structuredClone(document);
 Object.assign(next.resources,hashes);
 if(!options){
  delete next.featuredBark;
  delete next.resources.featuredBarkSource;
  return next;
 }
 const featured=featuredBarkOptions(options);
 if(!/^[a-f0-9]{64}$/.test(next.resources.featuredBarkSource||''))throw Error('特色树皮源素材缺失。');
 next.featuredBark=featured;
 const {physicalWidthMeters,...settings}=featuredBarkSettings(featured,next.actualHeightMeters);
 next.settings={...next.settings,...(regenerate?{scale:settings.scale,normalDirectX:false}:settings)};
 if(featured.preset==='plane-aged'&&!layerIndex(next.surface).has(next.featuredBarkTransitionGroup)){
  const entry=EFFECT_LIBRARY_BUILTINS.find(e=>e.id==='builtin-featured-plane-aged');
  // The transition is part of the bark finish, under existing attachments.
  const bottom=next.surface.layers[0];
  const added=instantiateLibraryEntry(next,entry,bottom?{targetId:bottom.id,position:'before'}:{});
  next.surface=added.surface;
  next.featuredBarkTransitionGroup=added.id;
 }
 return next;
}
