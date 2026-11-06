// A single style sample on the fixed 25 cm ball. This does not illustrate the
// requested count or the model's placement analysis.
export function burlPreviewCompilation(mesh){return{origin:'burl-generator',kind:'source-local-patch-compilation',version:1,sourceSHA256:mesh.sourceSHA256,key:'burl-style-sphere-v1',faceMasks:new Uint8Array(mesh.indices.length/3).fill(1),affectedFaces:mesh.indices.length/3,stats:[],descriptors:[{id:'burl-style-sphere',origin:[.5,.5,1,.4],u:[2.78,0,0,.9],v:[0,2.78,0,.048],n:[0,0,1,.01],color:[.45,.34,.25,1],shape:[5,.18,18,17],channels:[1,1,1,1]}]};}
