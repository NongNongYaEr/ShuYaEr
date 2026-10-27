import {generateBarkCompanionMaps} from './bark-map-generator.js';

self.onmessage=event=>{
  try{
    const maps=generateBarkCompanionMaps(event.data.image,event.data.options);
    self.postMessage({maps},[maps.normal.data.buffer,maps.roughness.data.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
