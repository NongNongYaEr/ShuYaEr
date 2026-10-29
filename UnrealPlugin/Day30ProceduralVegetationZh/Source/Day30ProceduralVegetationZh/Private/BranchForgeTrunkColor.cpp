#include "BranchForgeTrunkColor.h"
#include "MeshDescription.h"
#include "StaticMeshAttributes.h"
#include "Engine/Texture2D.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceConstant.h"
#include "Materials/MaterialExpressionVertexColor.h"
#include "Materials/MaterialExpressionConstant4Vector.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Math/Float16Color.h"
#include "UObject/Package.h"
#include "Misc/PackageName.h"

bool BakeBranchForgeNaniteColors(FMeshDescription& Mesh,TArray<UMaterialInterface*>& Materials,const TArray<FName>& Slots,const FString& Folder,TArray<UObject*>& Assets,FString& Error)
{
 FStaticMeshAttributes A(Mesh);auto Colors=A.GetVertexInstanceColors();auto UV=A.GetVertexInstanceUVs();auto Names=A.GetPolygonGroupMaterialSlotNames();
 TArray<bool> Used,Uniform,NeedsColor;Used.Init(false,Materials.Num());Uniform.Init(true,Materials.Num());NeedsColor.Init(false,Materials.Num());TArray<FLinearColor> Constants;Constants.Init(FLinearColor::White,Materials.Num());TMap<int32,int32> Groups;
 for(auto Group:Mesh.PolygonGroups().GetElementIDs()){int32 Slot=Slots.Find(Names[Group]);if(Slot<0&&Materials.IsValidIndex(Group.GetValue()))Slot=Group.GetValue();if(!Materials.IsValidIndex(Slot)){Error=TEXT("Color bake material slot is invalid");return false;}Groups.Add(Group.GetValue(),Slot);}
 for(int32 I=0;I<Materials.Num();I++){if(!Materials[I])continue;auto* Base=Materials[I]->GetMaterial();Base->ConditionalPostLoad();for(UMaterialExpression* Expression:Base->GetExpressions())if(Cast<UMaterialExpressionVertexColor>(Expression)){NeedsColor[I]=true;break;}UE_LOG(LogTemp,Display,TEXT("TreeDuck color slot %d: %s, expressions=%d, uses_vertex_color=%d"),I,*Base->GetPathName(),Base->GetExpressions().Num(),int32(NeedsColor[I]));}
 bool Required=false,AtlasNeeded=false;for(auto Triangle:Mesh.Triangles().GetElementIDs()){const int32 Slot=Groups[Mesh.GetTrianglePolygonGroup(Triangle).GetValue()];if(!NeedsColor[Slot])continue;Required=true;for(auto Corner:Mesh.GetTriangleVertexInstances(Triangle)){const auto V=Colors[Corner];const FLinearColor Color(V.X,V.Y,V.Z,V.W);if(!Used[Slot]){Used[Slot]=true;Constants[Slot]=Color;}else if(!Constants[Slot].Equals(Color,.000001f))Uniform[Slot]=false;}AtlasNeeded|=!Uniform[Slot];}
 UE_LOG(LogTemp,Display,TEXT("TreeDuck color surface: triangles=%d, required=%d, atlas=%d"),Mesh.Triangles().Num(),int32(Required),int32(AtlasNeeded));if(!Required)return true;
 UTexture2D* Atlas=nullptr;
 if(AtlasNeeded){const int32 Count=Mesh.Triangles().Num(),Cells=FMath::RoundUpToPowerOfTwo(FMath::CeilToInt(FMath::Sqrt(float(Count)))),Width=Cells*2,Height=FMath::Max(2,FMath::DivideAndRoundUp(Count,Cells)*2);if(Width>8192||Height>8192){Error=TEXT("Vertex color atlas exceeds the supported texture size");return false;}TArray<FFloat16Color> Pixels;Pixels.SetNumZeroed(Width*Height);UV.SetNumChannels(FMath::Max(UV.GetNumChannels(),2));int32 N=0;
  for(auto Triangle:Mesh.Triangles().GetElementIDs()){const auto Corners=Mesh.GetTriangleVertexInstances(Triangle);FLinearColor C[3];for(int32 K=0;K<3;K++){const auto V=Colors[Corners[K]];C[K]=FLinearColor(V.X,V.Y,V.Z,V.W);}const int32 X=(N%Cells)*2,Y=(N/Cells)*2;Pixels[Y*Width+X]=FFloat16Color(C[0]);Pixels[Y*Width+X+1]=FFloat16Color(C[1]);Pixels[(Y+1)*Width+X]=FFloat16Color(C[2]);Pixels[(Y+1)*Width+X+1]=FFloat16Color(C[1]+C[2]-C[0]);const FVector2f Values[3]={{(X+.5f)/Width,(Y+.5f)/Height},{(X+1.5f)/Width,(Y+.5f)/Height},{(X+.5f)/Width,(Y+1.5f)/Height}};for(int32 K=0;K<3;K++)UV.Set(Corners[K],1,Values[K]);N++;}
  const FString Package=Folder/TEXT("T_VertexColor");if(FPackageName::DoesPackageExist(Package)){Error=TEXT("Color output exists; choose a new folder");return false;}Atlas=NewObject<UTexture2D>(CreatePackage(*Package),TEXT("T_VertexColor"),RF_Public|RF_Standalone);Atlas->Source.Init(Width,Height,1,1,TSF_RGBA16F,reinterpret_cast<const uint8*>(Pixels.GetData()));Atlas->SRGB=false;Atlas->CompressionSettings=TC_HDR;Atlas->MipGenSettings=TMGS_NoMipmaps;Atlas->Filter=TF_Bilinear;Atlas->AddressX=TA_Clamp;Atlas->AddressY=TA_Clamp;Atlas->PostEditChange();Assets.Add(Atlas);
 }
 for(int32 I=0;I<Materials.Num();I++){if(!Used[I]||!NeedsColor[I])continue;auto* Original=Materials[I];auto* Base=Original->GetMaterial();const FString Directory=Folder/FString::Printf(TEXT("Slot_%d"),I),Package=Directory/Base->GetName();if(FPackageName::DoesPackageExist(Package)){Error=TEXT("Color material output exists; choose a new folder");return false;}auto* Material=DuplicateObject<UMaterial>(Base,CreatePackage(*Package),Base->GetFName());Material->SetFlags(RF_Public|RF_Standalone);TArray<TObjectPtr<UMaterialExpression>> Expressions;Expressions.Append(Material->GetExpressions().GetData(),Material->GetExpressions().Num());
  for(UMaterialExpression* Expression:Expressions){if(!Cast<UMaterialExpressionVertexColor>(Expression))continue;UMaterialExpression* Replacement=nullptr;const bool UseAtlas=!Uniform[I];if(UseAtlas){auto* Coordinate=NewObject<UMaterialExpressionTextureCoordinate>(Material);Coordinate->CoordinateIndex=1;Coordinate->Material=Material;Material->GetExpressionCollection().AddExpression(Coordinate);auto* Sample=NewObject<UMaterialExpressionTextureSample>(Material);Sample->Texture=Atlas;Sample->SamplerType=SAMPLERTYPE_LinearColor;Sample->Coordinates.Expression=Coordinate;Sample->Material=Material;Material->GetExpressionCollection().AddExpression(Sample);Replacement=Sample;}else{auto* Constant=NewObject<UMaterialExpressionConstant4Vector>(Material);Constant->Constant=Constants[I];Constant->Material=Material;Material->GetExpressionCollection().AddExpression(Constant);Replacement=Constant;}
   auto Replace=[&](FExpressionInput* Input){if(Input&&Input->Expression==Expression){Input->Expression=Replacement;if(!UseAtlas)Input->OutputIndex=0;}};for(UMaterialExpression* Other:Material->GetExpressions())for(int32 InputIndex=0;;InputIndex++){auto* Input=Other->GetInput(InputIndex);if(!Input)break;Replace(Input);}for(int32 Property=0;Property<MP_MAX;Property++)Replace(Material->GetExpressionInputForProperty(EMaterialProperty(Property)));Material->GetExpressionCollection().RemoveExpression(Expression);
  }
  Material->SetMaterialUsage(MATUSAGE_SkeletalMesh);Material->SetMaterialUsage(MATUSAGE_Nanite);Material->PostEditChange();Assets.Add(Material);Materials[I]=Material;
  if(auto* OriginalInstance=Cast<UMaterialInstanceConstant>(Original)){const FString InstancePackage=Directory/TEXT("Instance")/Original->GetName();auto* Instance=DuplicateObject<UMaterialInstanceConstant>(OriginalInstance,CreatePackage(*InstancePackage),Original->GetFName());Instance->SetFlags(RF_Public|RF_Standalone);Instance->SetParentEditorOnly(Material,false);Instance->CopyMaterialUniformParametersEditorOnly(Original,true);Instance->PostEditChange();Materials[I]=Instance;Assets.Add(Instance);}
 }
 return true;
}
