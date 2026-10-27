/**
 * three.js Light → FBX `NodeAttribute::Light`.
 *
 * Supported types:
 *   - PointLight        → FBX Point         (LightType=0)
 *   - DirectionalLight  → FBX Directional   (LightType=1)
 *   - SpotLight         → FBX Spot          (LightType=2)
 * HemisphereLight is mapped to Directional.
 * AmbientLight and RectAreaLight fall through to type 0 with a console warning;
 * three.js FBXLoader doesn't support Area on import anyway.
 *
 * FBXLoader.js:1232-1351 reads these specific fields:
 *   LightType   → switch (Point/Directional/Spot/default)
 *   Color       → sRGB → working color (ColorManagement)
 *   Intensity   → × 1/100 (we multiply by 100 here for symmetric round-trip)
 *   FarAttenuationEnd → PointLight.distance / SpotLight.distance
 *   OuterAngle  → SpotLight.angle (degrees → radians)
 *   InnerAngle  → with OuterAngle, computes penumbra = 1 - inner/outer
 *   CastShadows → light.castShadow
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent
 * @param {Light}   ctx.light
 * @param {bigint}  ctx.attrUid
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeLightAttribute({ parent, light, attrUid, templates }: {
    parent: any;
    light: any;
    attrUid: any;
    templates: any;
}): void;
//# sourceMappingURL=light.d.ts.map