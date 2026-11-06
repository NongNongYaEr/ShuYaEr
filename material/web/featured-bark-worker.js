import {decodeDataPNG} from './png-data.js';
import {generateFeaturedBark} from './featured-bark.js';
import {featuredPNG} from './featured-bark-png.js';
self.onmessage=async({data})=>{try{const source=await decodeDataPNG(data.bytes,'color'),result=generateFeaturedBark(source,data.options,{size:data.size||1536,onProgress:progress=>self.postMessage({progress:progress*.65})}),maps={};for(const [key,value]of [['bark',result.color],['height',result.height16],['normal',result.normal],['roughness',result.roughness]])maps[key]=await featuredPNG(result.width,value,{height16:key==='height'});self.postMessage({done:true,maps,metrics:result.metrics,options:result.options},Object.values(maps).map(m=>m.buffer));}catch(error){self.postMessage({error:error.message});}};
