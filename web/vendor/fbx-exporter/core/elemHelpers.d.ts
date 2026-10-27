/**
 * Every helper returns the created FBXElem so callers can chain or attach children.
 */
import { FBXElem } from './FBXElem.js';
export declare const elemEmpty: (parent: any, name: any) => any;
export declare const elemDataSingleBool: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleChar: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt8: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt16: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt32: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt64: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleFloat32: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleFloat64: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleBytes: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleString: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt32Array: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleInt64Array: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleFloat32Array: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleFloat64Array: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleBoolArray: (p: any, n: any, v: any) => FBXElem;
export declare const elemDataSingleByteArray: (p: any, n: any, v: any) => FBXElem;
/**
 * Encode a (name, class) pair as a single FBX object-id string.
 *
 * Mirrors `fbx_utils.py: fbx_name_class` (line 1891) which joins with the
 * `\x00\x01` separator. The leading null is significant: FBXLoader's binary
 * reader (`BinaryReader.getString`, FBXLoader.js:4265-4266) truncates at the
 * first null, so on import `attrName` becomes the bare name and the class
 * suffix is silently dropped. Maya / Unreal honor the full separator.
 */
export declare function fbxNameClass(name: any, cls: any): string;
/** @type {Record<string, [string, string, ...string[]]>} */
export declare const PTYPES: {
    p_bool: string[];
    p_integer: string[];
    p_ulonglong: string[];
    p_double: string[];
    p_number: string[];
    p_enum: string[];
    p_vector_3d: string[];
    p_vector: string[];
    p_color_rgb: string[];
    p_color: string[];
    p_string: string[];
    p_string_url: string[];
    p_timestamp: string[];
    p_datetime: string[];
    p_object: string[];
    p_compound: string[];
    p_lcl_translation: string[];
    p_lcl_rotation: string[];
    p_lcl_scaling: string[];
    p_visibility: string[];
    p_visibility_inheritance: string[];
    p_roll: string[];
    p_opticalcenterx: string[];
    p_opticalcentery: string[];
    p_fov: string[];
    p_fov_x: string[];
    p_fov_y: string[];
};
/** Add a `Properties70` child to `elem` and return it. */
export declare function elemProperties(elem: any): any;
/**
 * Write a single property record into a Properties70 element.
 * @param {FBXElem} propsElem - the Properties70 element
 * @param {string} ptype      - one of PTYPES keys (e.g. 'p_double')
 * @param {string} name       - FBX property name (e.g. 'Lcl Translation')
 * @param {*} value           - scalar or [x,y,z]
 */
export declare function elemPropsSet(propsElem: any, ptype: string, name: string, value?: any, { animatable, animated, custom, }?: {
    animatable?: boolean;
    animated?: boolean;
    custom?: boolean;
}): void;
/**
 * @typedef {Object} TemplateEntry
 * @property {*} value
 * @property {string} ptype
 * @property {boolean} animatable
 */
/**
 * @typedef {Object} TemplateDef
 * @property {string} typeName       e.g. 'Model'
 * @property {string} propTypeName   e.g. 'FbxNode'
 * @property {Record<string, TemplateEntry>} properties
 */
/** Build a per-instance "working copy" of a template's properties. */
export declare function templateInit(templates: any, typeName: string): Record<string, any>;
/**
 * Write a per-instance P record. three.js FBXLoader reads per-instance
 * Properties70 directly without consulting Definitions templates for
 * fallback (FBXLoader.js:1346 et al.), so a skipped property that matches
 * our template default would silently regress on round-trip (e.g.
 * CastShadows=true matching default true → skipped → FBXLoader defaults
 * false).
 */
export declare function templateSet(working: any, propsElem: any, ptype: any, name: any, value: any, { animatable, animated, }?: {
    animatable?: boolean;
    animated?: boolean;
}): void;
export declare function templateFinalize(_working: any, _propsElem: any): void;
//# sourceMappingURL=elemHelpers.d.ts.map