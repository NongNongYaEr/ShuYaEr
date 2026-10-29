#include "BranchForgeTrunkExport.h"
#include "BranchForgeTrunkColor.h"
#include "BranchForgeAssemblyLibrary.h"
#include "PVBranchForgeBindingSettings.h"
#include "GeometryCollection/GeometryCollection.h"
#include "Facades/PVBoneFacade.h"
#include "Facades/PVPointFacade.h"
#include "Misc/FileHelper.h"
#include "Facades/PVBranchFacade.h"
#include "Facades/PVFoliageFacade.h"
#include "Facades/PVAttributesNames.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Materials/MaterialInterface.h"
#include "Animation/Skeleton.h"
#include "SkeletalMeshAttributes.h"
#include "Rendering/SkeletalMeshModel.h"
#include "Rendering/SkeletalMeshLODModel.h"
#include "StaticMeshAttributes.h"
#include "ReferenceSkeleton.h"
#include "HAL/IConsoleManager.h"
#include "BoneWeights.h"
#include "NaniteAssemblyDataBuilder.h"
#include "DynamicWindImportData.h"
#include "DynamicWindSkeletalData.h"
#include "PVWindSettings.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetCompilingManager.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
FMeshDescription TrunkDescription(const FGeometryCollection& G,const TArray<PV::Facades::FBoneNode>& Bones,bool Skeletal)
{
 FMeshDescription D;FSkeletalMeshAttributes A(D);A.Register();auto Position=A.GetVertexPositions();auto Normal=A.GetVertexInstanceNormals();auto Tangent=A.GetVertexInstanceTangents();auto Signs=A.GetVertexInstanceBinormalSigns();auto UV=A.GetVertexInstanceUVs();UV.SetNumChannels(1);auto Color=A.GetVertexInstanceColors();auto Weights=A.GetVertexSkinWeights();const auto& PointIds=PV::Facades::FBoneFacade(G).GetVertexPointIds();TArray<FVertexID> Vertices;TArray<FPolygonGroupID> Groups;

 const int32 NumMaterials=G.NumElements(FGeometryCollection::MaterialGroup);for(int32 I=0;I<NumMaterials;I++){const auto Group=D.CreatePolygonGroup();Groups.Add(Group);A.GetPolygonGroupMaterialSlotNames()[Group]=FName(*FString::Printf(TEXT("TrunkSlot_%d"),I));}
 for(int32 I=0;I<G.Vertex.Num();I++){const auto Id=D.CreateVertex();Vertices.Add(Id);Position[Id]=G.Vertex[I];if(Skeletal){const auto* Bone=PV::Facades::FBoneFacade::FindClosestBone(G,const_cast<TArray<PV::Facades::FBoneNode>&>(Bones),PointIds[I]);const FBoneIndexType Index=Bone?Bone->BoneIndex:0;const float Weight=1;Weights.Set(Id,UE::AnimationCore::FBoneWeights::Create(&Index,&Weight,1));}}
 const auto& SourceUV=*G.FindUVLayer(0);for(int32 I=0;I<G.Indices.Num();I++){const auto Triangle=G.Indices[I];TArray<FVertexInstanceID,TInlineAllocator<3>> Corners;for(int32 K=0;K<3;K++){const int32 V=Triangle[K];const auto VI=D.CreateVertexInstance(Vertices[V]);Corners.Add(VI);Normal[VI]=G.Normal[V];Tangent[VI]=G.TangentU[V];Signs[VI]=FVector3f::DotProduct(FVector3f::CrossProduct(G.Normal[V],G.TangentU[V]),G.TangentV[V])<0?-1.f:1.f;UV.Set(VI,0,SourceUV[V]);const auto C=G.Color[V];Color[VI]=FVector4f(C.R,C.G,C.B,C.A);}D.CreateTriangle(Groups[G.MaterialID[I]],Corners);}
 return D;
}
USkeletalMesh* RigidCompletePart(UStaticMesh* Source,USkeleton* Skeleton,const FString& Folder,int32 Index,TArray<UObject*>& Assets,FString& Error)
{
 const FString Name=FString::Printf(TEXT("SK_Complete_%d"),Index),Path=Folder/TEXT("Parts")/Name;
 if(FPackageName::DoesPackageExist(Path)){Error=TEXT("Complete part output exists; use a new export folder");return nullptr;}
 const auto* Original=Source->GetMeshDescription(0);if(!Original){Error=TEXT("Complete source has no original mesh description");return nullptr;}
 FMeshDescription Description(*Original);FSkeletalMeshAttributes Attributes(Description);Attributes.Register();auto Weights=Attributes.GetVertexSkinWeights();const FBoneIndexType Root=0;const float Weight=1;
 for(const auto Vertex:Description.Vertices().GetElementIDs())Weights.Set(Vertex,UE::AnimationCore::FBoneWeights::Create(&Root,&Weight,1));
 TArray<UMaterialInterface*> PartMaterials;TArray<FName> PartSlots;for(const auto& M:Source->GetStaticMaterials()){PartMaterials.Add(M.MaterialInterface);PartSlots.Add(M.ImportedMaterialSlotName);}if(!BakeBranchForgeNaniteColors(Description,PartMaterials,PartSlots,Folder/TEXT("Colors")/Name,Assets,Error))return nullptr;auto* Part=NewObject<USkeletalMesh>(CreatePackage(*Path),*Name,RF_Public|RF_Standalone);
 FReferenceSkeleton Ref;{FReferenceSkeletonModifier Modifier(Ref,Skeleton);Modifier.Add(FMeshBoneInfo(TEXT("Root"),TEXT("Root"),INDEX_NONE),FTransform::Identity);}
 Part->SetRefSkeleton(Ref);Part->SetSkeleton(Skeleton);Part->GetImportedModel()->LODModels.Add(new FSkeletalMeshLODModel());Part->AddLODInfo();Part->SetNumSourceModels(1);
 auto* LOD=Part->GetLODInfo(0);LOD->BuildSettings.bRecomputeNormals=false;LOD->BuildSettings.bRecomputeTangents=false;LOD->BuildSettings.bRemoveDegenerates=false;
 Part->SetImportedBounds(Source->GetBounds());for(int32 I=0;I<Source->GetStaticMaterials().Num();I++){const auto& Material=Source->GetStaticMaterials()[I];Part->GetMaterials().Add(FSkeletalMaterial(PartMaterials[I],true,false,Material.MaterialSlotName,Material.ImportedMaterialSlotName));}
 Part->CreateMeshDescription(0,MoveTemp(Description));Part->CommitMeshDescription(0);auto Nanite=Part->GetNaniteSettings();Nanite.bEnabled=true;Part->SetNaniteSettings(Nanite);Part->CalculateInvRefMatrices();Part->Build();FAssetCompilingManager::Get().FinishCompilationForObjects({Part});return Part;
}
UStaticMesh* StaticCompletePart(UStaticMesh* Source,USkeletalMesh* Rigid,const FString& Folder,int32 Index,TArray<UObject*>& Assets,FString& Error)
{
 const FString Name=FString::Printf(TEXT("SM_Complete_%d"),Index),Path=Folder/TEXT("Parts")/Name;
 if(FPackageName::DoesPackageExist(Path)){Error=TEXT("Complete static part output exists; choose a new folder");return nullptr;}
 auto* Part=NewObject<UStaticMesh>(CreatePackage(*Path),*Name,RF_Public|RF_Standalone);auto& Model=Part->AddSourceModel();Model.BuildSettings.bRecomputeNormals=false;Model.BuildSettings.bRecomputeTangents=false;Model.BuildSettings.bRemoveDegenerates=false;
 for(const auto& Material:Rigid->GetMaterials())Part->GetStaticMaterials().Add(FStaticMaterial(Material.MaterialInterface,Material.MaterialSlotName,Material.ImportedMaterialSlotName));
 Part->CreateMeshDescription(0,*Rigid->GetMeshDescription(0));Part->CommitMeshDescription(0);Part->GetNaniteSettings()=Source->GetNaniteSettings();Part->GetNaniteSettings().bEnabled=true;Part->Build(false);FAssetCompilingManager::Get().FinishCompilationForObjects({Part});Assets.Add(Part);return Part;
}
bool SaveTrunkObject(UObject* Object)
{FSavePackageArgs Args;Args.TopLevelFlags=RF_Public|RF_Standalone;Args.SaveFlags=SAVE_NoError;const FString File=FPackageName::LongPackageNameToFilename(Object->GetOutermost()->GetName(),FPackageName::GetAssetPackageExtension());return UPackage::SavePackage(Object->GetOutermost(),Object,*File,Args);}
}
bool ExportBranchForgeTrunkAssets(const FManagedArrayCollection& Collection,const FString& Manifest,const FString& Folder,TSharedRef<FJsonObject> Report,FString& Error)
{
 const auto Enabled=[](const TCHAR* Name){const auto* Variable=IConsoleManager::Get().FindConsoleVariable(Name);return Variable&&Variable->GetInt()!=0;};
 if(!Enabled(TEXT("r.Nanite.AllowAssemblies"))&&!Enabled(TEXT("r.Nanite.Foliage"))){Error=TEXT("Enable Nanite Foliage or r.Nanite.AllowAssemblies=1 in this UE project before exporting complete-model assemblies");return false;}
 if(!Folder.StartsWith(TEXT("/Game/"))||Folder.Contains(TEXT(".."))||!FPackageName::IsValidLongPackageName(Folder)){Error=TEXT("Choose a new /Game content folder");return false;}const FString StaticPath=Folder/TEXT("SM_Trunk"),SkeletalPath=Folder/TEXT("SK_Trunk"),SkeletonPath=Folder/TEXT("SKEL_Trunk");for(const auto& Path:{StaticPath,SkeletalPath,SkeletonPath})if(FPackageName::DoesPackageExist(Path)||FindPackage(nullptr,*Path)){Error=TEXT("Output already exists; choose a new folder");return false;}
 FGeometryCollection G;Collection.CopyTo(&G);PV::Facades::FBoneFacade::DefineSchema(G);PV::Facades::FBoneFacade BoneFacade(G);TArray<PV::Facades::FBoneNode> Bones=BoneFacade.GetBoneDataFromCollection();
 // Rebuild the export copy without dropping any explicitly bound station.
 G.EmptyGroup(PV::GroupNames::BonesGroup);Bones.Reset();
 {
  auto& Stations=G.ModifyAttribute<float>(PV::AttributeNames::NjordPixelIndex,PV::GroupNames::PointGroup);
  const auto* StableIds=G.FindAttribute<FString>(TEXT("BranchForgeStableId"),PV::GroupNames::BranchGroup);
  FString MetadataText;TSharedPtr<FJsonObject> Metadata;
  if(!StableIds||!FFileHelper::LoadFileToString(MetadataText,*Manifest)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(MetadataText),Metadata)||!Metadata){Error=TEXT("Pinned trunk manifest is missing");return false;}
  const TSharedPtr<FJsonObject>* Skin=nullptr;if(!Metadata->TryGetObjectField(TEXT("imported_trunk_skin"),Skin)){Error=TEXT("Pinned trunk controls are missing");return false;}
  PV::Facades::FBranchFacade Branches(G);PV::Facades::FPointFacade Points(G);const auto& Positions=Points.GetPositions();TSet<int32> Pinned,ImportedBranches;
  for(const auto& Value:(*Skin)->GetArrayField(TEXT("nodes"))){const auto Node=Value->AsObject();const int32 Branch=StableIds->Find(Node->GetStringField(TEXT("branch_id")));if(Branch<0){Error=TEXT("Pinned control branch is missing");return false;}const auto& V=Node->GetArrayField(TEXT("position_cm"));if(V.Num()!=3){Error=TEXT("Pinned control position is invalid");return false;}const FVector3f Position(V[0]->AsNumber(),V[1]->AsNumber(),V[2]->AsNumber());float Distance=MAX_flt;int32 Closest=INDEX_NONE;for(int32 Point:Branches.GetPoints(Branch)){const float D=FVector3f::DistSquared(Position,Positions[Point]);if(D<Distance){Distance=D;Closest=Point;}}if(Closest<0||Distance>.0001){Error=TEXT("Actual PVE skeleton differs from the fixed trunk controls");return false;}Pinned.Add(Closest);ImportedBranches.Add(Branch);}
  float NextStation=2;for(float Station:Stations)NextStation=FMath::Max(NextStation,FMath::CeilToFloat(Station)+2);
  for(int32 Branch:ImportedBranches){const auto& Path=Branches.GetPoints(Branch);TArray<int32> Stops;for(int32 I=0;I<Path.Num();I++)if(I==0||I==Path.Num()-1||Pinned.Contains(Path[I]))Stops.Add(I);for(int32 Segment=1;Segment<Stops.Num();Segment++){const int32 Start=Stops[Segment-1],End=Stops[Segment];for(int32 I=Start;I<=End;I++)Stations[Path[I]]=NextStation+float(I-Start)/(End-Start);NextStation++;}NextStation+=2;}
  if(!BoneFacade.CreateBoneData(Bones,0,true)){Error=TEXT("Native PVE bone generation failed");return false;}
  // CreateBoneData returns an array; it does not populate the collection.
  // The attachment validator reads the collection, just like PVE export.
  for(auto& Bone:Bones)if(StableIds->IsValidIndex(Bone.BranchIndex))Bone.BoneName=FName(*FString::Printf(TEXT("BF_%s_%d"),*(*StableIds)[Bone.BranchIndex],Bone.BoneIndex));
  BoneFacade.SetBoneDataToCollection(Bones);
 }
 if(Bones.IsEmpty()||Bones.Num()>65535){Error=TEXT("Native PVE skeleton is empty or exceeds 65535 bones");return false;}if(!BindBranchForgeFoliage(G,Error))return false;
 const auto* MaterialPaths=G.FindAttribute<FString>(TEXT("MaterialPath"),FGeometryCollection::MaterialGroup);if(!MaterialPaths){Error=TEXT("Actual PVE materials are missing");return false;}TArray<UMaterialInterface*> Materials;for(const auto& Path:*MaterialPaths){auto* Material=LoadObject<UMaterialInterface>(nullptr,*Path);if(!Material){Error=TEXT("PVE material failed to load: ")+Path;return false;}Materials.Add(Material);}
 auto* Static=NewObject<UStaticMesh>(CreatePackage(*StaticPath),TEXT("SM_Trunk"),RF_Public|RF_Standalone);auto& Source=Static->AddSourceModel();Source.BuildSettings.bRecomputeNormals=false;Source.BuildSettings.bRecomputeTangents=false;Source.BuildSettings.bRemoveDegenerates=false;for(int32 I=0;I<Materials.Num();I++){const FName Slot(*FString::Printf(TEXT("TrunkSlot_%d"),I));Static->GetStaticMaterials().Add(FStaticMaterial(Materials[I],Slot,Slot));}Static->CreateMeshDescription(0,TrunkDescription(G,Bones,false));Static->CommitMeshDescription(0);Static->GetNaniteSettings().bEnabled=true;
 TArray<UObject*> NewParts;TArray<UMaterialInterface*> SkinMaterials(Materials);TArray<FName> TrunkSlots;for(int32 I=0;I<Materials.Num();I++)TrunkSlots.Add(FName(*FString::Printf(TEXT("TrunkSlot_%d"),I)));FMeshDescription SkinDescription=TrunkDescription(G,Bones,true);if(!BakeBranchForgeNaniteColors(SkinDescription,SkinMaterials,TrunkSlots,Folder/TEXT("Colors/Trunk"),NewParts,Error))return false;Static->CreateMeshDescription(0,SkinDescription);Static->CommitMeshDescription(0);for(int32 I=0;I<SkinMaterials.Num();I++)Static->GetStaticMaterials()[I].MaterialInterface=SkinMaterials[I];Materials=SkinMaterials;auto* Skeleton=NewObject<USkeleton>(CreatePackage(*SkeletonPath),TEXT("SKEL_Trunk"),RF_Public|RF_Standalone);auto* Skeletal=NewObject<USkeletalMesh>(CreatePackage(*SkeletalPath),TEXT("SK_Trunk"),RF_Public|RF_Standalone);FReferenceSkeleton Ref;{FReferenceSkeletonModifier Modifier(Ref,Skeleton);for(const auto& Bone:Bones){if(Bone.BoneIndex!=Ref.GetRawBoneNum()||Bone.ParentBoneIndex>=Bone.BoneIndex){Error=TEXT("PVE bone order is invalid");return false;}Modifier.Add(FMeshBoneInfo(Bone.BoneName,Bone.BoneName.ToString(),Bone.ParentBoneIndex),Bone.BoneTransform);}}
 Skeletal->SetRefSkeleton(Ref);Skeletal->SetSkeleton(Skeleton);Skeletal->GetImportedModel()->LODModels.Add(new FSkeletalMeshLODModel());Skeletal->AddLODInfo();Skeletal->SetNumSourceModels(1);FBox Bounds(ForceInit);for(const auto& Position:G.Vertex)Bounds+=FVector(Position);Skeletal->SetImportedBounds(FBoxSphereBounds(Bounds));auto* LOD=Skeletal->GetLODInfo(0);LOD->BuildSettings.bRecomputeNormals=false;LOD->BuildSettings.bRecomputeTangents=false;LOD->BuildSettings.bRemoveDegenerates=false;for(int32 I=0;I<Materials.Num();I++){const FName Slot(*FString::Printf(TEXT("TrunkSlot_%d"),I));Skeletal->GetMaterials().Add(FSkeletalMaterial(SkinMaterials[I],true,false,Slot,Slot));}Skeletal->CreateMeshDescription(0,MoveTemp(SkinDescription));Skeletal->CommitMeshDescription(0);auto Nanite=Skeletal->GetNaniteSettings();Nanite.bEnabled=true;Skeletal->SetNaniteSettings(Nanite);Skeletal->SetHasVertexColors(true);Skeletal->CalculateInvRefMatrices();Skeleton->MergeAllBonesToBoneTree(Skeletal);
 TMap<UStaticMesh*,UStaticMesh*> SharedStaticParts;TMap<UStaticMesh*,USkeletalMesh*> SharedSkinParts;PV::Facades::FFoliageFacade Foliage(G);FNaniteAssemblyDataBuilder StaticAssembly,SkinAssembly;for(int32 I=0;I<Materials.Num();I++){StaticAssembly.AddMaterialSlot(Materials[I]);SkinAssembly.AddMaterialSlot(SkinMaterials[I]);}
 for(int32 I=0;I<Foliage.NumFoliageEntries();I++){const int32 SourceId=Foliage.GetFoliageNameIDs()[I];const auto Info=Foliage.GetFoliageInfo(SourceId);auto* Part=Cast<UStaticMesh>(Info.Mesh.LoadSynchronous());const int32 Bone=Foliage.GetParentBoneID(I);if(!Part||Bone<0||Bone>=Bones.Num()){Error=TEXT("Complete source model or rigid attachment bone is missing");return false;}USkeletalMesh* Rigid=SharedSkinParts.FindRef(Part);if(!Rigid){Rigid=RigidCompletePart(Part,Skeleton,Folder,SharedSkinParts.Num(),NewParts,Error);if(!Rigid)return false;SharedSkinParts.Add(Part,Rigid);NewParts.Add(Rigid);}UStaticMesh* ColorPart=SharedStaticParts.FindRef(Part);if(!ColorPart){ColorPart=StaticCompletePart(Part,Rigid,Folder,SharedStaticParts.Num(),NewParts,Error);if(!ColorPart)return false;SharedStaticParts.Add(Part,ColorPart);}const int32 StaticPart=StaticAssembly.FindOrAddPart(FSoftObjectPath(ColorPart)),SkinPart=SkinAssembly.FindOrAddPart(FSoftObjectPath(Rigid));for(int32 M=0;M<Part->GetStaticMaterials().Num();M++){auto* Material=ColorPart->GetMaterial(M);int32 Index=Materials.Find(Material);if(Index<0){Index=Materials.Add(Material);StaticAssembly.AddMaterialSlot(Material);}UMaterialInterface* SkinMaterial=Rigid->GetMaterials()[M].MaterialInterface;int32 SkinIndex=SkinMaterials.Find(SkinMaterial);if(SkinIndex<0){SkinIndex=SkinMaterials.Add(SkinMaterial);SkinAssembly.AddMaterialSlot(SkinMaterial);}StaticAssembly.RemapPartMaterial(StaticPart,M,Index);SkinAssembly.RemapPartMaterial(SkinPart,M,SkinIndex);}Bounds+=Part->GetBoundingBox().TransformBy(Foliage.GetFoliageTransform(I));const FTransform3f Transform(Foliage.GetFoliageTransform(I));StaticAssembly.AddNode(StaticPart,Transform);FNaniteAssemblyBoneInfluence Influence;Influence.BoneIndex=Bone;Influence.BoneWeight=1;SkinAssembly.AddNode(SkinPart,Transform,ENaniteAssemblyNodeTransformSpace::Local,MakeArrayView(&Influence,1));}
 Skeletal->SetImportedBounds(FBoxSphereBounds(Bounds));
 if(Foliage.NumFoliageEntries()>0&&(!StaticAssembly.ApplyToStaticMesh(*Static)||!SkinAssembly.ApplyToSkeletalMesh(*Skeletal))){Error=TEXT("Native Nanite complete-model assembly failed");return false;}Static->Build(false);Skeletal->Build();FAssetCompilingManager::Get().FinishCompilationForObjects({Static,Skeletal});const FString SkinReport=UBranchForgeAssemblyLibrary::FinalizeTrunkBinding(Skeletal,Manifest);TSharedPtr<FJsonObject> SkinResult;if(!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(SkinReport),SkinResult)||!SkinResult||!SkinResult->GetBoolField(TEXT("passed"))){Error=TEXT("Pinned trunk skin failed: ")+SkinReport;return false;}FAssetCompilingManager::Get().FinishCompilationForObjects({Skeletal});
 auto* Preset=LoadObject<UPVWindSettings>(nullptr,TEXT("/ProceduralVegetationEditor/SampleAssets/WindSettings/DefaultTreeWindSettings.DefaultTreeWindSettings"));
 if(!Preset){Error=TEXT("Native PVE wind preset is missing");return false;}
 FDynamicWindSkeletalImportData Wind;Wind.SimulationGroups=Preset->SimulationGroupData;
 // The dummy root and actual model base must not inherit the trunk gust.
 const int32 FixedGroup=Wind.SimulationGroups.AddDefaulted();Wind.SimulationGroups[FixedGroup].Influence=0;
 PV::Facades::FBranchFacade Branches(G);
 for(const auto& Bone:Bones){FDynamicWindJointImportData Joint;Joint.JointName=Bone.BoneName;const bool Fixed=Bone.BranchIndex<0||(Branches.GetParentIndex(Bone.BranchIndex)==INDEX_NONE&&!Branches.GetPoints(Bone.BranchIndex).IsEmpty()&&Bone.PointIndex==Branches.GetPoints(Bone.BranchIndex)[0]);Joint.SimulationGroupIndex=Fixed?FixedGroup:Branches.GetBranchSimulationGroupIndex(Bone.BranchIndex);Wind.Joints.Add(Joint);}
 if(!DynamicWind::ImportSkeletalData(*Skeletal,Wind)){Error=TEXT("Native DynamicWind import failed");return false;}

 NewParts.Append({Static,Skeletal,Skeleton});TArray<FString> Written;
 for(UObject* Object:NewParts){const FString File=FPackageName::LongPackageNameToFilename(Object->GetOutermost()->GetName(),FPackageName::GetAssetPackageExtension());if(IFileManager::Get().FileExists(*File)){Error=TEXT("An output asset was created concurrently; choose a new folder");return false;}}
 for(UObject* Object:NewParts){Object->MarkPackageDirty();const FString File=FPackageName::LongPackageNameToFilename(Object->GetOutermost()->GetName(),FPackageName::GetAssetPackageExtension());Written.Add(File);if(!SaveTrunkObject(Object)){for(const auto& Created:Written){IFileManager::Get().Delete(*Created,false,true);const FString Base=FPaths::GetBaseFilename(Created,false);for(const TCHAR* Extension:{TEXT(".uexp"),TEXT(".ubulk"),TEXT(".uptnl")})IFileManager::Get().Delete(*(Base+Extension),false,true);}Error=TEXT("Failed to save generated UE assets; new partial outputs were removed");return false;}}
 for(UObject* Object:NewParts)FAssetRegistryModule::AssetCreated(Object);

 Report->SetStringField(TEXT("vertex_color_delivery"),TEXT("export_only_material_constants_or_linear_UV1_color_atlas_preserving_UV0"));Report->SetStringField(TEXT("static_mesh"),Static->GetPathName());Report->SetStringField(TEXT("skeletal_mesh"),Skeletal->GetPathName());Report->SetStringField(TEXT("skeleton_asset"),Skeleton->GetPathName());Report->SetObjectField(TEXT("trunk_skin"),SkinResult);Report->SetNumberField(TEXT("bone_count"),Bones.Num());Report->SetNumberField(TEXT("complete_instances"),Foliage.NumFoliageEntries());Report->SetBoolField(TEXT("dynamic_wind_data"),Skeletal->HasAssetUserDataOfClass(UDynamicWindSkeletalData::StaticClass()));Report->SetStringField(TEXT("export_api"),TEXT("public_UE_asset_builders_from_actual_PVE_collection"));return true;
}
