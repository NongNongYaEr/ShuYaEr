/**
 * FBX PropertyTemplate default tables.
 *
 * Each builder returns a "template definition" describing what defaults a given
 * FBX object type carries. The Definitions section emits these as
 * `ObjectType` → `PropertyTemplate` records; per-instance prop writers consult
 * them via `templateSet` to skip values that already match the defaults.
 *
 * Builder signature: `(settings?, overrides?) -> TemplateDef`
 * Each TemplateDef carries a `users` count we'll bump as we attach instances.
 */
export declare function globalSettingsTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function modelTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function nullTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function lightTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function cameraTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function boneTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function geometryTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function materialTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function textureTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function videoTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function poseTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function deformerTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function animStackTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function animLayerTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function animCurveNodeTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
export declare function animCurveTemplate(settings?: any, overrides?: any): {
    typeName: any;
    propTypeName: any;
    properties: any;
    users: number;
    _written: boolean;
};
/**
 * Bundle all templates a scene might need into a Map keyed by typeName,
 * preserving grouping behaviour: when multiple subtypes share a
 * typeName (NodeAttribute = Null/Light/Camera/LimbNode), the one with the most
 * users wins template selection.
 */
export declare class TemplateBundle {
    _byType: Map<string, any[]>;
    _byKey: Map<string, any>;
    constructor();
    /**
     * Register a template. If one with the same (typeName, propTypeName) already
     * exists, that one is returned (so its `.users` can be incremented).
     */
    register(template: any): any;
    /**
     * For each typeName, pick the dominant subtype's properties.
     * Returns a Map<typeName, { totalUsers, dominant: template }> so the
     * Definitions builder knows what to emit.
     */
    resolved(): Map<any, any>;
    /** Look up the per-type dominant template, used by per-instance property writers. */
    get(typeName: any): any;
    /** Sum of all per-template users — fills `Definitions/Count`. */
    totalUsers(): number;
}
//# sourceMappingURL=templates.d.ts.map