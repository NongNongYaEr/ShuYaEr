import {adoptFeaturedBark} from './featured-bark-adoption.js';import {featuredBarkSettings} from './featured-bark.js';
import {adoptSculptBark} from './sculpt-bark-adoption.js';import {sculptBarkSettings} from './sculpt-bark-generator.js';
import {rebaseSculptMaterial} from './sculpt-material-rules.js';
export function adoptLibraryMaterial(document,settings,asset,hashes,{hasFlow=false}={}){
 // Remove the previous response multiplier before choosing a new substrate.
 // Repeatedly switching ordinary catalog entries must not multiply skin strength.
 let nextSettings={...settings,...(document?.sculptMaterial?.anchor||{})},next=document?adoptSculptBark(adoptFeaturedBark({...document,settings:nextSettings},asset.featuredBark||null,hashes),asset.sculptBark||null,hashes):null;
 for(const options of [asset.sculptBark?sculptBarkSettings(asset.sculptBark,document?.actualHeightMeters||10):null,asset.featuredBark?featuredBarkSettings(asset.featuredBark,document?.actualHeightMeters||10):null])if(options){const{physicalWidthMeters,...values}=options;Object.assign(nextSettings,values);}
 if(asset.sculptCatalog){for(const k of ['normalStrength','barkReliefMm','barkCavity','bump','rough','reliefMm','detail','barkStyle'])if(asset.suggested?.[k]!=null)nextSettings[k]=asset.suggested[k];Object.assign(nextSettings,{scale:(document?.actualHeightMeters||10)/asset.sculptCatalog.physicalWidthMeters,directional:asset.sculptCatalog.directional,...(asset.sculptCatalog.directional&&hasFlow?{directionMode:3}:{})});}
 if(hashes.normal)Object.assign(nextSettings,{normalDirectX:asset.normalConvention==='DirectX',heightWithNormal:false});
 if(next){next=rebaseSculptMaterial({...next,settings:nextSettings});nextSettings=next.settings;}
 return{document:next,settings:nextSettings};
}
