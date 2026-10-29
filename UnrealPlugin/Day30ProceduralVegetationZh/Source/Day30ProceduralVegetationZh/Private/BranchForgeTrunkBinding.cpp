#include "BranchForgeAssemblyLibrary.h"
#include "Engine/SkeletalMesh.h"
#include "BranchForgeTrunkExport.h"
#include "SkeletalMeshAttributes.h"
#include "BoneWeights.h"
#include "ReferenceSkeleton.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/MetaData.h"
#include "UObject/Package.h"

namespace
{
FString BindingReport(bool Passed,const FString& Error,int32 Vertices=0,int32 Nodes=0,double MaxError=0)
{
 auto J=MakeShared<FJsonObject>();J->SetBoolField(TEXT("passed"),Passed);J->SetStringField(TEXT("error"),Error);J->SetNumberField(TEXT("bound_vertices"),Vertices);J->SetNumberField(TEXT("control_nodes"),Nodes);J->SetNumberField(TEXT("max_position_error_cm"),MaxError);FString Out;FJsonSerializer::Serialize(J,TJsonWriterFactory<>::Create(&Out));return Out;
}
bool BindingFile(const FString& Root,const FString& Name,TArray<uint8>& Bytes)
{return FPaths::GetCleanFilename(Name)==Name&&!Name.Contains(TEXT(".."))&&FFileHelper::LoadFileToArray(Bytes,*(Root/Name));}
uint32 BindingU32(const uint8* P){uint32 V;FMemory::Memcpy(&V,P,4);return V;}
float BindingFloat(const uint8* P){float V;FMemory::Memcpy(&V,P,4);return V;}
struct FTrunkWeight { FVector3f Position;uint32 A=0,B=0;float W=0; };
FIntVector BindingKey(const FVector3f& P){return FIntVector(FMath::RoundToInt(P.X*100),FMath::RoundToInt(P.Y*100),FMath::RoundToInt(P.Z*100));}
}
static FString ProcessTrunkBinding(USkeletalMesh* Mesh,const FString& ManifestPath,bool bApply)
{
 if(!Mesh||!IsInGameThread())return BindingReport(false,TEXT("请选择本次原生导出的骨骼网格"));
 FString Text;TSharedPtr<FJsonObject> Manifest;if(!FFileHelper::LoadFileToString(Text,*ManifestPath)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Manifest)||!Manifest)return BindingReport(false,TEXT("装配清单无效"));
 const TSharedPtr<FJsonObject>* SkinPtr=nullptr;if(!Manifest->TryGetObjectField(TEXT("imported_trunk_skin"),SkinPtr)||!SkinPtr)return BindingReport(false,TEXT("包中没有固定树干权重"));const auto Skin=*SkinPtr;const FString Directory=FPaths::GetPath(ManifestPath);TArray<uint8> Weights,Geometry;
 if(Skin->GetIntegerField(TEXT("version"))!=1||Skin->GetIntegerField(TEXT("stride"))!=12||!BindingFile(Directory,Skin->GetStringField(TEXT("file")),Weights)||Weights.Num()!=Skin->GetNumberField(TEXT("bytes"))||Weights.Num()<8||FMemory::Memcmp(Weights.GetData(),"BFTS0001",8)||FSHA1::HashBuffer(Weights.GetData(),Weights.Num()).ToString()!=Skin->GetStringField(TEXT("sha1")).ToUpper())return BindingReport(false,TEXT("树干权重文件校验失败"));
 if(Manifest->GetIntegerField(TEXT("vertex_stride"))!=48||!BindingFile(Directory,Manifest->GetStringField(TEXT("binary")),Geometry)||Geometry.Num()<8||FSHA1::HashBuffer(Geometry.GetData(),Geometry.Num()).ToString()!=Manifest->GetStringField(TEXT("binary_sha1")).ToUpper())return BindingReport(false,TEXT("树干几何文件校验失败"));
 const auto& Nodes=Skin->GetArrayField(TEXT("nodes"));const auto& Chunks=Manifest->GetArrayField(TEXT("chunks"));const auto& Ref=Mesh->GetRefSkeleton();TArray<FTransform> World;World.Reserve(Ref.GetNum());for(int32 I=0;I<Ref.GetNum();I++){const int32 Parent=Ref.GetParentIndex(I);World.Add(Parent<0?Ref.GetRefBonePose()[I]:Ref.GetRefBonePose()[I]*World[Parent]);}
 bool StableNames=false;for(int32 I=0;I<Ref.GetNum();I++)StableNames|=Ref.GetBoneName(I).ToString().StartsWith(TEXT("BF_"));TArray<int32> NodeBones;double MaxError=0;for(const auto& Value:Nodes){const auto& P=Value->AsObject()->GetArrayField(TEXT("position_cm"));if(P.Num()!=3)return BindingReport(false,TEXT("控制骨骼位置无效"));FVector Position(P[0]->AsNumber(),P[1]->AsNumber(),P[2]->AsNumber());double Distance=MAX_dbl;int32 Bone=INDEX_NONE;for(int32 I=0;I<World.Num();I++){if(StableNames&&!Ref.GetBoneName(I).ToString().StartsWith(TEXT("BF_")+Value->AsObject()->GetStringField(TEXT("branch_id"))+TEXT("_")))continue;const double D=FVector::DistSquared(Position,World[I].GetTranslation());if(D<=Distance){Distance=D;Bone=I;}}MaxError=FMath::Max(MaxError,FMath::Sqrt(Distance));if(Bone<0||Distance>.0001)return BindingReport(false,TEXT("原生导出缺少控制骨骼；请关闭骨骼精简后重新导出"),0,Nodes.Num(),MaxError);NodeBones.Add(Bone);}
 TArray<FTrunkWeight> Sources;TMap<FIntVector,TArray<int32>> Spatial;for(const auto& Value:Skin->GetArrayField(TEXT("pieces"))){const auto P=Value->AsObject();const int32 ChunkIndex=P->GetIntegerField(TEXT("chunk")),Count=P->GetIntegerField(TEXT("count"));const int64 Offset=P->GetNumberField(TEXT("offset"));if(!Chunks.IsValidIndex(ChunkIndex)||Count<1||Offset<8||Offset+int64(Count)*12>Weights.Num())return BindingReport(false,TEXT("权重块范围无效"));const auto C=Chunks[ChunkIndex]->AsObject();const int64 VertexOffset=C->GetNumberField(TEXT("vertex_offset"));if(C->GetIntegerField(TEXT("vertex_count"))!=Count||VertexOffset<8||VertexOffset+int64(Count)*48>Geometry.Num())return BindingReport(false,TEXT("权重块与原始顶点不匹配"));for(int32 I=0;I<Count;I++){const uint8* W=Weights.GetData()+Offset+int64(I)*12;const uint8* V=Geometry.GetData()+VertexOffset+int64(I)*48;FTrunkWeight S;S.A=BindingU32(W);S.B=BindingU32(W+4);S.W=BindingFloat(W+8);S.Position=FVector3f(BindingFloat(V),BindingFloat(V+4),BindingFloat(V+8));if(!NodeBones.IsValidIndex(S.A)||!NodeBones.IsValidIndex(S.B)||!FMath::IsFinite(S.W)||S.W<0||S.W>1||S.Position.ContainsNaN())return BindingReport(false,TEXT("树干顶点权重无效"));Spatial.FindOrAdd(BindingKey(S.Position)).Add(Sources.Num());Sources.Add(S);}}
 FMeshDescription* Description=Mesh->GetMeshDescription(0);if(!Description)return BindingReport(false,TEXT("骨骼网格没有可校验的源网格"));FSkeletalMeshAttributes Attributes(*Description);auto SkinWeights=Attributes.GetVertexSkinWeights();if(!SkinWeights.IsValid())return BindingReport(false,TEXT("骨骼网格缺少蒙皮属性"));const auto Positions=Attributes.GetVertexPositions();TMap<FVertexID,int32> Matches;TMap<FIntVector,TArray<FVector3f>> Covered;
 for(const FVertexID Vertex:Description->Vertices().GetElementIDs()){const auto Key=BindingKey(Positions[Vertex]);int32 Found=INDEX_NONE;double Best=.0001;for(int32 X=-1;X<=1;X++)for(int32 Y=-1;Y<=1;Y++)for(int32 Z=-1;Z<=1;Z++)if(const auto* Candidates=Spatial.Find(Key+FIntVector(X,Y,Z)))for(const int32 I:*Candidates){const double D=FVector3f::DistSquared(Sources[I].Position,Positions[Vertex]);if(D<=Best){if(Found!=INDEX_NONE&&FMath::IsNearlyEqual(D,Best,1e-10)&& (Sources[I].A!=Sources[Found].A||Sources[I].B!=Sources[Found].B||!FMath::IsNearlyEqual(Sources[I].W,Sources[Found].W,1e-6)))return BindingReport(false,TEXT("重叠表面存在不同权重，需明确分区后导出"));Best=D;Found=I;}}if(Found!=INDEX_NONE){Matches.Add(Vertex,Found);Covered.FindOrAdd(BindingKey(Positions[Vertex])).Add(Positions[Vertex]);MaxError=FMath::Max(MaxError,FMath::Sqrt(Best));}}
 // Every distinct source surface must be represented. UV/material splits may
 // merge vertices, but a missing branch must never become a partial success.
 for(int32 I=0;I<Sources.Num();I++){bool Found=false;const auto Key=BindingKey(Sources[I].Position);for(int32 X=-1;X<=1&&!Found;X++)for(int32 Y=-1;Y<=1&&!Found;Y++)for(int32 Z=-1;Z<=1&&!Found;Z++)if(const auto* Candidates=Covered.Find(Key+FIntVector(X,Y,Z)))for(const auto& P:*Candidates)if(FVector3f::DistSquared(Sources[I].Position,P)<=.0001){Found=true;break;}if(!Found)return BindingReport(false,TEXT("原生导出几何与固定树干不一致，未修改权重"));}
 if(Matches.IsEmpty())return BindingReport(false,TEXT("没有匹配到任何树干顶点"));
 if(bApply)Mesh->Modify();
 for(const auto& Pair:Matches)
 {
  const auto& S=Sources[Pair.Value];
  const FBoneIndexType Bones[2]={FBoneIndexType(NodeBones[S.A]),FBoneIndexType(NodeBones[S.B])};
  const float Values[2]={1-S.W,S.W};
  const auto Expected=UE::AnimationCore::FBoneWeights::Create(Bones,Values,2);
  if(bApply){SkinWeights.Set(Pair.Key,Expected);continue;}
  const auto Actual=SkinWeights.Get(Pair.Key);
  if(Actual.Num()!=Expected.Num())return BindingReport(false,TEXT("树干蒙皮影响数量与原始权重不一致"));
  for(int32 I=0;I<Expected.Num();I++)
   if(Actual[I].GetBoneIndex()!=Expected[I].GetBoneIndex()||FMath::Abs(Actual[I].GetWeight()-Expected[I].GetWeight())>2.f/65535.f)
    return BindingReport(false,TEXT("树干蒙皮未绑定到原始控制骨骼"));
 }
 if(bApply)
 {
  if(!Mesh->CommitMeshDescription(0))return BindingReport(false,TEXT("无法提交校正后的蒙皮"));
  Mesh->Build();Mesh->PostEditChange();
  Mesh->GetOutermost()->GetMetaData().SetValue(Mesh,TEXT("BranchForgeTrunkManifest"),*FPaths::ConvertRelativePathToFull(ManifestPath));
  Mesh->MarkPackageDirty();
 }
 return BindingReport(true,TEXT(""),Matches.Num(),Nodes.Num(),MaxError);
}

FString UBranchForgeAssemblyLibrary::FinalizeTrunkBinding(USkeletalMesh* Mesh,const FString& ManifestPath)
{
 const FString Applied=ProcessTrunkBinding(Mesh,ManifestPath,true);
 TSharedPtr<FJsonObject> Result;
 if(!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Applied),Result)||!Result||!Result->GetBoolField(TEXT("passed")))return Applied;
 return ProcessTrunkBinding(Mesh,ManifestPath,false);
}

bool ValidateBranchForgeTrunkBinding(USkeletalMesh* Mesh,TSharedRef<FJsonObject> Report,FString& Error)
{
 const FString Manifest=Mesh?Mesh->GetOutermost()->GetMetaData().GetValue(Mesh,TEXT("BranchForgeTrunkManifest")):FString();
 if(Manifest.IsEmpty()){Error=TEXT("导出网格没有经过固定树干蒙皮验收，请通过工作台重新导出");return false;}
 TSharedPtr<FJsonObject> Result;
 if(!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(ProcessTrunkBinding(Mesh,Manifest,false)),Result)||!Result){Error=TEXT("树干蒙皮校验未返回有效结果");return false;}
 Report->SetObjectField(TEXT("trunk_skin"),Result);
 Report->SetStringField(TEXT("trunk_manifest"),Manifest);
 Error=Result->GetStringField(TEXT("error"));
 return Result->GetBoolField(TEXT("passed"));
}
