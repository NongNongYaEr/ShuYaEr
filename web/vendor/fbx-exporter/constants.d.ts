/**
 * Versions and magic numbers used throughout the exporter.
 */
export declare const FBX_VERSION = 7400;
export declare const FBX_HEADER_VERSION = 1003;
export declare const FBX_SCENEINFO_VERSION = 100;
export declare const FBX_TEMPLATES_VERSION = 100;
export declare const FBX_MODELS_VERSION = 232;
export declare const FBX_GEOMETRY_VERSION = 124;
export declare const FBX_POSE_BIND_VERSION = 100;
export declare const FBX_ANIM_KEY_VERSION = 4008;
export declare const FBX_GEOMETRY_NORMAL_VERSION = 101;
export declare const FBX_GEOMETRY_BINORMAL_VERSION = 101;
export declare const FBX_GEOMETRY_TANGENT_VERSION = 101;
export declare const FBX_GEOMETRY_SMOOTHING_VERSION = 102;
export declare const FBX_GEOMETRY_VCOLOR_VERSION = 101;
export declare const FBX_GEOMETRY_UV_VERSION = 101;
export declare const FBX_GEOMETRY_MATERIAL_VERSION = 101;
export declare const FBX_GEOMETRY_LAYER_VERSION = 100;
export declare const FBX_MATERIAL_VERSION = 102;
export declare const FBX_TEXTURE_VERSION = 202;
export declare const FBX_DEFORMER_SKIN_VERSION = 101;
export declare const FBX_DEFORMER_CLUSTER_VERSION = 100;
export declare const FBX_GEOMETRY_SHAPE_VERSION = 100;
export declare const FBX_DEFORMER_SHAPE_VERSION = 100;
export declare const FBX_DEFORMER_SHAPECHANNEL_VERSION = 100;
export declare const FBX_KTIME_V7 = 46186158000n;
export declare const FBX_KTIME_V8 = 141120000n;
export declare const FBX_KTIME: bigint;
/**
 * Axis-pair → (UpAxis, FrontAxis, CoordAxis) encoding used in GlobalSettings.
 * Each entry is `[axis, sign]`; axis is 0=X, 1=Y, 2=Z. Right-handed only.
 * Mirrors fbx_utils.py: RIGHT_HAND_AXES.
 */
export declare const RIGHT_HAND_AXES: {
    "X|-Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "X|Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "X|-Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "X|Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-X|-Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-X|Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-X|-Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-X|Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Y|-X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Y|X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Y|-Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Y|Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Y|-X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Y|X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Y|-Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Y|Z": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Z|-X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Z|X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Z|-Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "Z|Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Z|-X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Z|X": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Z|-Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
    "-Z|Y": {
        up: number[];
        front: number[];
        coord: number[];
    };
};
/** FBX TimeMode enum values keyed by an approximate framerate. */
export declare const FBX_FRAMERATES: {
    fps: number;
    mode: number;
}[];
export declare const APP_VENDOR = "Comfy Org";
export declare const APP_NAME = "@comfyorg/fbx-exporter-three";
export declare const APP_VERSION = "1.0.0";
//# sourceMappingURL=constants.d.ts.map