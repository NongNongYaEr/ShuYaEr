#include "BranchForgeTrunkExport.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "StaticMeshAttributes.h"
#include "SkeletalMeshAttributes.h"
#include "BoneWeights.h"
#include "Rendering/SkeletalMeshRenderData.h"
#include "DynamicWindSkeletalData.h"
#include "AssetCompilingManager.h"
#include "Materials/MaterialInterface.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Engine/Texture2D.h"
#include "Math/Float16Color.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Animation/Skeleton.h"
#include "ReferenceSkeleton.h"
#include "Misc/PackageName.h"
#include "UObject/MetaData.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

namespace
{
bool AuditSavedColorAtlas(const FMeshDescription& D,const TArray<FSkeletalMaterial>& Materials,TSharedRef<FJsonObject> Report,FString& Error)
{
 FStaticMeshConstAttributes A(D);const auto UV=A.GetVertexInstanceUVs();const auto Color=A.GetVertexInstanceColors();const auto Names=A.GetPolygonGroupMaterialSlotNames();double MaxError=0;int32 Samples=0,Atlases=0;
 for(int32 Slot=0;Slot<Materials.Num();Slot++){
  auto* Interface=Materials[Slot].MaterialInterface.Get();if(!Interface)continue;UTexture2D* Texture=nullptr;
  for(UMaterialExpression* Expression:Interface->GetMaterial()->GetExpressions())if(auto* Sample=Cast<UMaterialExpressionTextureSample>(Expression))if(Sample->Texture&&Sample->Texture->GetName()==TEXT("T_VertexColor"))Texture=Cast<UTexture2D>(Sample->Texture);
  if(!Texture)continue;Atlases++;TArray64<uint8> Data;const int32 Width=Texture->Source.GetSizeX(),Height=Texture->Source.GetSizeY();if(UV.GetNumChannels()<2||!Texture->Source.GetMipData(Data,0)||Data.Num()!=int64(Width)*Height*sizeof(FFloat16Color)){Error=TEXT("Saved color atlas source or UV1 is missing");return false;}const auto* Pixels=reinterpret_cast<const FFloat16Color*>(Data.GetData());
  auto Texel=[&](int32 X,int32 Y){const auto& P=Pixels[FMath::Clamp(Y,0,Height-1)*Width+FMath::Clamp(X,0,Width-1)];return FVector4f(P.R.GetFloat(),P.G.GetFloat(),P.B.GetFloat(),P.A.GetFloat());};
  for(auto Triangle:D.Triangles().GetElementIDs()){const auto Group=D.GetTrianglePolygonGroup(Triangle);if(Names[Group]!=Materials[Slot].ImportedMaterialSlotName)continue;const auto V=D.GetTriangleVertexInstances(Triangle);const auto Positions=A.GetVertexPositions();if(Interface->GetPathName().Contains(TEXT("/Colors/SK_Complete_"))&&Positions[D.GetVertexInstanceVertex(V[0])].IsNearlyZero(0)&&Positions[D.GetVertexInstanceVertex(V[1])].IsNearlyZero(0)&&Positions[D.GetVertexInstanceVertex(V[2])].IsNearlyZero(0))continue;for(const auto Weights:{FVector3f(1,0,0),FVector3f(0,1,0),FVector3f(0,0,1),FVector3f(.2f,.3f,.5f)}){FVector2f U(0,0);FVector4f Expected(0,0,0,0);for(int32 K=0;K<3;K++){U+=UV.Get(V[K],1)*Weights[K];Expected+=Color[V[K]]*Weights[K];}const float X=U.X*Width-.5f,Y=U.Y*Height-.5f;const int32 IX=FMath::FloorToInt(X),IY=FMath::FloorToInt(Y);const auto Actual=FMath::Lerp(FMath::Lerp(Texel(IX,IY),Texel(IX+1,IY),X-IX),FMath::Lerp(Texel(IX,IY+1),Texel(IX+1,IY+1),X-IX),Y-IY);for(int32 K=0;K<4;K++)MaxError=FMath::Max(MaxError,double(FMath::Abs(Actual[K]-Expected[K])));Samples++;}}
 }
 Report->SetNumberField(TEXT("color_atlas_materials"),Atlases);Report->SetNumberField(TEXT("color_atlas_samples"),Samples);Report->SetNumberField(TEXT("color_atlas_max_error"),MaxError);if(MaxError>.002){Error=TEXT("Saved Nanite color atlas differs from source vertex colors");return false;}return true;
}
TSharedPtr<FJsonValue> Tuple(std::initializer_list<double> Values)
{
 TArray<TSharedPtr<FJsonValue>> Out;for(double Value:Values)Out.Add(MakeShared<FJsonValueNumber>(Value));return MakeShared<FJsonValueArray>(Out);
}
TSharedPtr<FJsonObject> DescriptionData(const FMeshDescription& D,bool Skeletal)
{
 auto Out=MakeShared<FJsonObject>();FStaticMeshConstAttributes A(D);FSkeletalMeshConstAttributes Skin(D);
 const auto Position=A.GetVertexPositions();const auto Normal=A.GetVertexInstanceNormals();const auto Tangent=A.GetVertexInstanceTangents();const auto UV=A.GetVertexInstanceUVs();const auto Color=A.GetVertexInstanceColors();
 TArray<TSharedPtr<FJsonValue>> Positions,Normals,Tangents,Colors,UVs,UV1,Faces,Groups,Slots,Weights;TMap<FVertexInstanceID,int32> Indices;
 for(const auto VI:D.VertexInstances().GetElementIDs())
 {
  Indices.Add(VI,Positions.Num());const auto Vertex=D.GetVertexInstanceVertex(VI);const auto P=Position[Vertex],N=Normal[VI],T=Tangent[VI];const auto U=UV.Get(VI,0);const auto C=Color[VI];
  Positions.Add(Tuple({P.X,P.Y,P.Z}));Normals.Add(Tuple({N.X,N.Y,N.Z}));Tangents.Add(Tuple({T.X,T.Y,T.Z}));Colors.Add(Tuple({C.X,C.Y,C.Z,C.W}));UVs.Add(Tuple({U.X,U.Y}));if(UV.GetNumChannels()>1){const auto Extra=UV.Get(VI,1);UV1.Add(Tuple({Extra.X,Extra.Y}));}
  if(Skeletal){TArray<TSharedPtr<FJsonValue>> Row;const auto W=Skin.GetVertexSkinWeights().Get(Vertex);for(const auto& Entry:W)Row.Add(Tuple({double(Entry.GetBoneIndex()),Entry.GetWeight()}));Weights.Add(MakeShared<FJsonValueArray>(Row));}
 }
 for(const auto Triangle:D.Triangles().GetElementIDs()){const auto V=D.GetTriangleVertexInstances(Triangle);Faces.Add(Tuple({double(Indices[V[0]]),double(Indices[V[1]]),double(Indices[V[2]])}));Groups.Add(MakeShared<FJsonValueNumber>(D.GetTrianglePolygonGroup(Triangle).GetValue()));}
 for(const auto Group:D.PolygonGroups().GetElementIDs())Slots.Add(MakeShared<FJsonValueString>(A.GetPolygonGroupMaterialSlotNames()[Group].ToString()));
 Out->SetArrayField(TEXT("position_cm"),Positions);Out->SetArrayField(TEXT("normal"),Normals);Out->SetArrayField(TEXT("tangent"),Tangents);Out->SetArrayField(TEXT("color"),Colors);Out->SetArrayField(TEXT("uv"),UVs);Out->SetArrayField(TEXT("uv1"),UV1);Out->SetArrayField(TEXT("faces"),Faces);Out->SetArrayField(TEXT("material_ids"),Groups);Out->SetArrayField(TEXT("slots"),Slots);if(Skeletal)Out->SetArrayField(TEXT("weights"),Weights);return Out;
}
TSharedPtr<FJsonObject> AssemblyData(const FNaniteAssemblyData& A)
{
 auto Out=MakeShared<FJsonObject>();TArray<TSharedPtr<FJsonValue>> Parts,Nodes;
 for(const auto& Part:A.Parts)Parts.Add(MakeShared<FJsonValueString>(Part.MeshObjectPath.ToString()));
 for(const auto& Node:A.Nodes){auto J=MakeShared<FJsonObject>();J->SetNumberField(TEXT("part"),Node.PartIndex);const auto M=Node.Transform.ToMatrixWithScale();TArray<TSharedPtr<FJsonValue>> Values,Weights;for(int32 R=0;R<4;R++)for(int32 C=0;C<4;C++)Values.Add(MakeShared<FJsonValueNumber>(M.M[R][C]));for(const auto& W:Node.BoneInfluences)Weights.Add(Tuple({double(W.BoneIndex),W.BoneWeight}));J->SetArrayField(TEXT("matrix"),Values);J->SetArrayField(TEXT("weights"),Weights);Nodes.Add(MakeShared<FJsonValueObject>(J));}
 Out->SetArrayField(TEXT("parts"),Parts);Out->SetArrayField(TEXT("nodes"),Nodes);return Out;
}
}
bool AuditBranchForgeTrunkAssets(const FString& Folder,TSharedRef<FJsonObject> Report,FString& Error,bool bDetailed,const FString& StaticPath,const FString& SkeletalPath)
{
 auto* Static=LoadObject<UStaticMesh>(nullptr,*(StaticPath.IsEmpty()?Folder/TEXT("SM_Trunk.SM_Trunk"):StaticPath));auto* Skeletal=LoadObject<USkeletalMesh>(nullptr,*(SkeletalPath.IsEmpty()?Folder/TEXT("SK_Trunk.SK_Trunk"):SkeletalPath));
 if(!Static||!Skeletal){Error=TEXT("Final exported meshes are missing");return false;}FAssetCompilingManager::Get().FinishCompilationForObjects({Static,Skeletal});
 if(!Static->GetMeshDescription(0)||!Skeletal->GetMeshDescription(0)){Error=TEXT("Final assets lost their source mesh");return false;}
 if(!ValidateBranchForgeTrunkBinding(Skeletal,Report,Error))return false;
 if(!AuditSavedColorAtlas(*Skeletal->GetMeshDescription(0),Skeletal->GetMaterials(),Report,Error))return false;
 const bool ValidStatic=Static->HasValidNaniteData(),ValidSkin=(Skeletal->GetResourceForRendering()&&Skeletal->GetResourceForRendering()->HasValidNaniteData());Report->SetBoolField(TEXT("static_nanite"),ValidStatic);Report->SetBoolField(TEXT("skeletal_nanite"),ValidSkin);
 Report->SetNumberField(TEXT("vertices"),Skeletal->GetMeshDescription(0)->Vertices().Num());
 Report->SetNumberField(TEXT("triangles"),Skeletal->GetMeshDescription(0)->Triangles().Num());
 Report->SetNumberField(TEXT("bone_count"),Skeletal->GetRefSkeleton().GetNum());
 Report->SetNumberField(TEXT("assembly_nodes"),Skeletal->GetNaniteSettings().NaniteAssemblyData.Nodes.Num());
 if(bDetailed)
 {
  Report->SetObjectField(TEXT("static"),DescriptionData(*Static->GetMeshDescription(0),false));Report->SetObjectField(TEXT("skeletal"),DescriptionData(*Skeletal->GetMeshDescription(0),true));
  Report->SetObjectField(TEXT("static_assembly"),AssemblyData(Static->GetNaniteSettings().NaniteAssemblyData));Report->SetObjectField(TEXT("skeletal_assembly"),AssemblyData(Skeletal->GetNaniteSettings().NaniteAssemblyData));
 }
 TArray<TSharedPtr<FJsonValue>> StaticMaterials,SkinMaterials,Bones,Parts;for(const auto& M:Static->GetStaticMaterials())StaticMaterials.Add(MakeShared<FJsonValueString>(GetPathNameSafe(M.MaterialInterface)));for(const auto& M:Skeletal->GetMaterials())SkinMaterials.Add(MakeShared<FJsonValueString>(GetPathNameSafe(M.MaterialInterface)));
 const auto& Ref=Skeletal->GetRefSkeleton();const auto* Wind=Skeletal->GetAssetUserData<UDynamicWindSkeletalData>();
 for(int32 I=0;I<Ref.GetNum();I++){auto Bone=MakeShared<FJsonObject>();Bone->SetStringField(TEXT("name"),Ref.GetBoneName(I).ToString());Bone->SetNumberField(TEXT("parent"),Ref.GetParentIndex(I));const auto P=Ref.GetRefBonePose()[I].GetTranslation();Bone->SetField(TEXT("local_position_cm"),Tuple({P.X,P.Y,P.Z}));Bone->SetNumberField(TEXT("wind_influence"),Wind?Wind->GetBoneInfluence(I):-1);Bones.Add(MakeShared<FJsonValueObject>(Bone));}
 for(const auto& Source:Skeletal->GetNaniteSettings().NaniteAssemblyData.Parts){auto* Part=LoadObject<USkeletalMesh>(nullptr,*Source.MeshObjectPath.ToString());if(!Part||!Part->GetMeshDescription(0)){Error=TEXT("Complete skeletal source part is missing");return false;}FAssetCompilingManager::Get().FinishCompilationForObjects({Part});auto J=bDetailed?DescriptionData(*Part->GetMeshDescription(0),true):MakeShared<FJsonObject>();if(!AuditSavedColorAtlas(*Part->GetMeshDescription(0),Part->GetMaterials(),J.ToSharedRef(),Error))return false;J->SetStringField(TEXT("asset"),Part->GetPathName());J->SetBoolField(TEXT("nanite"),(Part->GetResourceForRendering()&&Part->GetResourceForRendering()->HasValidNaniteData()));Parts.Add(MakeShared<FJsonValueObject>(J));}
 Report->SetArrayField(TEXT("static_materials"),StaticMaterials);Report->SetArrayField(TEXT("skeletal_materials"),SkinMaterials);Report->SetArrayField(TEXT("bones"),Bones);Report->SetArrayField(TEXT("complete_parts"),Parts);Report->SetBoolField(TEXT("wind_enabled"),Wind&&Wind->bIsEnabled);
 if(!ValidStatic||!ValidSkin){Error=TEXT("Final assets have no built Nanite rendering data");return false;}if(!Wind||!Wind->bIsEnabled){Error=TEXT("Final skeletal asset lost native wind data");return false;}return true;
}

bool ReplaceBranchForgeTrunkMesh(const FString& SourcePath,const FString& TargetPath,TSharedRef<FJsonObject> Report,FString& Error)
{
 auto* Source=LoadObject<USkeletalMesh>(nullptr,*SourcePath);
 auto* Target=LoadObject<USkeletalMesh>(nullptr,*TargetPath);
 if(!Source||!Target||Source==Target||!Target->GetSkeleton()){Error=TEXT("请选择不同的已验收源网格和待修复骨骼网格");return false;}
 FAssetCompilingManager::Get().FinishCompilationForObjects({Source,Target});
 if(!ValidateBranchForgeTrunkBinding(Source,Report,Error))return false;
 const auto* A=Source->GetMeshDescription(0);const auto* B=Target->GetMeshDescription(0);
 if(!A||!B||A->Vertices().Num()!=B->Vertices().Num()||A->Triangles().Num()!=B->Triangles().Num()
  ||!Source->GetNaniteSettings().NaniteAssemblyData.Nodes.IsEmpty()||!Target->GetNaniteSettings().NaniteAssemblyData.Nodes.IsEmpty())
 {Error=TEXT("原位修复仅接受几何相同且不含装配部件的树干；请使用新导出资产");return false;}
 // Compare triangle corners, including UV0 and normals, independent of IDs and
 // section ordering. Refuse replacement if the authored visible surface differs.
 auto Surface=[](const FMeshDescription& D)
 {
  FStaticMeshConstAttributes Attr(D);TArray<FString> Triangles;
  for(const auto Triangle:D.Triangles().GetElementIDs())
  {
   TArray<FString> Corners;
   for(const auto VI:D.GetTriangleVertexInstances(Triangle))
   {
    const auto P=Attr.GetVertexPositions()[D.GetVertexInstanceVertex(VI)],N=Attr.GetVertexInstanceNormals()[VI];const auto U=Attr.GetVertexInstanceUVs().Get(VI,0);
    Corners.Add(FString::Printf(TEXT("%lld,%lld,%lld/%lld,%lld,%lld/%lld,%lld"),FMath::RoundToInt64(P.X*1000),FMath::RoundToInt64(P.Y*1000),FMath::RoundToInt64(P.Z*1000),FMath::RoundToInt64(N.X*10000),FMath::RoundToInt64(N.Y*10000),FMath::RoundToInt64(N.Z*10000),FMath::RoundToInt64(U.X*100000),FMath::RoundToInt64(U.Y*100000)));
   }
   Corners.Sort();Triangles.Add(FString::Join(Corners,TEXT(";")));
  }
  Triangles.Sort();return Triangles;
 };
 if(Surface(*A)!=Surface(*B)){Error=TEXT("源与目标的表面位置、法线或UV不同，停止原位修复");return false;}
 auto* Skeleton=Target->GetSkeleton();Target->Modify();Skeleton->Modify();
 Target->SetRefSkeleton(Source->GetRefSkeleton());
 Target->GetMaterials()=Source->GetMaterials();Target->SetNaniteSettings(Source->GetNaniteSettings());
 Target->SetImportedBounds(Source->GetImportedBounds());
 Target->CreateMeshDescription(0,FMeshDescription(*A));
 if(!Target->CommitMeshDescription(0)){Error=TEXT("提交修复网格失败");return false;}
 Target->CalculateInvRefMatrices();Skeleton->RecreateBoneTree(Target);
 if(const auto* Wind=Source->GetAssetUserData<UDynamicWindSkeletalData>())
 {
  Target->RemoveUserDataOfClass(UDynamicWindSkeletalData::StaticClass());
  Target->AddAssetUserData(DuplicateObject<UDynamicWindSkeletalData>(Wind,Target));
 }
 Target->GetOutermost()->GetMetaData().SetValue(Target,TEXT("BranchForgeTrunkManifest"),*Source->GetOutermost()->GetMetaData().GetValue(Source,TEXT("BranchForgeTrunkManifest")));
 Target->Build();FAssetCompilingManager::Get().FinishCompilationForObjects({Target});
 if(!ValidateBranchForgeTrunkBinding(Target,Report,Error))return false;
 for(UObject* Object:{static_cast<UObject*>(Skeleton),static_cast<UObject*>(Target)})
 {
  Object->MarkPackageDirty();FSavePackageArgs Args;Args.TopLevelFlags=RF_Public|RF_Standalone;Args.SaveFlags=SAVE_NoError;
  const FString File=FPackageName::LongPackageNameToFilename(Object->GetOutermost()->GetName(),FPackageName::GetAssetPackageExtension());
  if(!UPackage::SavePackage(Object->GetOutermost(),Object,*File,Args)){Error=TEXT("保存修复的网格或骨架失败");return false;}
 }
 Report->SetBoolField(TEXT("surface_unchanged"),true);Report->SetStringField(TEXT("repaired_mesh"),Target->GetPathName());
 Report->SetNumberField(TEXT("bone_count"),Target->GetRefSkeleton().GetNum());
 return true;
}
