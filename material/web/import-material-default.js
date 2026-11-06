import {DEFAULT_STYLE_A_PRESET} from './default-material-style-a.js';
import {instantiateLibraryEntry} from './effect-library.js';
import {SURFACE_VERSION} from './surface-effects.js';
// Only new imports/prepared source drafts call this. Opening an existing project
// and preparing its already adopted source retain the author's layer stack.
export function applyDefaultImportMaterial(document){
 const empty={version:SURFACE_VERSION,active:true,effects:[],masks:[],areas:[],layers:[],analysis:structuredClone(DEFAULT_STYLE_A_PRESET.surfaceRecipe.surface.analysis)};
 return instantiateLibraryEntry({...document,surface:empty},DEFAULT_STYLE_A_PRESET).surface;
}
