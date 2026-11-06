// Indexed parameters keep every repeated effect independent without duplicating shaders.
export const EFFECT_UNIFORMS=`
uniform int uEffectCount,uEffectSelected;
uniform bool uSurfacePreview;
uniform sampler2D uMaskMap2,uMaskMap3;
uniform vec4 uEffectConfig[16],uEffectMeta[16],uEffectData[160];
uniform vec3 uEffectColor[16];
`;
export const EFFECT_PARAMETER_GLSL=`
int surfaceEffectSlot=-1;
float effectParameter(int field,float fallback){if(surfaceEffectSlot<0)return fallback;return uEffectData[surfaceEffectSlot*10+field/4][field%4];}
vec3 effectColor(vec3 fallback){return surfaceEffectSlot<0?fallback:uEffectColor[surfaceEffectSlot];}
bool genericDistribution(){return surfaceEffectSlot>=0&&uEffectMeta[surfaceEffectSlot].w>.5;}
float effectMask(int slot,vec2 uv){if(slot<4)return texture(uMaskMap0,uv)[slot];if(slot<8)return (uPaintPacked?paintSample(uv,uPaintMaskRect):texture(uMaskMap1,uv))[slot-4];if(slot<12)return texture(uMaskMap2,uv)[slot-8];return texture(uMaskMap3,uv)[slot-12];}
#define uMoss effectParameter(0,uMoss)
#define uMossRough effectParameter(1,uMossRough)
#define uMossEnabled effectParameter(2,uMossEnabled)
#define uMossNormalStrength effectParameter(3,uMossNormalStrength)
#define uMossThickness effectParameter(4,uMossThickness)
#define uMossClump effectParameter(5,uMossClump)
#define uMossPorosity effectParameter(6,uMossPorosity)
#define uMossFiberMm effectParameter(7,uMossFiberMm)
#define uMossAO effectParameter(8,uMossAO)
#define uPaintEnabled effectParameter(9,uPaintEnabled)
#define uPaintHeight effectParameter(10,uPaintHeight)
#define uPaintWear effectParameter(11,uPaintWear)
#define uPaintRough effectParameter(12,uPaintRough)
#define uPaintNormalStrength effectParameter(13,uPaintNormalStrength)
#define uPaintBarkKeep effectParameter(14,uPaintBarkKeep)
#define uPaintAO effectParameter(15,uPaintAO)
#define uPaintCoverage effectParameter(16,uPaintCoverage)
#define uPaintDepthAmount effectParameter(17,uPaintDepthAmount)
#define uPaintDepthContrast effectParameter(18,uPaintDepthContrast)
#define uPaintPeel effectParameter(19,uPaintPeel)
#define uPaintPeelSize effectParameter(20,uPaintPeelSize)
#define uPaintPeelEdge effectParameter(21,uPaintPeelEdge)
#define uPaintPeelDetail effectParameter(22,uPaintPeelDetail)
#define uPaintPeelChips effectParameter(23,uPaintPeelChips)
#define uLichen effectParameter(24,uLichen)
#define uLichenEnabled effectParameter(25,uLichenEnabled)
#define uDirt effectParameter(26,uDirt)
#define uDirtEnabled effectParameter(27,uDirtEnabled)
#define uWet effectParameter(28,uWet)
#define uWetEnabled effectParameter(29,uWetEnabled)
#define uVariation effectParameter(30,uVariation)
#define uScale effectParameter(31,uScale)
#define uMossColor effectColor(uMossColor)
#define uPaintColor effectColor(uPaintColor)
`;
