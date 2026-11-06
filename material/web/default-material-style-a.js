// Snapshot explicitly selected by the user. Keep the personal library record untouched.
export const DEFAULT_STYLE_A_ID="cfe50509-6bef-4e35-84b1-22fc86ca53b4";
export const DEFAULT_STYLE_A_SHA256="72d82526cdc4ccb24e58f6ca65b06d202ad5cbd42bf60723a44ec538193ed3d3";
export const DEFAULT_STYLE_A_THUMBNAIL="/assets/effect-library/style-a-72d82526cdc4ccb2.png";
export const DEFAULT_STYLE_A_PRESET={
  "kind": "tree-effect-preset",
  "version": 1,
  "name": "默认材质组合样式A",
  "description": "自存图层预设",
  "tags": [],
  "surfaceRecipe": {
    "version": 5,
    "sourceSHA256": "5cc4196a342a01752ed13ddc46a01f6e338a59ce174e9c741e3e602b0e91c127",
    "partIds": [],
    "surface": {
      "version": 8,
      "active": true,
      "effects": [
        {
          "id": "ef122ec4-6c08-41da-aba3-bb81520d6436",
          "type": "stain",
          "name": "深褐沟槽沉积",
          "enabled": true,
          "locked": false,
          "opacity": 1,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": false,
            "ao": false
          },
          "params": {
            "surfaceColor": "#362a1e",
            "surfaceRoughness": 0.93,
            "surfaceGrainCm": 1,
            "surfaceVariation": 0.25,
            "surfaceAmount": 0.94
          },
          "maskRef": "a31eb546-db67-4ba5-abad-53064800cb43",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "multiply",
              "strength": 1
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          },
          "edgeTreatment": {
            "version": 2,
            "blurCm": 9,
            "spreadCm": 0,
            "amount": 1,
            "resolution": 512
          }
        },
        {
          "id": "bc7e260d-52dd-4036-acb8-45264c83c2be",
          "type": "dust",
          "name": "灰白凸脊风化",
          "enabled": true,
          "locked": false,
          "opacity": 0.82,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": false,
            "ao": false
          },
          "params": {
            "surfaceColor": "#c2b194",
            "surfaceRoughness": 0.96,
            "surfaceNormalStrength": 1,
            "surfaceHeightMm": 0,
            "surfaceGrainCm": 0.4,
            "surfaceVariation": 0.3,
            "surfaceAO": 0.35,
            "surfaceBarkKeep": 1,
            "surfaceAmount": 0.52
          },
          "maskRef": "56f6bdea-8113-41fd-bc83-2bab24d88eff",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "normal",
              "strength": 1
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          },
          "edgeTreatment": {
            "version": 2,
            "blurCm": 13.7,
            "spreadCm": 0,
            "amount": 1,
            "resolution": 512
          }
        },
        {
          "id": "a5f70293-23dd-4d13-88fe-9eb1dcdcdca6",
          "type": "dust",
          "name": "赭色根部沉积",
          "enabled": true,
          "locked": false,
          "opacity": 0.8,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": false,
            "ao": false
          },
          "params": {
            "surfaceColor": "#966034",
            "surfaceRoughness": 0.94,
            "surfaceNormalStrength": 1,
            "surfaceHeightMm": 0,
            "surfaceGrainCm": 0.4,
            "surfaceVariation": 0.45,
            "surfaceAO": 0.35,
            "surfaceBarkKeep": 1,
            "surfaceAmount": 0.8
          },
          "maskRef": "6cf3ed22-5c76-4ce5-aff9-3025716de511",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "normal",
              "strength": 1
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          }
        },
        {
          "id": "705a5b12-7e55-43cc-90d2-808897c3077f",
          "type": "dust",
          "name": "地衣风格薄附着",
          "enabled": true,
          "locked": false,
          "opacity": 1,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": true,
            "ao": true
          },
          "params": {
            "surfaceColor": "#f9f2e1",
            "surfaceRoughness": 0.05,
            "surfaceNormalStrength": 0.9,
            "surfaceHeightMm": 0.16,
            "surfaceGrainCm": 0.16,
            "surfaceVariation": 0.7,
            "surfaceAO": 0.15,
            "surfaceBarkKeep": 1,
            "surfaceAmount": 0.12
          },
          "maskRef": "847305ad-82e8-4eec-b5ee-421c161f2f8e",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "normal",
              "strength": 1
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          },
          "edgeTreatment": {
            "version": 2,
            "blurCm": 6,
            "spreadCm": 0,
            "amount": 1,
            "resolution": 512
          }
        },
        {
          "id": "bcdec81b-3d67-4f1a-b663-b2ac31aff558",
          "type": "wet",
          "name": "接缝湿痕",
          "enabled": true,
          "locked": false,
          "opacity": 0.9,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": false,
            "ao": false
          },
          "params": {
            "wetEnabled": true,
            "wet": 0.9,
            "wetDarken": 0.65,
            "wetRough": 0.24
          },
          "maskRef": "b974f670-6963-4a7a-9f7f-cfba6836321e",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "multiply",
              "strength": 0.65
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          }
        },
        {
          "id": "db8f5952-0d38-46aa-918f-1a32da74201b",
          "type": "moss",
          "name": "根部厚苔",
          "enabled": true,
          "locked": false,
          "opacity": 1,
          "seed": 0,
          "channels": {
            "color": true,
            "roughness": true,
            "height": true,
            "ao": true
          },
          "params": {
            "mossEnabled": true,
            "moss": 0.28,
            "mossColor": "#484f27",
            "mossRough": 0.94,
            "mossNormalStrength": 1.1,
            "mossFiberMm": 0.75,
            "mossPorosity": 0.58,
            "mossThicknessMm": 3,
            "mossClumpCm": 2.5,
            "mossAO": 0.45
          },
          "maskRef": "3fb6cd24-d48f-42d0-8303-dedd3b988114",
          "scopeRef": null,
          "coverageMode": "rules",
          "blend": {
            "version": 1,
            "color": {
              "mode": "normal",
              "strength": 1
            },
            "roughness": {
              "mode": "normal",
              "strength": 1,
              "offset": 0
            },
            "normal": {
              "mode": "material",
              "strength": 1
            },
            "height": {
              "mode": "add",
              "strength": 1
            },
            "ao": {
              "mode": "material",
              "strength": 1
            },
            "conditions": {
              "height": "off",
              "heightSource": "bark",
              "heightStrength": 1,
              "heightBalance": 0.5,
              "heightSoftness": 0.15,
              "heightRangeMm": 5,
              "sourceId": null,
              "dark": 0,
              "light": 1,
              "softness": 0.1,
              "target": "all",
              "targetId": null,
              "excludePaint": false,
              "excludeMoss": false
            }
          }
        }
      ],
      "masks": [
        {
          "id": "a31eb546-db67-4ba5-abad-53064800cb43",
          "name": "深褐沟槽沉积蒙版",
          "initial": 1,
          "items": [
            {
              "id": "183e08e1-f178-4297-8a6e-19906bfc8b36",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 0,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.82,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        },
        {
          "id": "56f6bdea-8113-41fd-bc83-2bab24d88eff",
          "name": "灰白凸脊风化蒙版",
          "initial": 1,
          "items": [
            {
              "id": "84a9009b-ddf6-4587-83b2-b4372fa87086",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 1,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.55,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        },
        {
          "id": "6cf3ed22-5c76-4ce5-aff9-3025716de511",
          "name": "赭色根部沉积蒙版",
          "initial": 1,
          "items": [
            {
              "id": "63b691d5-a7a3-45a2-8054-4d8f42d64909",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 2,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.55,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        },
        {
          "id": "847305ad-82e8-4eec-b5ee-421c161f2f8e",
          "name": "地衣风格薄附着蒙版",
          "initial": 1,
          "items": [
            {
              "id": "78cafe8f-e951-4de5-b410-e4865871577f",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 3,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.33,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        },
        {
          "id": "b974f670-6963-4a7a-9f7f-cfba6836321e",
          "name": "接缝湿痕蒙版",
          "initial": 1,
          "items": [
            {
              "id": "9f8ca7ff-1a16-425c-835e-45edcd3dcf06",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 4,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.97,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        },
        {
          "id": "3fb6cd24-d48f-42d0-8303-dedd3b988114",
          "name": "根部厚苔蒙版",
          "initial": 1,
          "items": [
            {
              "id": "2eaf4682-9a87-4f22-a19a-7395a88e1464",
              "type": "treeauto",
              "enabled": true,
              "strength": 1,
              "combine": "replace",
              "params": {
                "role": 5,
                "recognitionCm": 18,
                "patchCm": 28,
                "density": 0.55,
                "rootHeightMeters": 1.85,
                "edge": 0.08,
                "seed": 0
              }
            }
          ]
        }
      ],
      "areas": [],
      "layers": [
        {
          "id": "7e1fe236-cc5c-4474-9f67-6f3d35b4b579",
          "kind": "group",
          "name": "默认材质组合样式A",
          "enabled": true,
          "locked": false,
          "opacity": 1,
          "children": [
            {
              "id": "ef122ec4-6c08-41da-aba3-bb81520d6436",
              "kind": "effect",
              "effectId": "ef122ec4-6c08-41da-aba3-bb81520d6436"
            },
            {
              "id": "bc7e260d-52dd-4036-acb8-45264c83c2be",
              "kind": "effect",
              "effectId": "bc7e260d-52dd-4036-acb8-45264c83c2be"
            },
            {
              "id": "a5f70293-23dd-4d13-88fe-9eb1dcdcdca6",
              "kind": "effect",
              "effectId": "a5f70293-23dd-4d13-88fe-9eb1dcdcdca6"
            },
            {
              "id": "705a5b12-7e55-43cc-90d2-808897c3077f",
              "kind": "effect",
              "effectId": "705a5b12-7e55-43cc-90d2-808897c3077f"
            },
            {
              "id": "bcdec81b-3d67-4f1a-b663-b2ac31aff558",
              "kind": "effect",
              "effectId": "bcdec81b-3d67-4f1a-b663-b2ac31aff558"
            },
            {
              "id": "db8f5952-0d38-46aa-918f-1a32da74201b",
              "kind": "effect",
              "effectId": "db8f5952-0d38-46aa-918f-1a32da74201b"
            }
          ]
        }
      ],
      "analysis": {
        "curvature": {
          "radiusMeters": 0.1
        }
      }
    }
  }
};
