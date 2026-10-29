#include "PVEWorkflowCommandlet.h"
#include "BranchForgeTrunkExport.h"
#include "PVBranchForgeReferenceMeshSettings.h"
#include "PVBranchForgeBindingSettings.h"

#include "ProceduralVegetation.h"
#include "DataTypes/PVData.h"
#include "DataTypes/PVMeshData.h"
#include "Facades/PVAttributesNames.h"
#include "Facades/PVTreeFacade.h"
#include "Facades/PVBranchFacade.h"
#include "Facades/PVFoliageFacade.h"
#include "Facades/PVBoneFacade.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/PackageName.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "PCGDefaultExecutionSource.h"
#include "PCGGraph.h"
#include "PCGNode.h"
#include "PCGPin.h"
#include "PCGData.h"
#include "Graph/PCGStackContext.h"
#include "Subsystems/IPCGBaseSubsystem.h"
#include "Subsystems/PCGEngineSubsystem.h"
#include "Engine/Engine.h"
#include "Tickable.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Misc/CommandLine.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "GeometryCollection/GeometryCollection.h"

namespace
{
// Repair only missing rigid-assembly attachments after proving that the live
// generation output still describes the saved mesh. No geometry is rebaked.
bool RepairMissingAssemblyBindings(USkeletalMesh* Mesh, const FManagedArrayCollection& Collection,
	const TSharedRef<FJsonObject>& Report, FString& Error)
{
	if (!Mesh) { Error = TEXT("找不到待修复的骨骼网格"); return false; }
	PV::Facades::FFoliageFacade Foliage(Collection);
	const auto Bones = PV::Facades::FBoneFacade(Collection).GetBoneDataFromCollection();
	const auto& Skeleton = Mesh->GetRefSkeleton();
	if (Skeleton.GetNum() != Bones.Num()) { Error = TEXT("生成骨架与原网格骨骼数量不同，停止修复"); return false; }
	for (const auto& Bone : Bones)
	{
		if (Bone.BoneIndex < 0 || Bone.BoneIndex >= Skeleton.GetNum()
			|| Skeleton.GetBoneName(Bone.BoneIndex) != Bone.BoneName
			|| Skeleton.GetParentIndex(Bone.BoneIndex) != Bone.ParentBoneIndex
			|| !Skeleton.GetRefBonePose()[Bone.BoneIndex].Equals(Bone.BoneTransform, 0.001))
		{ Error = TEXT("生成骨架与原网格的骨名、父子关系或参考姿态不同，停止修复"); return false; }
	}
	const auto Original = Mesh->GetNaniteSettings();
	auto Settings = Original;
	auto& Assembly = Settings.NaniteAssemblyData;
	if (Assembly.Nodes.Num() != Foliage.NumFoliageEntries()) { Error = TEXT("装配节点数量不同，停止修复"); return false; }
	TArray<TSharedPtr<FJsonValue>> Repairs;
	for (int32 I = 0; I < Assembly.Nodes.Num(); ++I)
	{
		auto& Node = Assembly.Nodes[I];
		const int32 Desired = Foliage.GetParentBoneID(I);
		if (!Assembly.Parts.IsValidIndex(Node.PartIndex) || Node.BoneInfluences.Num() != 1
			|| !FMath::IsNearlyEqual(Node.BoneInfluences[0].BoneWeight, 1.f)
			|| !Node.Transform.Equals(FTransform3f(Foliage.GetFoliageTransform(I)), 0.0001f)
			|| Desired < 0 || Desired >= Skeleton.GetNum())
		{ Error = FString::Printf(TEXT("装配节点 %d 的资源、权重或变换与生成图不一致，停止修复"), I); return false; }
		const int32 Existing = Node.BoneInfluences[0].BoneIndex;
		if (Existing >= 0 && Existing < Skeleton.GetNum())
		{
			if (Existing != Desired) { Error = FString::Printf(TEXT("原有效节点 %d 的骨骼匹配发生变化，停止修复"), I); return false; }
			continue;
		}
		auto Entry = MakeShared<FJsonObject>();
		Entry->SetNumberField(TEXT("node"), I); Entry->SetNumberField(TEXT("before"), Existing); Entry->SetNumberField(TEXT("after"), Desired);
		Repairs.Add(MakeShared<FJsonValueObject>(Entry));
		Node.BoneInfluences[0].BoneIndex = Desired;
	}
	Report->SetNumberField(TEXT("compatible_bones"), Bones.Num());
	Report->SetArrayField(TEXT("repaired_nodes"), Repairs);
	Mesh->SetNaniteSettings(Settings);
	Mesh->InvalidateDeriveDataCacheGUID();
	Report->SetBoolField(TEXT("render_cache_invalidated"), true);
	Mesh->MarkPackageDirty();
	FSavePackageArgs Args;
	Args.TopLevelFlags = RF_Public | RF_Standalone;
	Args.SaveFlags = SAVE_NoError;
	const FString Filename = FPackageName::LongPackageNameToFilename(Mesh->GetPackage()->GetName(), FPackageName::GetAssetPackageExtension());
	if (!UPackage::SavePackage(Mesh->GetPackage(), Mesh, *Filename, Args))
	{ Mesh->SetNaniteSettings(Original); Error = TEXT("保存修复的装配元数据失败"); return false; }
	return true;
}
}

UPVEWorkflowCommandlet::UPVEWorkflowCommandlet()
{
	// Asset editing must load client material/assembly objects. Server-only
	// loading strips their expression data even with IsEditor enabled.
	// -nullrhi and commandlet rendering flags control rendering independently.
	IsClient = true;
	IsServer = false;
	IsEditor = true;
	LogToConsole = true;
}

static bool DumpBranchForgeResolvedMesh(const FManagedArrayCollection& Arrays, const FString& Path)
{
	FGeometryCollection Geometry; Arrays.CopyTo(&Geometry);
	const auto* UV = Geometry.FindUVLayer(0);
	const auto* Paths = Geometry.FindAttribute<FString>(TEXT("MaterialPath"), FGeometryCollection::MaterialGroup);
	if (!UV || !Paths) return false;
	TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
	auto Tuple = [](std::initializer_list<double> Numbers) -> TSharedPtr<FJsonValue> { TArray<TSharedPtr<FJsonValue>> Values; for (double V : Numbers) Values.Add(MakeShared<FJsonValueNumber>(V)); return MakeShared<FJsonValueArray>(MoveTemp(Values)); };
	TArray<TSharedPtr<FJsonValue>> Positions, Normals, Tangents, Colors, UVs, Faces, MaterialIds, MaterialPaths;
	for (int32 I = 0; I < Geometry.Vertex.Num(); ++I) {
		const auto& P = Geometry.Vertex[I]; const auto& N = Geometry.Normal[I]; const auto& T = Geometry.TangentU[I]; const auto& C = Geometry.Color[I]; const auto& U = (*UV)[I];
		Positions.Add(Tuple({P.X,P.Y,P.Z})); Normals.Add(Tuple({N.X,N.Y,N.Z})); Tangents.Add(Tuple({T.X,T.Y,T.Z})); Colors.Add(Tuple({C.R,C.G,C.B,C.A})); UVs.Add(Tuple({U.X,U.Y}));
	}
	for (int32 I = 0; I < Geometry.Indices.Num(); ++I) { const auto& F = Geometry.Indices[I]; Faces.Add(Tuple({double(F.X),double(F.Y),double(F.Z)})); MaterialIds.Add(MakeShared<FJsonValueNumber>(Geometry.MaterialID[I])); }
	for (const FString& MaterialPath : *Paths) MaterialPaths.Add(MakeShared<FJsonValueString>(MaterialPath));
	Object->SetArrayField(TEXT("position_cm"), Positions); Object->SetArrayField(TEXT("normal"), Normals); Object->SetArrayField(TEXT("tangent"), Tangents); Object->SetArrayField(TEXT("color"), Colors); Object->SetArrayField(TEXT("uv"), UVs); Object->SetArrayField(TEXT("faces"), Faces); Object->SetArrayField(TEXT("material_ids"), MaterialIds); Object->SetArrayField(TEXT("material_paths"), MaterialPaths);
	FString Text; if (!FJsonSerializer::Serialize(Object, TJsonWriterFactory<>::Create(&Text))) return false;
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);
	return FFileHelper::SaveStringToFile(Text, *Path, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

int32 UPVEWorkflowCommandlet::Main(const FString& Params)
{
	FString AssetPath = TEXT("/Game/Day30/Vegetation/PVEWorkflow/Graphs/PVE_Camphor_POC.PVE_Camphor_POC");
	FString ReportPath = FPaths::ProjectSavedDir() / TEXT("PVEWorkflow/camphor_generation.json");
	FString ReferenceJSON;
	FString RepairMesh;FString ExportTrunkFolder,TrunkManifest;
	FString DumpResolvedPath; bool bDumpResolved = false;
	float UnitRootRadiusCm = 1.7f;
	int32 RequireFoliage = 1;
	int32 ReferenceOnly = 0;
	int32 RequireResolved = 0;
	int32 RequireBindings = 0;
	FParse::Value(*Params, TEXT("Asset="), AssetPath);
	FParse::Value(*Params, TEXT("Report="), ReportPath);
	FString ReplaceSource,ReplaceTarget;
	if(FParse::Value(*Params,TEXT("ReplaceTrunkSource="),ReplaceSource)&&FParse::Value(*Params,TEXT("ReplaceTrunkTarget="),ReplaceTarget))
	{
		auto Result=MakeShared<FJsonObject>();FString Error;
		const bool Passed=ReplaceBranchForgeTrunkMesh(ReplaceSource,ReplaceTarget,Result,Error);
		Result->SetBoolField(TEXT("passed"),Passed);Result->SetStringField(TEXT("error"),Error);
		FString Text;FJsonSerializer::Serialize(Result,TJsonWriterFactory<>::Create(&Text));
		IFileManager::Get().MakeDirectory(*FPaths::GetPath(ReportPath),true);
		FFileHelper::SaveStringToFile(Text,*ReportPath,FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);return Passed?0:3;
	}
	FParse::Value(*Params, TEXT("ReferenceJSON="), ReferenceJSON);
	FParse::Value(*Params, TEXT("RepairMesh="), RepairMesh);FParse::Value(*Params,TEXT("ExportTrunk="),ExportTrunkFolder);FParse::Value(*Params,TEXT("TrunkManifest="),TrunkManifest);
	FParse::Value(*Params, TEXT("DumpResolved="), DumpResolvedPath);
	FParse::Value(*Params, TEXT("UnitRootRadiusCm="), UnitRootRadiusCm);
	FParse::Value(*Params, TEXT("RequireFoliage="), RequireFoliage);
	FParse::Value(*Params, TEXT("ReferenceOnly="), ReferenceOnly);
	FParse::Value(*Params, TEXT("RequireResolved="), RequireResolved);
	FParse::Value(*Params, TEXT("RequireBindings="), RequireBindings);
	if (UnitRootRadiusCm <= 0.0f)
	{
		UE_LOG(LogTemp, Error, TEXT("PVE_WORKFLOW invalid UnitRootRadiusCm: %f"), UnitRootRadiusCm);
		return 4;
	}
	FString WindMesh;if(FParse::Value(*Params,TEXT("WindProbe="),WindMesh)){auto WindReport=MakeShared<FJsonObject>();FString WindError;const bool Passed=ProbeBranchForgeTrunkWind(WindMesh,FPaths::GetPath(ReportPath)/TEXT("wind-frames"),WindReport,WindError);WindReport->SetBoolField(TEXT("passed"),Passed);WindReport->SetStringField(TEXT("error"),WindError);FString Text;FJsonSerializer::Serialize(WindReport,TJsonWriterFactory<>::Create(&Text));FFileHelper::SaveStringToFile(Text,*ReportPath,FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);return Passed?0:3;}
	FString AuditFolder;if(FParse::Value(*Params,TEXT("AuditTrunk="),AuditFolder)){auto Audit=MakeShared<FJsonObject>();FString AuditError,StaticPath,SkeletalPath;FParse::Value(*Params,TEXT("TrunkStaticMesh="),StaticPath);FParse::Value(*Params,TEXT("TrunkSkeletalMesh="),SkeletalPath);const bool Passed=AuditBranchForgeTrunkAssets(AuditFolder,Audit,AuditError,!FParse::Param(*Params,TEXT("TrunkAuditSummary")),StaticPath,SkeletalPath);Audit->SetBoolField(TEXT("passed"),Passed);Audit->SetStringField(TEXT("error"),AuditError);FString Text;FJsonSerializer::Serialize(Audit,TJsonWriterFactory<>::Create(&Text));IFileManager::Get().MakeDirectory(*FPaths::GetPath(ReportPath),true);FFileHelper::SaveStringToFile(Text,*ReportPath,FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);return Passed?0:3;}
	UProceduralVegetation* Asset = LoadObject<UProceduralVegetation>(nullptr, *AssetPath);
	if (!Asset || !Asset->GetGraph())
	{
		UE_LOG(LogTemp, Error, TEXT("PVE_WORKFLOW missing graph asset: %s"), *AssetPath);
		return 1;
	}

	FPCGDefaultExecutionSourceParams SourceParams;
	SourceParams.GraphInterface = Asset->GetGraph();
	UPCGDefaultExecutionSource* Source = IPCGBaseSubsystem::CreateExecutionSource<UPCGDefaultExecutionSource>(SourceParams);
	if (!Source)
	{
		return 2;
	}
	Source->AddToRoot();
	Source->GetExecutionState().GetInspection().EnableInspection();
	const double Start = FPlatformTime::Seconds();
	UPCGEngineSubsystem* PCGSubsystem = UPCGEngineSubsystem::Get();
	UE_LOG(LogTemp, Display, TEXT("PVE_WORKFLOW_START subsystem=%s"), PCGSubsystem ? TEXT("ready") : TEXT("missing"));
	Source->Generate();
	while (Source->GetExecutionState().IsGenerating() && FPlatformTime::Seconds() - Start < 300.0)
	{
		GEngine->Tick(0.016f, false);
		if (PCGSubsystem)
		{
			static_cast<FTickableGameObject*>(PCGSubsystem)->Tick(0.016f);
		}
		FPlatformProcess::Sleep(0.01f);
	}
	const bool bDone = !Source->GetExecutionState().IsGenerating();

	int32 MaxBranches = 0;
	int32 MaxBones = 0;
	int32 MaxFoliage = 0;
	int32 MaxVertices = 0;
	int32 ReferenceMeshVertices = 0;
	int32 ReferenceMeshFaces = 0;
	int32 ReferenceMeshMaterials = 0;
	int32 ReferenceMeshMaterialPaths = 0;
	int32 ResolvedFaces = 0, ResolvedVertices = 0, ResolvedMaterials = 0, ResolvedMaterialPaths = 0;
	int32 ResolvedLeaves = 0, ResolvedOrgans = 0, ResolvedSources = 0, ResolvedInstances = 0, UnboundVertices = 0;
	FBox ResolvedBounds(ForceInit);
	int32 InspectedOutputs = 0;
	int32 GuardedFoliage = 0, UnboundFoliage = 0;
	int32 JunctionAdjustments = 0;
	bool bGuardPassed = false, bRejectedInvalidAttachment = false;
	TUniquePtr<FManagedArrayCollection> BoundForRepair,TrunkExportCollection;
	TMap<int32, int32> GenerationCounts;
	TArray<float> HostToUnitRadiusRatios;
	int32 HostRadiusSamples = 0;
	int32 HostThinnerThanUnit = 0;
	int32 MeshFoliageCount = INDEX_NONE;
	int32 MeshSourcePathCount = 0;
	float MaxFoliagePositionErrorCm = 0;
	float MaxFoliageScaleError = 0;
	float MaxFoliageDirectionError = 0;
	TArray<TSharedPtr<FJsonValue>> ReferenceLeaves;
	if (!ReferenceJSON.IsEmpty())
	{
		FString Text;
		TSharedPtr<FJsonObject> Root;
		const TArray<TSharedPtr<FJsonValue>>* Leaves = nullptr;
		if (!FFileHelper::LoadFileToString(Text, *ReferenceJSON) ||
			!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid() ||
			!Root->TryGetArrayField(TEXT("foliage"), Leaves) || !Leaves)
		{
			UE_LOG(LogTemp, Error, TEXT("PVE_WORKFLOW cannot read ReferenceJSON foliage: %s"), *ReferenceJSON);
			return 5;
		}
		ReferenceLeaves = *Leaves;
	}
	if (bDone)
	{
		UPCGGraph* Graph = Source->GetGraph();
		for (const UPCGNode* Node : Graph->GetNodes())
		{
			const bool bReferenceMeshNode = Cast<UPVBranchForgeReferenceMeshSettings>(Node->GetSettings()) != nullptr;
			for (const UPCGPin* Pin : Node->GetOutputPins())
			{
				FPCGStack Stack;
				Stack.PushFrame(Source);
				Stack.PushFrame(Graph);
				Stack.PushFrame(Node);
				Stack.PushFrame(Pin);
				Source->GetExecutionState().GetInspection().InspectData(Stack,
					[&](const FPCGDataCollection& Collection)
					{
						for (const FPCGTaggedData& Tagged : Collection.TaggedData)
						{
							const UPVData* Data = Cast<UPVData>(Tagged.Data);
							if (!Data)
							{
								continue;
							}
							++InspectedOutputs;
						const FManagedArrayCollection& Arrays = Data->GetCollection();
							if (Cast<UPVBranchForgeBindingSettings>(Node->GetSettings()))
							{
								bGuardPassed = true;
								if (!RepairMesh.IsEmpty()) BoundForRepair = MakeUnique<FManagedArrayCollection>(Arrays);
								if (const auto* Adjusted = Arrays.FindAttribute<int32>(TEXT("BranchForgeJunctionAttachmentAdjustments"), PV::GroupNames::DetailsGroup))
									JunctionAdjustments = (*Adjusted)[0];
								PV::Facades::FFoliageFacade BoundFoliage(Arrays);
								GuardedFoliage = BoundFoliage.NumFoliageEntries();
								for (int32 I = 0; I < GuardedFoliage; ++I)
								{
									const int32 Bone = BoundFoliage.GetParentBoneID(I);
									if (Bone < 0 || Bone >= Arrays.NumElements(PV::GroupNames::BonesGroup)) ++UnboundFoliage;
								}
								if (RequireBindings && GuardedFoliage > 0)
								{
									FManagedArrayCollection Invalid = Arrays;
									PV::Facades::FFoliageFacade(Invalid).SetLengthFromRoot(0, -1.f);
									FString BindingError;
									bRejectedInvalidAttachment = !BindBranchForgeFoliage(Invalid, BindingError) && !BindingError.IsEmpty();
								}
							}
						if (bReferenceMeshNode && Cast<UPVMeshData>(Tagged.Data))
						{
							ReferenceMeshVertices = Arrays.NumElements(PV::GroupNames::VerticesGroup);
							ReferenceMeshFaces = Arrays.NumElements(FGeometryCollection::FacesGroup);
							ReferenceMeshMaterials = Arrays.NumElements(FGeometryCollection::MaterialGroup);
							if (const auto* Paths = Arrays.FindAttribute<FString>("MaterialPath", FGeometryCollection::MaterialGroup))
							{
								for (const FString& Path : *Paths) if (!Path.IsEmpty()) ++ReferenceMeshMaterialPaths;
							}
						}
							const int32 BranchCount = Arrays.NumElements(PV::GroupNames::BranchGroup);
							if (Arrays.HasAttribute(TEXT("BranchForgeResolvedTriangles"), PV::GroupNames::DetailsGroup))
							{
								// Prefer the completed bone/binding stream over an earlier
								// preview. Graph insertion order is not execution order.
								if (!ExportTrunkFolder.IsEmpty() && (!TrunkExportCollection ||
									Arrays.NumElements(PV::GroupNames::BonesGroup) > TrunkExportCollection->NumElements(PV::GroupNames::BonesGroup) ||
									Cast<UPVBranchForgeBindingSettings>(Node->GetSettings())))
									TrunkExportCollection = MakeUnique<FManagedArrayCollection>(Arrays);
								ResolvedFaces = Arrays.NumElements(FGeometryCollection::FacesGroup);
								ResolvedVertices = Arrays.NumElements(FGeometryCollection::VerticesGroup);
								ResolvedMaterials = Arrays.NumElements(FGeometryCollection::MaterialGroup);
								ResolvedMaterialPaths = 0; UnboundVertices = 0;
								if (const auto* Paths = Arrays.FindAttribute<FString>(TEXT("MaterialPath"), FGeometryCollection::MaterialGroup))
									for (const FString& Path : *Paths) if (!Path.IsEmpty()) ++ResolvedMaterialPaths;
								auto Number = [&](const TCHAR* Name) { return Arrays.FindAttribute<int32>(Name, PV::GroupNames::DetailsGroup)->operator[](0); };
								ResolvedLeaves = Number(TEXT("BranchForgeResolvedLeaves")); ResolvedOrgans = Number(TEXT("BranchForgeResolvedOrgans"));
								ResolvedSources = Number(TEXT("BranchForgeResolvedSourceCount")); ResolvedInstances = Number(TEXT("BranchForgeResolvedInstances"));
								const auto* Bindings = Arrays.FindAttribute<int32>(PV::AttributeNames::VertexPointIds, PV::GroupNames::VerticesGroup);
								if (Bindings)
								{
									for (int32 Id : *Bindings) if (Id < 0 || Id >= Arrays.NumElements(PV::GroupNames::PointGroup)) ++UnboundVertices;
								}
								else UnboundVertices = ResolvedVertices;
								ResolvedBounds = FBox(ForceInit);
								if (!DumpResolvedPath.IsEmpty() && !bDumpResolved) bDumpResolved = DumpBranchForgeResolvedMesh(Arrays, DumpResolvedPath);
								if (const auto* V = Arrays.FindAttribute<FVector3f>(TEXT("Vertex"), FGeometryCollection::VerticesGroup))
									for (const FVector3f& P : *V) ResolvedBounds += FVector(P);
							}
							MaxBones = FMath::Max(MaxBones, Arrays.NumElements(PV::GroupNames::BonesGroup));
							if (BranchCount > MaxBranches)
							{
								MaxBranches = BranchCount;
								GenerationCounts.Reset();
								for (int32 BranchIndex = 0; BranchIndex < BranchCount; ++BranchIndex)
								{
									const int32 Generation = PV::Facades::FTreeFacade::GetBranchGenerationNumber(Arrays, BranchIndex);
									GenerationCounts.FindOrAdd(Generation)++;
								}
							}
							const int32 FoliageCount = Arrays.NumElements(PV::GroupNames::FoliageGroup);
							if (Cast<UPVMeshData>(Tagged.Data))
							{
								MeshFoliageCount = FoliageCount;
								PV::Facades::FFoliageFacade MeshFoliage(Arrays);
								if (MeshFoliage.IsValid())
								{
									MeshSourcePathCount = 0;
									for (const FString& Name : MeshFoliage.GetFoliageNames()) if (!Name.IsEmpty()) ++MeshSourcePathCount;
									const int32 Compared = FMath::Min(FoliageCount, ReferenceLeaves.Num());
									for (int32 LeafIndex = 0; LeafIndex < Compared; ++LeafIndex)
									{
										const TSharedPtr<FJsonObject> Leaf = ReferenceLeaves[LeafIndex]->AsObject();
										if (!Leaf.IsValid()) continue;
										auto Read = [&](const TCHAR* Field, float ScaleFactor) -> FVector3f
										{
											const TArray<TSharedPtr<FJsonValue>>& Values = Leaf->GetArrayField(Field);
											return FVector3f(Values[0]->AsNumber() * ScaleFactor, -Values[1]->AsNumber() * ScaleFactor, Values[2]->AsNumber() * ScaleFactor);
										};
										MaxFoliagePositionErrorCm = FMath::Max(MaxFoliagePositionErrorCm, FVector3f::Distance(Read(TEXT("position_m"), 100), MeshFoliage.GetPivotPoint(LeafIndex)));
										MaxFoliageScaleError = FMath::Max(MaxFoliageScaleError, FMath::Abs(static_cast<float>(Leaf->GetNumberField(TEXT("scale_m"))) - MeshFoliage.GetScales()[LeafIndex]));
										MaxFoliageDirectionError = FMath::Max(MaxFoliageDirectionError,
											FMath::Max(FVector3f::Distance(Read(TEXT("up"), 1), MeshFoliage.GetUpVector(LeafIndex)),
												FVector3f::Distance(Read(TEXT("face"), 1), MeshFoliage.GetNormalVector(LeafIndex))));
									}
								}
							}
							if (FoliageCount > MaxFoliage)
							{
								MaxFoliage = FoliageCount;
								HostToUnitRadiusRatios.Reset();
								HostRadiusSamples = 0;
								HostThinnerThanUnit = 0;
								const auto* PointPositions = Arrays.FindAttribute<FVector3f>(PV::AttributeNames::PointPosition, PV::GroupNames::PointGroup);
								const auto* PointRadii = Arrays.FindAttribute<float>(PV::AttributeNames::PointScale, PV::GroupNames::PointGroup);
								PV::Facades::FBranchFacade Branches(Arrays);
								PV::Facades::FFoliageFacade Foliage(Arrays);
								if (PointPositions && PointRadii && Branches.IsValid() && Foliage.IsValid())
								{
									for (int32 FoliageIndex = 0; FoliageIndex < FoliageCount; ++FoliageIndex)
									{
										const int32 BranchIndex = Foliage.GetFoliageBranchId(FoliageIndex);
										if (BranchIndex < 0 || BranchIndex >= Branches.GetElementCount()) continue;
										const float InstanceScale = Foliage.GetScales()[FoliageIndex];
										if (InstanceScale <= KINDA_SMALL_NUMBER) continue;
										float BestDistSq = TNumericLimits<float>::Max();
										float HostRadius = 0.0f;
										for (const int32 PointIndex : Branches.GetPoints(BranchIndex))
										{
											if (PointIndex < 0 || PointIndex >= PointPositions->Num()) continue;
											const float DistSq = FVector3f::DistSquared((*PointPositions)[PointIndex], Foliage.GetPivotPoint(FoliageIndex));
											if (DistSq < BestDistSq)
											{
												BestDistSq = DistSq;
												HostRadius = (*PointRadii)[PointIndex];
											}
										}
										if (BestDistSq == TNumericLimits<float>::Max()) continue;
										const float Ratio = HostRadius / (UnitRootRadiusCm * InstanceScale);
										HostToUnitRadiusRatios.Add(Ratio);
										++HostRadiusSamples;
										if (Ratio < 1.0f) ++HostThinnerThanUnit;
									}
								}
							}
							MaxVertices = FMath::Max(MaxVertices, Arrays.NumElements(PV::GroupNames::VerticesGroup));
						}
					});
			}
		}
	}
	const bool bParityPass = ReferenceJSON.IsEmpty() ||
		(MeshFoliageCount == ReferenceLeaves.Num() && MaxFoliagePositionErrorCm < 0.05f &&
		 MaxFoliageScaleError < 0.0001f && MaxFoliageDirectionError < 0.0001f &&
		 (ReferenceLeaves.IsEmpty() || MeshSourcePathCount > 0));
	const bool bPass = bDone && (ReferenceOnly != 0 ? ReferenceMeshVertices > 0 : MaxBranches > 0) && MaxVertices > 0 &&
		(RequireFoliage == 0 || MaxFoliage > 0) && bParityPass &&
		(RequireBindings == 0 || (bGuardPassed && GuardedFoliage == MaxFoliage && UnboundFoliage == 0 && bRejectedInvalidAttachment)) &&
		(RequireResolved == 0 || (ResolvedFaces > 0 && ResolvedMaterials >= 1 && ResolvedMaterialPaths == ResolvedMaterials && UnboundVertices == 0)) && (DumpResolvedPath.IsEmpty() || bDumpResolved);
	TArray<int32> Generations;
	GenerationCounts.GetKeys(Generations);
	Generations.Sort();
	FString GenerationSummary;
	for (const int32 Generation : Generations)
	{
		if (!GenerationSummary.IsEmpty())
		{
			GenerationSummary += TEXT(",");
		}
		GenerationSummary += FString::Printf(TEXT("%d:%d"), Generation, GenerationCounts[Generation]);
	}
	HostToUnitRadiusRatios.Sort();
	const float P10HostToUnitRatio = HostToUnitRadiusRatios.IsEmpty() ? 0.0f : HostToUnitRadiusRatios[HostToUnitRadiusRatios.Num() / 10];
	const float MedianHostToUnitRatio = HostToUnitRadiusRatios.IsEmpty() ? 0.0f : HostToUnitRadiusRatios[HostToUnitRadiusRatios.Num() / 2];
	const float P90HostToUnitRatio = HostToUnitRadiusRatios.IsEmpty() ? 0.0f : HostToUnitRadiusRatios[HostToUnitRadiusRatios.Num() * 9 / 10];
	FString Report = FString::Printf(
		TEXT("{\"asset\":\"%s\",\"unit_root_radius_cm\":%.3f,\"completed\":%s,\"generation_finished\":%s,\"elapsed_seconds\":%.2f,\"inspected_outputs\":%d,\"max_branches\":%d,\"max_bones\":%d,\"branch_generations\":\"%s\",\"max_foliage\":%d,\"mesh_foliage\":%d,\"mesh_source_paths\":%d,\"reference_foliage\":%d,\"max_foliage_position_error_cm\":%.6f,\"max_foliage_scale_error\":%.6f,\"max_foliage_direction_error\":%.6f,\"host_radius_samples\":%d,\"host_thinner_than_unit\":%d,\"p10_host_to_unit_radius_ratio\":%.3f,\"median_host_to_unit_radius_ratio\":%.3f,\"p90_host_to_unit_radius_ratio\":%.3f,\"max_vertices\":%d,\"reference_mesh_vertices\":%d,\"reference_mesh_faces\":%d,\"reference_mesh_materials\":%d,\"reference_mesh_material_paths\":%d}\n"),
		*AssetPath,
		UnitRootRadiusCm,
		bPass ? TEXT("true") : TEXT("false"),
		bDone ? TEXT("true") : TEXT("false"),
		FPlatformTime::Seconds() - Start,
		InspectedOutputs,
		MaxBranches,
		MaxBones,
		*GenerationSummary,
		MaxFoliage,
		MeshFoliageCount,
		MeshSourcePathCount,
		ReferenceLeaves.Num(),
		MaxFoliagePositionErrorCm,
		MaxFoliageScaleError,
		MaxFoliageDirectionError,
		HostRadiusSamples,
		HostThinnerThanUnit,
		P10HostToUnitRatio,
		MedianHostToUnitRatio,
		P90HostToUnitRatio,
		MaxVertices,
		ReferenceMeshVertices,
		ReferenceMeshFaces,
		ReferenceMeshMaterials,
		ReferenceMeshMaterialPaths);
	TSharedPtr<FJsonObject> ReportObject;
	bool bRepairPass = true,bTrunkExportPass=true;
	if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Report), ReportObject))
	{
		ReportObject->SetNumberField(TEXT("resolved_faces"), ResolvedFaces);
		ReportObject->SetNumberField(TEXT("resolved_vertices"), ResolvedVertices);
		ReportObject->SetNumberField(TEXT("resolved_materials"), ResolvedMaterials);
		ReportObject->SetNumberField(TEXT("resolved_material_paths"), ResolvedMaterialPaths);
		ReportObject->SetNumberField(TEXT("resolved_sources"), ResolvedSources);
		ReportObject->SetNumberField(TEXT("resolved_instances"), ResolvedInstances);
		ReportObject->SetNumberField(TEXT("resolved_leaves"), ResolvedLeaves);
		ReportObject->SetNumberField(TEXT("resolved_organs"), ResolvedOrgans);
		ReportObject->SetNumberField(TEXT("unbound_resolved_vertices"), UnboundVertices);
		ReportObject->SetBoolField(TEXT("binding_guard_passed"), bGuardPassed);
		ReportObject->SetNumberField(TEXT("guarded_foliage"), GuardedFoliage);
		ReportObject->SetNumberField(TEXT("unbound_foliage"), UnboundFoliage);
		ReportObject->SetNumberField(TEXT("junction_attachment_adjustments"), JunctionAdjustments);
		ReportObject->SetBoolField(TEXT("rejected_invalid_attachment"), bRejectedInvalidAttachment);
		ReportObject->SetStringField(TEXT("resolved_bounds_min_cm"), ResolvedBounds.Min.ToString());
		ReportObject->SetStringField(TEXT("resolved_bounds_max_cm"), ResolvedBounds.Max.ToString());
		if (!RepairMesh.IsEmpty())
		{
			FString RepairError;
			bRepairPass = bPass && BoundForRepair && RepairMissingAssemblyBindings(LoadObject<USkeletalMesh>(nullptr, *RepairMesh), *BoundForRepair, ReportObject.ToSharedRef(), RepairError);
			ReportObject->SetStringField(TEXT("repair_mesh"), RepairMesh);
			ReportObject->SetBoolField(TEXT("mesh_repair_succeeded"), bRepairPass);
			ReportObject->SetStringField(TEXT("mesh_repair_error"), RepairError);
			ReportObject->SetBoolField(TEXT("completed"), bPass && bRepairPass);
		}
		if(!ExportTrunkFolder.IsEmpty()){FString ExportError;auto ExportReport=MakeShared<FJsonObject>();bTrunkExportPass=bPass&&TrunkExportCollection&&ExportBranchForgeTrunkAssets(*TrunkExportCollection,TrunkManifest,ExportTrunkFolder,ExportReport,ExportError);ExportReport->SetBoolField(TEXT("passed"),bTrunkExportPass);ExportReport->SetStringField(TEXT("error"),ExportError);ReportObject->SetObjectField(TEXT("trunk_export"),ExportReport);ReportObject->SetBoolField(TEXT("completed"),bPass&&bRepairPass&&bTrunkExportPass);}
		Report.Reset();
		FJsonSerializer::Serialize(ReportObject.ToSharedRef(), TJsonWriterFactory<>::Create(&Report));
	}
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(ReportPath), true);
	FFileHelper::SaveStringToFile(Report, *ReportPath);
	UE_LOG(LogTemp, Display, TEXT("PVE_WORKFLOW %s"), *Report);
	Source->RemoveFromRoot();
	return bPass && bRepairPass && bTrunkExportPass ? 0 : 3;
}
