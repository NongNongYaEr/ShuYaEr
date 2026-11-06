import {featuredPNG} from './featured-bark-png.js';
self.onmessage=async({data})=>{try{const {size,rgba}=data;if(![256,512,1024,2048,4096].includes(size)||!(rgba instanceof Uint8Array)||rgba.length!==size*size*4)throw Error('发光烘焙尺寸无效。');const png=await featuredPNG(size,rgba);self.postMessage({png},[png.buffer]);}catch(error){self.postMessage({error:error.message});}};
