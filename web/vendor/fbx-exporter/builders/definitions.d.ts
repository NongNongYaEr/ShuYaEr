/**
 * Emit the `Definitions` section: one `ObjectType` per scene-used type, each
 * carrying a `PropertyTemplate` with that type's default property values.
 *
 * Mirrors `export_fbx_bin.py: fbx_definitions_elements` +
 * `fbx_utils.py: fbx_templates_generate`.
 */
/**
 * @param {object} ctx
 * @param {object} ctx.root
 * @param {import('../core/templates.js').TemplateBundle} ctx.templates
 */
export declare function writeDefinitionsSection({ root, templates }: {
    root: any;
    templates: any;
}): void;
//# sourceMappingURL=definitions.d.ts.map