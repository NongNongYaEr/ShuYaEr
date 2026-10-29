// Copyright OpenAI Codex. All Rights Reserved.

#include "Internationalization/PolyglotTextData.h"
#include "Internationalization/TextLocalizationManager.h"
#include "Modules/ModuleManager.h"
#include "UObject/Class.h"
#include "UObject/Package.h"
#include "UObject/UnrealType.h"
#include "UObject/UObjectIterator.h"
#include "BranchForgeExportRouting.h"

#define LOCTEXT_NAMESPACE "FDay30ProceduralVegetationZhModule"

namespace Day30::ProceduralVegetationZh
{
	constexpr const TCHAR* ScriptPackageName = TEXT("/Script/ProceduralVegetation");

	struct FNodeTextEntry
	{
		const TCHAR* Namespace;
		const TCHAR* Key;
		const TCHAR* Native;
		const TCHAR* Chinese;
	};

	struct FTextMetaEntry
	{
		const TCHAR* Name;
		const TCHAR* Chinese;
	};

	struct FToolTipEntry
	{
		const TCHAR* Name;
		const TCHAR* Chinese;
	};

	struct FEnumValueTextEntry
	{
		const TCHAR* EnumName;
		const TCHAR* ValueName;
		const TCHAR* Chinese;
	};

	const FNodeTextEntry NodeTextEntries[] =
	{
		{ TEXT("PVGrowerSettings"), TEXT("NodeTitle"), TEXT("Grower"), TEXT("生长器") },
		{ TEXT("PVGrowerSettings"), TEXT("NodeTooltip"), TEXT("Grow a plant from a seed point using hormone-driven simulation.\n\nThe core PVE node. Takes one or more seed points and runs a multi-cycle growth simulation that produces a branch skeleton. When no seed is provided a default is automatically produced internally. Configure every aspect of growth — phyllotaxy, gravity, phototropism, senescence, bifurcation, foliage — through this node's inline parameters or via Standalone Override nodes."), TEXT("从种子点开始，通过激素驱动的模拟生长一株植物。\n\n这是程序化植被的核心节点。它接收一个或多个种子点，执行多轮生长模拟并生成枝干骨架。没有输入种子时会自动生成一个默认种子。你可以在本节点内联参数中配置叶序、重力、向光性、衰老、分叉、叶片等生长要素，也可以通过独立的设置节点进行覆盖。") },
		{ TEXT("PVGrowerTrunkGrowthSettings"), TEXT("NodeTitle"), TEXT("Grower Growth Settings"), TEXT("生长器：主干生长设置") },
		{ TEXT("PVPhyllotaxySettings"), TEXT("NodeTitle"), TEXT("Grower Phyllotaxy Settings"), TEXT("生长器：叶序设置") },
		{ TEXT("PVGrowerPhototropismSettings"), TEXT("NodeTitle"), TEXT("Grower Phototropism Settings"), TEXT("生长器：向光性设置") },
		{ TEXT("PVGrowerGravitySettings"), TEXT("NodeTitle"), TEXT("Grower Gravity Settings"), TEXT("生长器：重力设置") },
		{ TEXT("PVGrowerAuxinSettings"), TEXT("NodeTitle"), TEXT("Grower Auxin Settings"), TEXT("生长器：生长素设置") },
		{ TEXT("PVGrowerBifurcationSettings"), TEXT("NodeTitle"), TEXT("Grower Bifurcation Settings"), TEXT("生长器：分叉设置") },
		{ TEXT("PVGrowerDirectionalSettings"), TEXT("NodeTitle"), TEXT("Grower Directional Settings"), TEXT("生长器：方向随机设置") },
		{ TEXT("PVGrowerFoliageSettings"), TEXT("NodeTitle"), TEXT("Grower Foliage Settings"), TEXT("生长器：叶片设置") },
		{ TEXT("PVGrowerAgeSenescenceSettings"), TEXT("NodeTitle"), TEXT("Grower Age Senescence Settings"), TEXT("生长器：年龄衰老设置") },
		{ TEXT("PVGrowerLightSenescenceSettings"), TEXT("NodeTitle"), TEXT("Grower Light Senescence Settings"), TEXT("生长器：光照衰老设置") },
		{ TEXT("UPVSeedGeneratorSettings"), TEXT("NodeTitle"), TEXT("Seed Generator"), TEXT("种子生成器") },
		{ TEXT("UPVSeedGeneratorSettings"), TEXT("NodeTooltip"), TEXT("Convert PCG point data into Procedural Vegetation seed points.\n\nTakes PCG point data as input and produces seed points the Grower can consume. Each input point becomes one seed; per-seed parameters can bias the initial growth direction to avoid nearby seeds or the cluster center, producing more naturally spaced plant populations."), TEXT("将 PCG 点数据转换为程序化植被种子点。\n\n输入 PCG 点数据，并生成可供生长器使用的种子点。每个输入点会成为一个种子；每个种子的参数可以偏置初始生长方向，用于避开附近种子或群集中心，从而得到更自然的植物间距。") },
		{ TEXT("UPVPointScatterSettings"), TEXT("NodeTitle"), TEXT("Point Scatter"), TEXT("点散射") },
		{ TEXT("PVMeshBuilderSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder"), TEXT("网格构建器") },
		{ TEXT("PVMeshBuilderMeshDetailSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Mesh Detail Settings"), TEXT("网格构建器：网格细节设置") },
		{ TEXT("PVMeshBuilderProfileDetailSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Profile Detail Settings"), TEXT("网格构建器：截面轮廓设置") },
		{ TEXT("PVMeshBuilderBranchRadiusSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Branch Radius Settings"), TEXT("网格构建器：枝条半径设置") },
		{ TEXT("PVMeshBuilderDisplacementSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Displacement Settings"), TEXT("网格构建器：置换设置") },
		{ TEXT("PVMeshBuilderSkeletonShapingSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Skeleton Shaping Settings"), TEXT("网格构建器：骨架塑形设置") },
		{ TEXT("PVMeshBuilderMaterialDetailSettings"), TEXT("NodeTitle"), TEXT("Mesh Builder Material Detail Settings"), TEXT("网格构建器：材质细节设置") },
		{ TEXT("PVFoliagePaletteSettings"), TEXT("NodeTitle"), TEXT("Foliage Palette"), TEXT("叶片资产调色板") },
		{ TEXT("PVFoliageDistributorSettings"), TEXT("NodeTitle"), TEXT("Foliage Distributor"), TEXT("叶片分布器") },
		{ TEXT("PVDistributionParametricSettings"), TEXT("NodeTitle"), TEXT("Distribution Parametric Settings"), TEXT("分布：参数化设置") },
		{ TEXT("PVDistributionHormoneBasedSettings"), TEXT("NodeTitle"), TEXT("Distribution Hormone Based Settings"), TEXT("分布：激素驱动设置") },
		{ TEXT("PVDistributionVectorSettings"), TEXT("NodeTitle"), TEXT("Distribution Vector Settings"), TEXT("分布：朝向向量设置") },
		{ TEXT("PVDistributionConditionSettings"), TEXT("NodeTitle"), TEXT("Distribution Condition Settings"), TEXT("分布：条件过滤设置") },
		{ TEXT("PVExportSettings"), TEXT("NodeTitle"), TEXT("Export"), TEXT("导出") }
	};

	const FTextMetaEntry CategoryEntries[] =
	{
		{ TEXT("Preset"), TEXT("预设") },
		{ TEXT("Settings"), TEXT("设置") },
		{ TEXT("Asset"), TEXT("资产") },
		{ TEXT("Mesh"), TEXT("网格") },
		{ TEXT("Nanite"), TEXT("Nanite") },
		{ TEXT("Collision"), TEXT("碰撞") },
		{ TEXT("Dynamic Wind"), TEXT("动态风") },
		{ TEXT("Basic"), TEXT("基础") },
		{ TEXT("Basic Settings"), TEXT("基础设置") },
		{ TEXT("Meshes"), TEXT("网格资产") },
		{ TEXT("Materials"), TEXT("材质") },
		{ TEXT("Displacement"), TEXT("置换") },
		{ TEXT("Skeleton Shaping"), TEXT("骨架塑形") },
		{ TEXT("Mesh Details"), TEXT("网格细节") },
		{ TEXT("Profile Details"), TEXT("截面轮廓") },
		{ TEXT("Branch Radius"), TEXT("枝条半径") },
		{ TEXT("Advanced"), TEXT("高级") },
		{ TEXT("Growth"), TEXT("生长") },
		{ TEXT("Phyllotaxy"), TEXT("叶序") },
		{ TEXT("Trunk"), TEXT("主干") },
		{ TEXT("Branch"), TEXT("分支") },
		{ TEXT("Leaf"), TEXT("叶片") },
		{ TEXT("Foliage"), TEXT("叶片") },
		{ TEXT("Gravity"), TEXT("重力") },
		{ TEXT("Bifurcation"), TEXT("分叉") },
		{ TEXT("Directional"), TEXT("方向随机") },
		{ TEXT("Auxin"), TEXT("生长素") },
		{ TEXT("Phototropism"), TEXT("向光性") },
		{ TEXT("Object Interaction"), TEXT("物体交互") },
		{ TEXT("Target"), TEXT("目标") },
		{ TEXT("Targets"), TEXT("目标") },
		{ TEXT("Branching"), TEXT("分枝") },
		{ TEXT("RandomAngle"), TEXT("随机角度") },
		{ TEXT("Behavior"), TEXT("行为") },
		{ TEXT("Axial Angle"), TEXT("轴向角度") },
		{ TEXT("Hormone Control"), TEXT("激素控制") },
		{ TEXT("Hormone Controls"), TEXT("激素控制") },
		{ TEXT("Phototropic Settings"), TEXT("向光性设置") },
		{ TEXT("Photosynthetic Impact"), TEXT("光合作用影响") },
		{ TEXT("Reinforcement"), TEXT("强化") },
		{ TEXT("Cell Density"), TEXT("细胞密度") },
		{ TEXT("Advanced Auxin Controls"), TEXT("高级生长素控制") },
		{ TEXT("Advanced Globals"), TEXT("高级全局") },
		{ TEXT("Axillary Resources"), TEXT("侧芽资源") },
		{ TEXT("Apical Resources"), TEXT("顶芽资源") },
		{ TEXT("Gravity Senescence/Abscision"), TEXT("重力衰老/脱落") },
		{ TEXT("Light Senescence/Abscission"), TEXT("光照衰老/脱落") },
		{ TEXT("AvoidanceSettings"), TEXT("避让设置") },
		{ TEXT("Foliage Settings"), TEXT("叶片设置") },
		{ TEXT("TrunkGrowthSettings"), TEXT("主干生长设置") },
		{ TEXT("PhyllotaxySettings"), TEXT("叶序设置") },
		{ TEXT("PhototropismSettings"), TEXT("向光性设置") },
		{ TEXT("GravitySetttings"), TEXT("重力设置") },
		{ TEXT("AuxinSettings"), TEXT("生长素设置") },
		{ TEXT("BifurcationSettings"), TEXT("分叉设置") },
		{ TEXT("DirectionalSettings"), TEXT("方向随机设置") },
		{ TEXT("AgeSenescence"), TEXT("年龄衰老") },
		{ TEXT("LightSenescence"), TEXT("光照衰老") },
		{ TEXT("Distribution Settings Mode"), TEXT("分布模式") },
		{ TEXT("Distribution Settings"), TEXT("分布设置") },
		{ TEXT("Parametric Settings"), TEXT("参数化设置") },
		{ TEXT("Hormone Based Settings"), TEXT("激素驱动设置") },
		{ TEXT("Vector Settings"), TEXT("向量设置") },
		{ TEXT("ConditionSettings"), TEXT("条件过滤") },
		{ TEXT("Misc Settings"), TEXT("杂项设置") },
		{ TEXT("AimVectorSettings"), TEXT("指向向量设置") },
		{ TEXT("FaceVectorSettings"), TEXT("朝面向量设置") },
		{ TEXT("RollPitchYawSettings"), TEXT("滚转/俯仰/偏航设置") },
		{ TEXT("Scale Settings"), TEXT("缩放设置") },
		{ TEXT("Angle Settings"), TEXT("角度设置") },
		{ TEXT("Spacing Settings"), TEXT("间距设置") },
		{ TEXT("Phyllotaxy Settings"), TEXT("叶序设置") },
		{ TEXT("Collider"), TEXT("碰撞体") },
		{ TEXT("Colliders"), TEXT("碰撞体列表") },
		{ TEXT("Loop Debug"), TEXT("循环调试") },
		{ TEXT("Seed"), TEXT("种子") }
	};

	const FTextMetaEntry DisplayNameEntries[] =
	{
		{ TEXT("Preset"), TEXT("预设") },
		{ TEXT("GrowerParams"), TEXT("生长器参数") },
		{ TEXT("Params"), TEXT("参数") },
		{ TEXT("ParamsWithTargets"), TEXT("带目标参数") },
		{ TEXT("ExportSettings"), TEXT("导出设置") },
		{ TEXT("ContentBrowserFolder"), TEXT("内容浏览器文件夹") },
		{ TEXT("MeshName"), TEXT("网格名称") },
		{ TEXT("ReplacePolicy"), TEXT("资产替换策略") },
		{ TEXT("ExportMeshType"), TEXT("导出网格类型") },
		{ TEXT("bCreateNaniteFoliage"), TEXT("创建 Nanite Foliage") },
		{ TEXT("NaniteShapePreservation"), TEXT("Nanite 形状保留方式") },
		{ TEXT("bCollision"), TEXT("生成碰撞") },
		{ TEXT("CollisionGeneration"), TEXT("碰撞生成范围") },
		{ TEXT("WindSettings"), TEXT("风设置") },
		{ TEXT("MesherSettings"), TEXT("网格构建参数") },
		{ TEXT("MeshDetails"), TEXT("网格细节") },
		{ TEXT("ProfileDetails"), TEXT("截面轮廓") },
		{ TEXT("BranchRadius"), TEXT("枝条半径") },
		{ TEXT("Displacement"), TEXT("置换") },
		{ TEXT("SkeletonShaping"), TEXT("骨架塑形") },
		{ TEXT("MaterialDetails"), TEXT("材质细节") },
		{ TEXT("SkeletonResolution"), TEXT("骨架分段精度") },
		{ TEXT("PointRemoval"), TEXT("点移除") },
		{ TEXT("SegmentReduction"), TEXT("段简化") },
		{ TEXT("MinDivisions"), TEXT("最小径向分段") },
		{ TEXT("MaxDivisions"), TEXT("最大径向分段") },
		{ TEXT("AddEndCaps"), TEXT("添加端盖") },
		{ TEXT("Accuracy"), TEXT("简化精度") },
		{ TEXT("LongestSegmentLength"), TEXT("允许最长段长") },
		{ TEXT("ShortestSegmentLength"), TEXT("允许最短段长") },
		{ TEXT("SegmentRetentionImpact"), TEXT("段保留影响") },
		{ TEXT("HullRetention"), TEXT("外轮廓保留") },
		{ TEXT("MainTrunkRetention"), TEXT("主干保留") },
		{ TEXT("GroundRetention"), TEXT("地面区域保留") },
		{ TEXT("HullRetentionGradient"), TEXT("外轮廓保留曲线") },
		{ TEXT("MainTrunkRetentionGradient"), TEXT("主干保留曲线") },
		{ TEXT("GroundRetentionGradient"), TEXT("地面区域保留曲线") },
		{ TEXT("ScaleRetention"), TEXT("尺寸保留") },
		{ TEXT("ScaleRetentionGradient"), TEXT("尺寸保留曲线") },
		{ TEXT("FallOff"), TEXT("衰减曲线") },
		{ TEXT("bApplyToBranches"), TEXT("应用到分支") },
		{ TEXT("DaVinciRuleStrength"), TEXT("达芬奇规则强度") },
		{ TEXT("GenerationRamps"), TEXT("分代半径曲线") },
		{ TEXT("GenerationScales"), TEXT("分代半径缩放") },
		{ TEXT("MinRadius"), TEXT("最小半径") },
		{ TEXT("Texture"), TEXT("纹理") },
		{ TEXT("Strength"), TEXT("强度") },
		{ TEXT("Bias"), TEXT("偏置") },
		{ TEXT("UVScale"), TEXT("UV 缩放") },
		{ TEXT("GenerationUpperLimit"), TEXT("作用最高代数") },
		{ TEXT("Entries"), TEXT("条目") },
		{ TEXT("Generation"), TEXT("代数") },
		{ TEXT("bImpactRemainingGenerations"), TEXT("影响后续代数") },
		{ TEXT("NoiseStrength"), TEXT("噪声强度") },
		{ TEXT("NoiseFrequency"), TEXT("噪声频率") },
		{ TEXT("NoiseSeed"), TEXT("噪声种子") },
		{ TEXT("Smoothness"), TEXT("平滑度") },
		{ TEXT("FoliageInfos"), TEXT("叶片资产列表") },
		{ TEXT("bOverrideFoliage"), TEXT("覆盖叶片资产") },
		{ TEXT("Mode"), TEXT("模式") },
		{ TEXT("ParametricSettings"), TEXT("参数化设置") },
		{ TEXT("HormoneBasedSettings"), TEXT("激素驱动设置") },
		{ TEXT("VectorSettings"), TEXT("向量设置") },
		{ TEXT("ConditionSettings"), TEXT("条件过滤") },
		{ TEXT("ChainMaskDistance"), TEXT("链式遮罩距离") },
		{ TEXT("TrunkOffset"), TEXT("主干偏移") },
		{ TEXT("CutoffThreshold"), TEXT("过滤阈值") },
		{ TEXT("MinimumCandidates"), TEXT("最少候选数") },
		{ TEXT("bActivateLight"), TEXT("启用光照条件") },
		{ TEXT("bActivateScale"), TEXT("启用缩放条件") },
		{ TEXT("bActivateUpAlignment"), TEXT("启用朝上对齐条件") },
		{ TEXT("bActivateTip"), TEXT("启用枝梢条件") },
		{ TEXT("bActivateHealth"), TEXT("启用健康度条件") },
		{ TEXT("bActivateHeight"), TEXT("启用高度条件") },
		{ TEXT("bActivateGeneration"), TEXT("启用代数条件") },
		{ TEXT("Weight"), TEXT("权重") },
		{ TEXT("AimVectorSettings"), TEXT("指向向量设置") },
		{ TEXT("FaceVectorSettings"), TEXT("朝面向量设置") },
		{ TEXT("RollPitchYawSettings"), TEXT("滚转/俯仰/偏航设置") },
		{ TEXT("bAffectTip"), TEXT("影响枝梢") },
		{ TEXT("BlendAttribute"), TEXT("混合属性") },
		{ TEXT("bDualVectors"), TEXT("使用双向量") },
		{ TEXT("Vector1"), TEXT("向量 1") },
		{ TEXT("Vector1Axis"), TEXT("向量 1 轴向") },
		{ TEXT("Vector1Strength"), TEXT("向量 1 强度") },
		{ TEXT("Vector2"), TEXT("向量 2") },
		{ TEXT("Vector2Axis"), TEXT("向量 2 轴向") },
		{ TEXT("Vector2Strength"), TEXT("向量 2 强度") },
		{ TEXT("VectorRamp"), TEXT("向量混合曲线") },
		{ TEXT("bAutoAlignEnd"), TEXT("自动对齐末端") },
		{ TEXT("AimVectors"), TEXT("指向向量列表") },
		{ TEXT("FaceVectors"), TEXT("朝面向量列表") },
		{ TEXT("RollPitchYaw"), TEXT("随机旋转列表") },
		{ TEXT("MinStrength"), TEXT("最小强度") },
		{ TEXT("MaxStrength"), TEXT("最大强度") },
		{ TEXT("DistributionSettings"), TEXT("分布设置") },
		{ TEXT("ScaleSettings"), TEXT("缩放设置") },
		{ TEXT("AngleSettings"), TEXT("角度设置") },
		{ TEXT("SpacingSettings"), TEXT("间距设置") },
		{ TEXT("InstanceSpacing"), TEXT("实例间距") },
		{ TEXT("InstanceSpacingRamp"), TEXT("实例间距曲线") },
		{ TEXT("InstanceSpacingRampEffect"), TEXT("实例间距曲线影响") },
		{ TEXT("MaxPerBranch"), TEXT("每枝最大数量") },
		{ TEXT("BaseScale"), TEXT("基础缩放") },
		{ TEXT("BranchScaleImpact"), TEXT("枝条尺寸影响") },
		{ TEXT("MinScale"), TEXT("最小缩放") },
		{ TEXT("MaxScale"), TEXT("最大缩放") },
		{ TEXT("RandomScaleMin"), TEXT("随机缩放最小值") },
		{ TEXT("RandomScaleMax"), TEXT("随机缩放最大值") },
		{ TEXT("ScaleRamp"), TEXT("缩放曲线") },
		{ TEXT("OverrideAxilAngle"), TEXT("覆盖腋角") },
		{ TEXT("AxilAngleRamp"), TEXT("腋角曲线") },
		{ TEXT("AxilAngleRampUpperValue"), TEXT("腋角曲线上限") },
		{ TEXT("AxilAngleRampEffect"), TEXT("腋角曲线影响") },
		{ TEXT("ResetPhyllotaxy"), TEXT("重置叶序") },
		{ TEXT("PhyllotaxyType"), TEXT("叶序类型") },
		{ TEXT("PhyllotaxyFormation"), TEXT("叶序排列") },
		{ TEXT("MinimumNodeBuds"), TEXT("节点最少芽数") },
		{ TEXT("MaximumNodeBuds"), TEXT("节点最多芽数") },
		{ TEXT("bSingleBudTip"), TEXT("枝梢单芽") },
		{ TEXT("PhyllotaxyAdditionalAngle"), TEXT("叶序附加角度") },
		{ TEXT("PhyllotaxyOffset"), TEXT("叶序偏移") },
		{ TEXT("BranchDensity"), TEXT("分支密度") },
		{ TEXT("RelativeStart"), TEXT("相对起点") },
		{ TEXT("RelativeEnd"), TEXT("相对终点") },
		{ TEXT("LimitStartGeneration"), TEXT("限制起始代数") },
		{ TEXT("StartGeneration"), TEXT("起始代数") },
		{ TEXT("LimitEndGeneration"), TEXT("限制结束代数") },
		{ TEXT("EndGeneration"), TEXT("结束代数") },
		{ TEXT("SpacingBasis"), TEXT("间距基准") },
		{ TEXT("SpacingRamp"), TEXT("间距曲线") },
		{ TEXT("Rotation"), TEXT("旋转") },
		{ TEXT("RandomizeAxilAngleMinimum"), TEXT("随机腋角最小值") },
		{ TEXT("RandomizeAxilAngleMaximum"), TEXT("随机腋角最大值") },
		{ TEXT("AxilAngleRampBasis"), TEXT("腋角曲线基准") },
		{ TEXT("ScaleRampBasis"), TEXT("缩放曲线基准") },
		{ TEXT("RandomizeScaleMinimum"), TEXT("随机缩放最小值") },
		{ TEXT("RandomizeScaleMaximum"), TEXT("随机缩放最大值") },
		{ TEXT("ObjectInteractionSettings"), TEXT("物体交互设置") },
		{ TEXT("Colliders"), TEXT("碰撞体列表") },
		{ TEXT("Targets"), TEXT("作用目标") },
		{ TEXT("GrowthCycles"), TEXT("生长周期") },
		{ TEXT("RandomSeed"), TEXT("随机种子") },
		{ TEXT("Phyllotaxy"), TEXT("主干叶序") },
		{ TEXT("BranchPhyllotaxy"), TEXT("分支叶序") },
		{ TEXT("LeafPhyllotaxy"), TEXT("叶片叶序") },
		{ TEXT("bBranchPhyllotaxySameAsTrunk"), TEXT("分支使用主干叶序") },
		{ TEXT("bLeafPhyllotaxySameAsBranch"), TEXT("叶片使用分支叶序") },
		{ TEXT("TrunkGrowth"), TEXT("主干生长") },
		{ TEXT("Phototropism"), TEXT("主干向光性") },
		{ TEXT("BranchPhototropism"), TEXT("分支向光性") },
		{ TEXT("bBranchPhototropismSameAsTrunk"), TEXT("分支使用主干向光性") },
		{ TEXT("LightSenescence"), TEXT("光照衰老") },
		{ TEXT("GravityParams"), TEXT("重力参数") },
		{ TEXT("bSenescence"), TEXT("启用衰老") },
		{ TEXT("AgeSenescence"), TEXT("年龄衰老") },
		{ TEXT("Bifurcation"), TEXT("主干分叉") },
		{ TEXT("BranchBifurcation"), TEXT("分支分叉") },
		{ TEXT("Directional"), TEXT("主干方向随机") },
		{ TEXT("BranchDirectional"), TEXT("分支方向随机") },
		{ TEXT("bBranchDirectionalSameAsTrunk"), TEXT("分支使用主干方向随机") },
		{ TEXT("Auxin"), TEXT("主干生长素") },
		{ TEXT("BranchAuxin"), TEXT("分支生长素") },
		{ TEXT("bBranchAuxinConditionSameAsTrunk"), TEXT("分支使用主干生长素") },
		{ TEXT("Foliage"), TEXT("叶片生长") },
		{ TEXT("ColliderSettings"), TEXT("碰撞体设置") },
		{ TEXT("FoliageMesh"), TEXT("叶片遮挡网格") },
		{ TEXT("AuxinFalloff"), TEXT("生长素衰减") },
		{ TEXT("ApicalDominance"), TEXT("顶端优势") },
		{ TEXT("RadicalAuxin"), TEXT("根部生长素") },
		{ TEXT("GravitationalForce"), TEXT("重力强度") },
		{ TEXT("CellWeight"), TEXT("细胞重量") },
		{ TEXT("FoliageWeight"), TEXT("叶片重量") },
		{ TEXT("BranchWeightBreakThreshold"), TEXT("枝条断裂张力阈值") },
		{ TEXT("HitGroundBehaviour"), TEXT("触地行为") },
		{ TEXT("MinGravitationalDot"), TEXT("最小朝上角度") },
		{ TEXT("TrunkReinforcement"), TEXT("主干强化") },
		{ TEXT("InputReinforcement"), TEXT("输入骨架强化") },
		{ TEXT("CellDensity"), TEXT("细胞密度") },
		{ TEXT("CellDevelopmentTime"), TEXT("细胞成熟时间") },
		{ TEXT("StartScale"), TEXT("初始缩放") },
		{ TEXT("EndScale"), TEXT("最终缩放") },
		{ TEXT("DevelopmentTime"), TEXT("发育时间") },
		{ TEXT("Density"), TEXT("密度") },
		{ TEXT("EthyleneBuildup"), TEXT("乙烯累积") },
		{ TEXT("EthyleneThreshold"), TEXT("乙烯阈值") },
		{ TEXT("AbscisicAcid"), TEXT("脱落酸") },
		{ TEXT("AuxinRetention"), TEXT("生长素保留") },
		{ TEXT("bTrunk"), TEXT("作用于主干") },
		{ TEXT("bBranch"), TEXT("作用于分支") },
		{ TEXT("bFoliage"), TEXT("作用于叶片") },
		{ TEXT("AxilAngle"), TEXT("腋角") },
		{ TEXT("Type"), TEXT("类型") },
		{ TEXT("Formation"), TEXT("排列形式") },
		{ TEXT("Min"), TEXT("最小值") },
		{ TEXT("Max"), TEXT("最大值") },
		{ TEXT("AdditionalAngle"), TEXT("附加角度") },
		{ TEXT("Offset"), TEXT("偏移") },
		{ TEXT("Flatten"), TEXT("平面化") },
		{ TEXT("Stagger"), TEXT("错位") },
		{ TEXT("bReset"), TEXT("重置叶序") },
		{ TEXT("bEnableBifurcation"), TEXT("启用分叉") },
		{ TEXT("SplitAngle"), TEXT("分叉角度") },
		{ TEXT("SplitBias"), TEXT("分叉偏置") },
		{ TEXT("SplitMin"), TEXT("最小分叉数") },
		{ TEXT("SplitMax"), TEXT("最大分叉数") },
		{ TEXT("SplitThreshold"), TEXT("分叉阈值") },
		{ TEXT("CytokininBuildup"), TEXT("细胞分裂素累积") },
		{ TEXT("CytokininRandomness"), TEXT("细胞分裂素随机性") },
		{ TEXT("Apical"), TEXT("顶芽") },
		{ TEXT("ApicalBias"), TEXT("顶芽偏置") },
		{ TEXT("Axillary"), TEXT("侧芽") },
		{ TEXT("AxillaryBias"), TEXT("侧芽偏置") },
		{ TEXT("PhotosyntheticImpact"), TEXT("光合作用影响") },
		{ TEXT("Mode"), TEXT("模式") },
		{ TEXT("SenescenceAge"), TEXT("衰老年龄") },
		{ TEXT("SenescenceThreshold"), TEXT("衰老阈值") },
		{ TEXT("SenescenceMin"), TEXT("最小衰老时间") },
		{ TEXT("SenescenceMax"), TEXT("最大衰老时间") },
		{ TEXT("DegradationAmount"), TEXT("衰减量") },
		{ TEXT("RetentionRadius"), TEXT("保留半径") },
		{ TEXT("bResetOnResumeGrowth"), TEXT("续接生长时重置年龄") },
		{ TEXT("bUse"), TEXT("启用") },
		{ TEXT("Mesh"), TEXT("网格体") },
		{ TEXT("Transform"), TEXT("变换") },
		{ TEXT("CollisionType"), TEXT("交互类型") },
		{ TEXT("SmoothnessAmount"), TEXT("平滑迭代") },
		{ TEXT("SmoothnessFactor"), TEXT("平滑强度") },
		{ TEXT("Position"), TEXT("位置") },
		{ TEXT("ApicalDirection"), TEXT("顶芽方向") },
		{ TEXT("AxillaryDirection"), TEXT("侧芽方向") },
		{ TEXT("BranchNumber"), TEXT("枝条编号") },
		{ TEXT("LengthFromRoot"), TEXT("距根长度") },
		{ TEXT("PlantNumber"), TEXT("植物编号") },
		{ TEXT("SeedPScale"), TEXT("种子点缩放") },
		{ TEXT("SeedPScaleRatio"), TEXT("种子点缩放比例") },
		{ TEXT("UpVector"), TEXT("上方向") },
		{ TEXT("Avoidance"), TEXT("避让强度") },
		{ TEXT("AvoidanceBias"), TEXT("避让偏置") },
		{ TEXT("AvoidanceCenterReduction"), TEXT("中心避让衰减") },
		{ TEXT("ApicalRandom"), TEXT("顶芽随机角度") },
		{ TEXT("AxillaryRandom"), TEXT("侧芽随机角度") }
	};

	const FToolTipEntry ToolTipEntries[] =
	{
		{ TEXT("Preset"), TEXT("可选的生长器预设。指定后会把预设里的生长参数复制到下面的设置中，适合从已有树种配置开始调试。") },
		{ TEXT("GrowthCycles"), TEXT("模拟的生长迭代次数。数值越高，植物越成熟、枝条越复杂，计算成本也会增加。") },
		{ TEXT("RandomSeed"), TEXT("控制生长模拟中所有随机选择。同一组设置加同一个随机种子会得到相同结果。") },
		{ TEXT("bBranchPhyllotaxySameAsTrunk"), TEXT("开启后，分支继承主干的叶序设置；关闭后可以单独配置分支叶序。") },
		{ TEXT("bLeafPhyllotaxySameAsBranch"), TEXT("开启后，叶片使用分支的排列方式；关闭后可以给叶片单独配置叶序。") },
		{ TEXT("bBranchPhototropismSameAsTrunk"), TEXT("开启后，分支继承主干向光性；关闭后可单独配置分支向光性。") },
		{ TEXT("bSenescence"), TEXT("控制是否启用年龄和光照衰老。关闭后枝条不会因为自然老化或长期阴影而死亡。") },
		{ TEXT("bBranchDirectionalSameAsTrunk"), TEXT("开启后，分支继承主干的方向随机设置。") },
		{ TEXT("bBranchAuxinConditionSameAsTrunk"), TEXT("开启后，分支继承主干的生长素控制设置。") },
		{ TEXT("ColliderSettings"), TEXT("影响植物生长的碰撞体列表，可用于避让、裁掉内部或裁掉外部生长。") },
		{ TEXT("FoliageMesh"), TEXT("每片叶子用于光照遮挡检测的静态网格。自定义叶片越复杂，生长计算成本越高。") },
		{ TEXT("GravitationalForce"), TEXT("重力强度。更高会让枝条下垂更明显；更低会让植物更挺直。") },
		{ TEXT("BranchWeightBreakThreshold"), TEXT("枝条在弯曲压力下断裂的阈值。越低越容易折断，越高越能承受弯曲。") },
		{ TEXT("HitGroundBehaviour"), TEXT("枝条下垂碰到地面后的处理方式：删除、沿地面偏转，或忽略穿过。") },
		{ TEXT("StartScale"), TEXT("叶片生成时的初始缩放。") },
		{ TEXT("EndScale"), TEXT("叶片完全成熟后的最终缩放。") },
		{ TEXT("Density"), TEXT("叶片密度倍率。越高叶片越多，同时会增加遮挡和重力负载。") },
		{ TEXT("AxilAngle"), TEXT("子枝条与父级方向之间的夹角。角度越大树冠越展开，越小越偏柱状。") },
		{ TEXT("AdditionalAngle"), TEXT("每个节点额外增加的旋转角度，用于打破规则排列或手动控制螺旋模式。") },
		{ TEXT("bEnableBifurcation"), TEXT("启用枝梢分叉。开启后枝条末端可在条件满足时分裂成多个新枝。") },
		{ TEXT("SplitAngle"), TEXT("分叉枝条之间的角度。") },
		{ TEXT("SplitThreshold"), TEXT("触发分叉所需的细胞分裂素阈值。越低越容易分叉。") },
		{ TEXT("Apical"), TEXT("顶芽朝向光照弯曲的强度。") },
		{ TEXT("Axillary"), TEXT("侧芽出生时选择向光方向的强度。") },
		{ TEXT("SenescenceThreshold"), TEXT("光照低于该值并持续一段时间后，枝条会进入衰老或死亡流程。") },
		{ TEXT("RetentionRadius"), TEXT("枝条足够粗时可免于衰老死亡的半径比例。") },
		{ TEXT("ContentBrowserFolder"), TEXT("导出资产保存到 Content 下的哪个文件夹。路径相对于项目 Content 目录。") },
		{ TEXT("MeshName"), TEXT("导出的网格资产名称。") },
		{ TEXT("ReplacePolicy"), TEXT("目标资产已存在时的处理方式：追加编号、替换，或忽略本次导出。") },
		{ TEXT("ExportMeshType"), TEXT("选择导出为静态网格或骨骼网格。静态网格不支持骨骼风动画；骨骼网格包含用于摆动的骨骼。") },
		{ TEXT("bCreateNaniteFoliage"), TEXT("为导出的网格启用 Nanite Foliage 支持。") },
		{ TEXT("NaniteShapePreservation"), TEXT("Nanite 简化时保留植物形状的方法。植物通常推荐 Voxelize。") },
		{ TEXT("bCollision"), TEXT("为静态网格生成碰撞。大量植被通常建议关闭，或只给少量可交互树干使用。") },
		{ TEXT("CollisionGeneration"), TEXT("骨骼网格导出时生成物理资产和碰撞的范围。") },
		{ TEXT("WindSettings"), TEXT("分配给骨骼网格的动态风预设。只有需要风动画时才需要。") },
		{ TEXT("MesherSettings"), TEXT("把生长骨架转换成最终网格的参数集合。") },
		{ TEXT("SkeletonResolution"), TEXT("最长枝条用于插值的分段数量。越高曲线越平滑，但顶点数也更高。") },
		{ TEXT("PointRemoval"), TEXT("移除小点以简化网格。数值越高简化越激进。") },
		{ TEXT("SegmentReduction"), TEXT("简化枝条线段的强度。越高边数越少，网格越轻。") },
		{ TEXT("MinDivisions"), TEXT("枝条横截面的最小径向分段数。") },
		{ TEXT("MaxDivisions"), TEXT("枝条横截面的最大径向分段数。") },
		{ TEXT("AddEndCaps"), TEXT("为枝条末端添加半球端盖，避免开放圆柱端口。") },
		{ TEXT("BranchRadius"), TEXT("控制不同代数枝条半径、缩放和最小半径的规则。") },
		{ TEXT("Displacement"), TEXT("使用纹理给树皮或枝条表面增加几何置换细节。") },
		{ TEXT("SkeletonShaping"), TEXT("给不同代数的枝条骨架添加噪声和平滑，让枝条形态更自然。") },
		{ TEXT("FoliageInfos"), TEXT("叶片、针叶、花或果实等网格资产列表，供叶片分布器使用。") },
		{ TEXT("Mode"), TEXT("选择叶片分布方式：参数化控制，或使用生长器数据的激素驱动分布。") },
		{ TEXT("ChainMaskDistance"), TEXT("多个叶片分布器串联时，避免新叶片离已有叶片太近的距离。") },
		{ TEXT("TrunkOffset"), TEXT("沿枝干厚度方向偏移生成的叶片实例。") },
		{ TEXT("CutoffThreshold"), TEXT("条件综合分数低于该阈值时跳过放置。越高过滤越严格。") },
		{ TEXT("MinimumCandidates"), TEXT("每根枝条至少保留的候选点数量，避免过滤过强导致枝条完全无叶。") },
		{ TEXT("ObjectInteractionSettings"), TEXT("让植物生长时响应碰撞体：避让、保留内部，或裁掉内部。") },
		{ TEXT("Avoidance"), TEXT("种子初始生长方向的避让弯曲强度。") },
		{ TEXT("AvoidanceBias"), TEXT("在避开群集中心和避开附近种子之间混合。0 偏中心，1 偏邻居。") },
		{ TEXT("AvoidanceCenterReduction"), TEXT("让中心区域种子的避让更弱，外侧种子的避让更强。") }
	};

	const FEnumValueTextEntry EnumValueEntries[] =
	{
		{ TEXT("EPVExportMeshType"), TEXT("StaticMesh"), TEXT("静态网格体") },
		{ TEXT("EPVExportMeshType"), TEXT("SkeletalMesh"), TEXT("骨骼网格体") },
		{ TEXT("EPVAssetReplacePolicy"), TEXT("Append"), TEXT("追加编号") },
		{ TEXT("EPVAssetReplacePolicy"), TEXT("Replace"), TEXT("替换") },
		{ TEXT("EPVAssetReplacePolicy"), TEXT("Ignore"), TEXT("忽略") },
		{ TEXT("EPVCollisionGeneration"), TEXT("None"), TEXT("不生成") },
		{ TEXT("EPVCollisionGeneration"), TEXT("TrunkOnly"), TEXT("仅主干") },
		{ TEXT("EPVCollisionGeneration"), TEXT("AllGenerations"), TEXT("全部代数") },
		{ TEXT("EPVCollisionType"), TEXT("AVOID"), TEXT("避让") },
		{ TEXT("EPVCollisionType"), TEXT("TRIM_OUTSIDE"), TEXT("保留内部") },
		{ TEXT("EPVCollisionType"), TEXT("TRIM_INSIDE"), TEXT("裁掉内部") },
		{ TEXT("EPVHitGroundBehaviour"), TEXT("Kill"), TEXT("删除") },
		{ TEXT("EPVHitGroundBehaviour"), TEXT("Deflect"), TEXT("偏转") },
		{ TEXT("EPVHitGroundBehaviour"), TEXT("Ignore"), TEXT("忽略") },
		{ TEXT("EPVAbscissionMode"), TEXT("Kill"), TEXT("直接删除") },
		{ TEXT("EPVAbscissionMode"), TEXT("Degrade"), TEXT("逐步衰减") },
		{ TEXT("EPVGrowthPhyllotaxyType"), TEXT("Alternate"), TEXT("互生") },
		{ TEXT("EPVGrowthPhyllotaxyType"), TEXT("Opposite"), TEXT("对生") },
		{ TEXT("EPVGrowthPhyllotaxyType"), TEXT("Decussate"), TEXT("十字对生") },
		{ TEXT("EPVGrowthPhyllotaxyType"), TEXT("Whorled"), TEXT("轮生") },
		{ TEXT("EPVGrowthPhyllotaxyType"), TEXT("Spiral"), TEXT("螺旋") },
		{ TEXT("EPhyllotaxyType"), TEXT("Alternate"), TEXT("互生") },
		{ TEXT("EPhyllotaxyType"), TEXT("Opposite"), TEXT("对生") },
		{ TEXT("EPhyllotaxyType"), TEXT("Decussate"), TEXT("十字对生") },
		{ TEXT("EPhyllotaxyType"), TEXT("Whorled"), TEXT("轮生") },
		{ TEXT("EPhyllotaxyType"), TEXT("Spiral"), TEXT("螺旋") },
		{ TEXT("EPhyllotaxyFormation"), TEXT("Distichous"), TEXT("二列") },
		{ TEXT("EPhyllotaxyFormation"), TEXT("Tristichous"), TEXT("三列") },
		{ TEXT("EPhyllotaxyFormation"), TEXT("Pentastichous"), TEXT("五列") },
		{ TEXT("EPhyllotaxyFormation"), TEXT("Octastichous"), TEXT("八列") },
		{ TEXT("EPhyllotaxyFormation"), TEXT("Parastichous"), TEXT("自由螺旋") },
		{ TEXT("EPVDistributionSettingsMode"), TEXT("ParametricSettings"), TEXT("使用参数化设置") },
		{ TEXT("EPVDistributionSettingsMode"), TEXT("HormoneBasedSettings"), TEXT("使用激素驱动设置") },
		{ TEXT("EPVDistributionBasis"), TEXT("Plant"), TEXT("整株植物") },
		{ TEXT("EPVDistributionBasis"), TEXT("Branch"), TEXT("单根枝条") },
		{ TEXT("EPVRollPitchYawMode"), TEXT("Roll"), TEXT("滚转") },
		{ TEXT("EPVRollPitchYawMode"), TEXT("Pitch"), TEXT("俯仰") },
		{ TEXT("EPVRollPitchYawMode"), TEXT("Yaw"), TEXT("偏航") },
		{ TEXT("EPVDistributionCondition"), TEXT("Light"), TEXT("光照") },
		{ TEXT("EPVDistributionCondition"), TEXT("Scale"), TEXT("缩放") },
		{ TEXT("EPVDistributionCondition"), TEXT("UpAlignment"), TEXT("朝上对齐") },
		{ TEXT("EPVDistributionCondition"), TEXT("Tip"), TEXT("枝梢") },
		{ TEXT("EPVDistributionCondition"), TEXT("Health"), TEXT("健康度") },
		{ TEXT("EPVDistributionCondition"), TEXT("Height"), TEXT("高度") },
		{ TEXT("EPVDistributionCondition"), TEXT("Generation"), TEXT("代数") }
	};

	const TCHAR* FindChineseByName(const FTextMetaEntry* Entries, int32 EntryCount, const FString& Name)
	{
		for (int32 Index = 0; Index < EntryCount; ++Index)
		{
			if (Name == Entries[Index].Name)
			{
				return Entries[Index].Chinese;
			}
		}

		return nullptr;
	}

	const TCHAR* FindToolTipByName(const FString& Name)
	{
		for (const FToolTipEntry& Entry : ToolTipEntries)
		{
			if (Name == Entry.Name)
			{
				return Entry.Chinese;
			}
		}

		return nullptr;
	}

	FString TranslateCategoryPath(const FString& Category)
	{
		TArray<FString> Parts;
		Category.ParseIntoArray(Parts, TEXT("|"), true);

		if (Parts.Num() == 0)
		{
			Parts.Add(Category);
		}

		for (FString& Part : Parts)
		{
			Part.TrimStartAndEndInline();
			if (const TCHAR* Chinese = FindChineseByName(CategoryEntries, UE_ARRAY_COUNT(CategoryEntries), Part))
			{
				Part = Chinese;
			}
		}

		return FString::Join(Parts, TEXT(" | "));
	}

	bool IsProceduralVegetationStruct(const UStruct* Struct)
	{
		return Struct && Struct->GetOutermost() && Struct->GetOutermost()->GetName() == ScriptPackageName;
	}

	void SetFieldMeta(FProperty* Property, const TCHAR* Key, const FString& Value)
	{
#if WITH_METADATA
		if (Property && !Value.IsEmpty())
		{
			Property->SetMetaData(Key, *Value);
		}
#endif
	}

	void ApplyPropertyMetadata()
	{
#if WITH_METADATA
		for (TObjectIterator<UStruct> It; It; ++It)
		{
			UStruct* Struct = *It;
			if (!IsProceduralVegetationStruct(Struct))
			{
				continue;
			}

			for (TFieldIterator<FProperty> PropIt(Struct, EFieldIteratorFlags::ExcludeSuper); PropIt; ++PropIt)
			{
				FProperty* Property = *PropIt;
				const FString PropertyName = Property->GetName();

				if (const TCHAR* Chinese = FindChineseByName(DisplayNameEntries, UE_ARRAY_COUNT(DisplayNameEntries), PropertyName))
				{
					SetFieldMeta(Property, TEXT("DisplayName"), Chinese);
				}

				if (const TCHAR* ToolTip = FindToolTipByName(PropertyName))
				{
					SetFieldMeta(Property, TEXT("ToolTip"), ToolTip);
				}

				if (Property->HasMetaData(TEXT("Category")))
				{
					const FString Category = Property->GetMetaData(TEXT("Category"));
					const FString TranslatedCategory = TranslateCategoryPath(Category);
					if (TranslatedCategory != Category)
					{
						SetFieldMeta(Property, TEXT("Category"), TranslatedCategory);
					}
				}
			}
		}
#endif
	}

	void ApplyEnumMetadata()
	{
#if WITH_METADATA
		for (TObjectIterator<UEnum> It; It; ++It)
		{
			UEnum* Enum = *It;
			if (!Enum || !Enum->GetOutermost() || Enum->GetOutermost()->GetName() != ScriptPackageName)
			{
				continue;
			}

			const FString EnumName = Enum->GetName();
			for (const FEnumValueTextEntry& Entry : EnumValueEntries)
			{
				if (EnumName != Entry.EnumName)
				{
					continue;
				}

				for (int32 Index = 0; Index < Enum->NumEnums(); ++Index)
				{
					if (Enum->GetNameStringByIndex(Index) == Entry.ValueName)
					{
						Enum->SetMetaData(TEXT("DisplayName"), Entry.Chinese, Index);
						break;
					}
				}
			}
		}
#endif
	}

	void RegisterNodeText()
	{
		TArray<FPolyglotTextData> PolyglotData;
		PolyglotData.Reserve(UE_ARRAY_COUNT(NodeTextEntries));

		for (const FNodeTextEntry& Entry : NodeTextEntries)
		{
			FPolyglotTextData& TextData = PolyglotData.Emplace_GetRef(
				ELocalizedTextSourceCategory::Editor,
				Entry.Namespace,
				Entry.Key,
				Entry.Native,
				TEXT("en"));

			TextData.AddLocalizedString(TEXT("zh-Hans"), Entry.Chinese);
			TextData.AddLocalizedString(TEXT("zh-CN"), Entry.Chinese);
		}

		FTextLocalizationManager::Get().RegisterPolyglotTextData(PolyglotData);
	}
}

class FDay30ProceduralVegetationZhModule final : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		FModuleManager::Get().LoadModule(TEXT("ProceduralVegetation"));
		Day30::ProceduralVegetationZh::RegisterNodeText();
		Day30::ProceduralVegetationZh::ApplyPropertyMetadata();
		Day30::ProceduralVegetationZh::ApplyEnumMetadata();
		StartBranchForgeExportRouting();
	}
	virtual void ShutdownModule() override { StopBranchForgeExportRouting(); }
};

IMPLEMENT_MODULE(FDay30ProceduralVegetationZhModule, Day30ProceduralVegetationZh)

#undef LOCTEXT_NAMESPACE
