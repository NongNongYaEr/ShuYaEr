import fs from 'node:fs';import {atomic,readJSON} from './plant-pack-container.mjs';import {trunkLibraryCommand} from './trunk-model-library.mjs';
const [root,operation,input,output]=process.argv.slice(2);
try{const result=await trunkLibraryCommand(root,operation,input?readJSON(input):{});atomic(output,result);}catch(error){atomic(output,{success:false,message:error.message});process.exitCode=1;}
