/**
 * three.js Material → FBX `Material` node (FbxSurfacePhong).
 *
 * Output properties (names match what FBXLoader.parseParameters reads):
 *   ShadingModel       'Phong'
 *   DiffuseColor       color (sRGB)
 *   DiffuseFactor      1.0
 *   EmissiveColor      emissive
 *   EmissiveFactor     emissiveIntensity (default 1)
 *   AmbientColor       (0,0,0)
 *   AmbientFactor      0.0
 *   TransparentColor   color
 *   TransparencyFactor 1 - alpha
 *   Opacity            alpha
 *   NormalMap          (0,0,0) placeholder
 *   BumpFactor         bump scale
 *   SpecularColor      color
 *   SpecularFactor     specular / 2
 *   Shininess          ((1 - roughness) * 10) ^ 2
 *   ShininessExponent  same
 *   ReflectionColor    color
 *   ReflectionFactor   metallic
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent
 * @param {Material} ctx.material
 * @param {bigint}  ctx.uid
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeMaterial({ parent, material, uid, templates }: {
    parent: any;
    material: any;
    uid: any;
    templates: any;
}): void;
//# sourceMappingURL=material.d.ts.map