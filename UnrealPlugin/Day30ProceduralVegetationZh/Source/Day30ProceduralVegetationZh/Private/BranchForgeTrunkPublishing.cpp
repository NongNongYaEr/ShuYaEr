#include "BranchForgeAssemblyLibrary.h"
#include "BranchForgeTrunkExport.h"
#include "ProceduralVegetation.h"
#include "ProceduralVegetationLink.h"
#include "PCGNode.h"
#include "Params/PVExportParams.h"
#include "AssetToolsModule.h"
#include "IAssetTools.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/Skeleton.h"
#include "Editor.h"
#include "ObjectTools.h"
#include "Subsystems/AssetEditorSubsystem.h"
#include "AssetCompilingManager.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Misc/ScopeExit.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/ArchiveReplaceObjectRef.h"
#include "UObject/MetaData.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "UObject/StrongObjectPtr.h"
#include "UObject/UnrealType.h"

namespace
{
FString JSON(const TSharedRef<FJsonObject>& Value)
{ FString Text;FJsonSerializer::Serialize(Value,TJsonWriterFactory<>::Create(&Text));return Text; }
FString Failure(const FString& Error)
{ auto Result=MakeShared<FJsonObject>();Result->SetBoolField(TEXT("passed"),false);Result->SetStringField(TEXT("error"),Error);return JSON(Result); }
FString ObjectPath(const FString& Package)
{ return Package+TEXT(".")+FPackageName::GetShortName(Package); }
FString Fingerprint(const FString& Package)
{
 const FString File=FPackageName::LongPackageNameToFilename(Package,FPackageName::GetAssetPackageExtension());
 if(!IFileManager::Get().FileExists(*File))return TEXT("");
 TArray<uint8> Bytes;if(!FFileHelper::LoadFileToArray(Bytes,*File))return TEXT("unreadable");
 return FSHA1::HashBuffer(Bytes.GetData(),Bytes.Num()).ToString();
}
bool Exists(const FString& Package)
{
 if(FPackageName::DoesPackageExist(Package))return true;
 // UE's unique-name search may leave an empty package after probing a missing asset.
 if(auto* Loaded=FindPackage(nullptr,*Package))
 {
  TArray<UObject*> Objects;GetObjectsWithOuter(Loaded,Objects,false);
  for(UObject* Object:Objects)if(Object->IsAsset())return true;
 }
 return false;
}
bool Dirty(const FString& Package)
{ auto* Loaded=FindPackage(nullptr,*Package);return Loaded&&Loaded->IsDirty(); }
UObject* LoadAsset(const FString& Package)
{ return LoadObject<UObject>(nullptr,*ObjectPath(Package)); }
void ReplaceReferences(UObject* Replacement,UObject* Previous)
{ TArray<UObject*> Objects{Previous};ObjectTools::ForceReplaceReferences(Replacement,Objects); }

void RemapParts(UObject* Asset,const TMap<FString,FString>& Paths)
{
 auto Remap=[&](FMeshNaniteSettings& Settings)
 { for(auto& Part:Settings.NaniteAssemblyData.Parts)if(const FString* New=Paths.Find(Part.MeshObjectPath.ToString()))Part.MeshObjectPath=FSoftObjectPath(*New); };
 if(auto* Static=Cast<UStaticMesh>(Asset))Remap(Static->GetNaniteSettings());
 if(auto* Skeletal=Cast<USkeletalMesh>(Asset)){auto Settings=Skeletal->GetNaniteSettings();Remap(Settings);Skeletal->SetNaniteSettings(Settings);}
}
}

FString UBranchForgeAssemblyLibrary::PlanTrunkExport(UObject* SourceAsset,const FString& FolderOverride)
{
 auto* Source=Cast<UProceduralVegetation>(SourceAsset);
 if(!Source||!Source->GetGraph()||!IsInGameThread())return Failure(TEXT("请选择 PVE 资产"));
 FPVExportParams Params;int32 Count=0;
 for(UPCGNode* Node:Source->GetGraph()->GetGraph()->GetNodes())
 {
  UObject* Settings=Node->GetSettings();
  if(Settings->GetClass()->GetFName()!=TEXT("PVExportSettings"))continue;
  auto* Property=FindFProperty<FStructProperty>(Settings->GetClass(),TEXT("ExportSettings"));
  if(!Property)return Failure(TEXT("导出节点缺少导出设置"));
  Params=*Property->ContainerPtrToValuePtr<FPVExportParams>(Settings);Count++;
 }
 if(Count!=1)return Failure(TEXT("请保留一个明确的导出节点"));
 if(!FolderOverride.IsEmpty())Params.ContentBrowserFolder.Path=FolderOverride;
 FString Error;if(!Params.Validate(Error))return Failure(Error);
 if(!Params.ContentBrowserFolder.Path.StartsWith(TEXT("/Game/")))return Failure(TEXT("请选择工程 /Game 下的导出目录"));
 const bool Skeletal=Params.ExportMeshType==EPVExportMeshType::SkeletalMesh;
 FString Mesh=Params.GetOutputMeshPackagePath(),Skeleton=Params.GetOutputSkeletonPackagePath();
 const bool Ignore=Params.ReplacePolicy==EPVAssetReplacePolicy::Ignore&&(Exists(Mesh)||(Skeletal&&Exists(Skeleton)));
 if(Params.ReplacePolicy==EPVAssetReplacePolicy::Append)
 {
  auto& Tools=FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools")).Get();FString Name;
  if(Exists(Mesh))Tools.CreateUniqueAssetName(Mesh,TEXT(""),Mesh,Name);
  if(Skeletal&&Exists(Skeleton))Tools.CreateUniqueAssetName(Skeleton,TEXT(""),Skeleton,Name);
 }
 const bool Replace=Params.ReplacePolicy==EPVAssetReplacePolicy::Replace;
 auto Expected=MakeShared<FJsonObject>();TArray<TSharedPtr<FJsonValue>> Overwrites;
 auto Check=[&](const FString& Package,UClass* Class)->bool
 {
  if(Dirty(Package)){Error=TEXT("目标资产有未保存修改，请先保存：")+Package;return false;}
  if(Exists(Package))
  {
   UObject* Old=LoadAsset(Package);
   if(!Old||!Old->IsA(Class)){Error=TEXT("目标路径被其他类型资产占用：")+Package;return false;}
   if(Replace)Overwrites.Add(MakeShared<FJsonValueString>(Package));
  }
  Expected->SetStringField(Package,Fingerprint(Package));return true;
 };
 if(!Ignore&&(!Check(Mesh,Skeletal?USkeletalMesh::StaticClass():UStaticMesh::StaticClass())||(Skeletal&&!Check(Skeleton,USkeleton::StaticClass()))))return Failure(Error);
 const FString Resources=Params.ContentBrowserFolder.Path/(FPackageName::GetShortName(Mesh)+TEXT("_Resources"));
 TArray<FAssetData> ExistingResources;
 FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get().GetAssetsByPath(FName(*Resources),ExistingResources,true);
 for(const auto& Asset:ExistingResources)Expected->SetStringField(Asset.PackageName.ToString(),Fingerprint(Asset.PackageName.ToString()));
 auto Plan=MakeShared<FJsonObject>();Plan->SetBoolField(TEXT("passed"),true);Plan->SetBoolField(TEXT("ignored"),Ignore);
 Plan->SetStringField(TEXT("source_asset"),Source->GetPathName());Plan->SetStringField(TEXT("folder"),Params.ContentBrowserFolder.Path);
 Plan->SetStringField(TEXT("mesh_type"),Skeletal?TEXT("skeletal"):TEXT("static"));
 Plan->SetStringField(TEXT("policy"),Replace?TEXT("replace"):Params.ReplacePolicy==EPVAssetReplacePolicy::Append?TEXT("append"):TEXT("ignore"));
 Plan->SetStringField(TEXT("mesh_package"),Mesh);Plan->SetStringField(TEXT("primary_asset"),ObjectPath(Mesh));
 Plan->SetStringField(TEXT("skeleton_package"),Skeletal?Skeleton:FString());Plan->SetStringField(TEXT("resources_folder"),Resources);
 Plan->SetObjectField(TEXT("expected_files"),Expected);Plan->SetArrayField(TEXT("overwrites"),Overwrites);
 return JSON(Plan);
}

FString UBranchForgeAssemblyLibrary::PublishTrunkExport(const FString& StagingFolder,const FString& PlanJSON)
{
 if(!GEditor||!IsInGameThread())return Failure(TEXT("成品发布必须在编辑器主线程执行"));
 static bool Publishing=false;
 if(Publishing)return Failure(TEXT("已有成品正在发布，请等待完成"));
 TGuardValue<bool> PublishingGuard(Publishing,true);
 if(!StagingFolder.StartsWith(TEXT("/Game/Developers/TreeDuck/ExportStaging/"))||StagingFolder.Contains(TEXT("..")))return Failure(TEXT("临时成品目录无效"));
 TSharedPtr<FJsonObject> Plan;if(!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(PlanJSON),Plan)||!Plan||!Plan->GetBoolField(TEXT("passed")))return Failure(TEXT("导出计划无效"));
 auto& Registry=FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();
 Registry.ScanPathsSynchronous({StagingFolder},true);
 const bool Skeletal=Plan->GetStringField(TEXT("mesh_type"))==TEXT("skeletal"),Replace=Plan->GetStringField(TEXT("policy"))==TEXT("replace");
 const FString SourceMesh=StagingFolder/(Skeletal?TEXT("SK_Trunk"):TEXT("SM_Trunk"));
 const FString SourceSkeleton=StagingFolder/TEXT("SKEL_Trunk");
 const FString TargetMesh=Plan->GetStringField(TEXT("mesh_package")),TargetSkeleton=Plan->GetStringField(TEXT("skeleton_package"));
 const FString Folder=Plan->GetStringField(TEXT("folder")),Resources=Plan->GetStringField(TEXT("resources_folder"));
 if(!TargetMesh.StartsWith(Folder+TEXT("/"))||!Resources.StartsWith(Folder+TEXT("/"))||
    (Skeletal&&!TargetSkeleton.StartsWith(Folder+TEXT("/")))||!Folder.StartsWith(TEXT("/Game/"))||Folder.Contains(TEXT("..")))return Failure(TEXT("导出目标目录无效"));
 if(Plan->GetBoolField(TEXT("ignored")))return Failure(TEXT("当前计划已按忽略策略跳过"));
 const auto Expected=Plan->GetObjectField(TEXT("expected_files"));
 for(const auto& Pair:Expected->Values)
 {
  const FString Package(Pair.Key.ToView());
  if(Dirty(Package)||Fingerprint(Package)!=Pair.Value->AsString())return Failure(TEXT("构建期间目标资产发生修改，未覆盖：")+Package);
 }

 TArray<FName> Packages{FName(*SourceMesh)};TSet<FName> Visited;TMap<FString,FString> PathMap;
 struct FMove
 {
  TStrongObjectPtr<UObject> Source,Asset,Old;
  UPackage* SourcePackage=nullptr;UPackage* TargetPackage=nullptr;
  FString SourcePath,SourceName,Target,TargetName,Manifest;
  bool Moved=false,OldDetached=false;
 };
 TArray<FMove> Moves;TMap<UObject*,UObject*> Duplicates;
 ON_SCOPE_EXIT
 {
  for(auto& Move:Moves)
  {
   // Staging files remain recoverable on disk without pinning a second tree in editor memory.
   if(Move.Source.IsValid())Move.Source->ClearFlags(RF_Standalone);
   if(Move.Asset.IsValid()&&!Move.Moved)Move.Asset->ClearFlags(RF_Public|RF_Standalone);
  }
 };
 FString Error;
 for(int32 I=0;I<Packages.Num();I++)
 {
  const FName Package=Packages[I];if(Visited.Contains(Package))continue;Visited.Add(Package);
  TArray<FName> Dependencies;Registry.GetDependencies(Package,Dependencies);
  for(FName Dependency:Dependencies)if(Dependency.ToString().StartsWith(StagingFolder+TEXT("/")))Packages.Add(Dependency);
  UObject* Asset=LoadAsset(Package.ToString());if(!Asset)return Failure(TEXT("临时成品依赖缺失：")+Package.ToString());
  FString Target;
  if(Package.ToString()==SourceMesh)Target=TargetMesh;
  else if(Package.ToString()==SourceSkeleton)Target=TargetSkeleton;
  else Target=Resources/Package.ToString().RightChop(StagingFolder.Len()+1);
  if(Target.IsEmpty()||!FPackageName::IsValidLongPackageName(Target))return Failure(TEXT("成品依赖目标路径无效"));
  FString Value;
  const bool HadSnapshot=Expected->TryGetStringField(Target,Value);
  if(Dirty(Target)||(HadSnapshot?Fingerprint(Target)!=Value:Exists(Target)))return Failure(TEXT("成品目标被占用或已经改变：")+Target);
  UObject* Old=Exists(Target)?LoadAsset(Target):nullptr;
  if(Old&&(!Replace||Old->GetClass()!=Asset->GetClass()))return Failure(TEXT("成品目标存在且不能按当前策略覆盖：")+Target);
  if(Old&&Target!=TargetMesh&&Target!=TargetSkeleton&&Old->GetOutermost()->GetMetaData().GetValue(Old,TEXT("TreeDuckOwnerRoot"))!=ObjectPath(TargetMesh))return Failure(TEXT("资源目录中有非本树生成的资产，未覆盖：")+Target);
  auto& Move=Moves.Emplace_GetRef();Move.Source.Reset(Asset);Move.Old.Reset(Old);
  Move.SourcePackage=CreatePackage(*(TEXT("/Temp/TreeDuckPublish_")+FGuid::NewGuid().ToString(EGuidFormats::Digits)));
  Move.Asset.Reset(StaticDuplicateObject(Asset,Move.SourcePackage,*Asset->GetName()));
  if(!Move.Asset.IsValid())return Failure(TEXT("无法准备成品副本"));
  Move.Asset->ClearFlags(RF_Transient);Move.Asset->SetFlags(RF_Public|RF_Standalone);
  Move.SourcePath=Move.Asset->GetPathName();Move.SourceName=Asset->GetName();Move.Target=Target;Move.TargetName=FPackageName::GetShortName(Target);
  Move.Manifest=Asset->GetOutermost()->GetMetaData().GetValue(Asset,TEXT("BranchForgeTrunkManifest"));
  Duplicates.Add(Asset,Move.Asset.Get());PathMap.Add(Asset->GetPathName(),ObjectPath(Target));
 }
 // Only copies are published; the validated staging assets remain available for recovery.
 for(auto& Move:Moves)
  FArchiveReplaceObjectRef<UObject> Remap(Move.Asset.Get(),Duplicates,EArchiveReplaceObjectFlags::IgnoreOuterRef|EArchiveReplaceObjectFlags::IgnoreArchetypeRef);
 TArray<UObject*> Compiling;for(auto& Move:Moves)Compiling.Add(Move.Asset.Get());FAssetCompilingManager::Get().FinishCompilationForObjects(Compiling);
 if(Skeletal&&!ValidateBranchForgeTrunkBinding(Cast<USkeletalMesh>(LoadAsset(SourceMesh)),MakeShared<FJsonObject>(),Error))return Failure(Error);

 const FString BackupRoot=FPaths::ProjectSavedDir()/TEXT("PVEWorkflow/PublishBackups")/FPaths::GetCleanFilename(StagingFolder);
 TMap<FString,FString> Backups;TArray<FString> NewFiles;
 for(auto& Move:Moves)for(const TCHAR* Extension:{TEXT(".uasset"),TEXT(".uexp"),TEXT(".ubulk"),TEXT(".uptnl")})
 {
  const FString File=FPaths::ConvertRelativePathToFull(FPackageName::LongPackageNameToFilename(Move.Target,Extension));
  if(IFileManager::Get().FileExists(*File))
  {
   const FString Saved=BackupRoot/Move.Target.RightChop(6)+Extension;IFileManager::Get().MakeDirectory(*FPaths::GetPath(Saved),true);
   if(IFileManager::Get().Copy(*Saved,*File)!=COPY_OK)return Failure(TEXT("无法备份旧成品，未发布：")+Move.Target);
   Backups.Add(File,Saved);
  }
  else NewFiles.Add(File);
 }
 auto Rollback=[&]()
 {
  TMap<FString,FString> Reverse;for(const auto& Pair:PathMap)Reverse.Add(Pair.Value,Pair.Key);
  for(auto& Move:Moves)if(Move.Moved)
  {
   Registry.AssetDeleted(Move.Asset.Get());Move.Asset->Rename(*Move.SourceName,Move.SourcePackage,REN_DontCreateRedirectors|REN_NonTransactional);
   RemapParts(Move.Asset.Get(),Reverse);
   Move.Moved=false;
  }
  for(auto& Move:Moves)if(Move.OldDetached)
  {
   Move.Old->Rename(*Move.TargetName,Move.TargetPackage,REN_DontCreateRedirectors|REN_NonTransactional);
   Move.Old->SetFlags(RF_Public|RF_Standalone);ReplaceReferences(Move.Old.Get(),Move.Asset.Get());Registry.AssetCreated(Move.Old.Get());
  }
  for(const auto& Pair:Backups)IFileManager::Get().Copy(*Pair.Key,*Pair.Value);
  for(const auto& File:NewFiles)if(File.StartsWith(FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir())))IFileManager::Get().Delete(*File,false,true);
 };
 for(auto& Move:Moves)
 {
  Move.TargetPackage=CreatePackage(*Move.Target);
  if(Move.Old.IsValid())
  {
   GEditor->GetEditorSubsystem<UAssetEditorSubsystem>()->CloseAllEditorsForAsset(Move.Old.Get());Registry.AssetDeleted(Move.Old.Get());
   Move.Old->ClearFlags(RF_Public|RF_Standalone);
   const FName OldName=MakeUniqueObjectName(GetTransientPackage(),Move.Old->GetClass(),TEXT("TreeDuckPrevious"));
   if(!Move.Old->Rename(*OldName.ToString(),GetTransientPackage(),REN_DontCreateRedirectors|REN_NonTransactional)){Rollback();return Failure(TEXT("不能暂存旧成品，发布已回退"));}
   Move.OldDetached=true;
  }
  if(!Move.Asset->Rename(*Move.TargetName,Move.TargetPackage,REN_DontCreateRedirectors|REN_NonTransactional)){Rollback();return Failure(TEXT("成品命名失败，发布已回退"));}
  Move.Moved=true;
  if(Move.Old.IsValid())ReplaceReferences(Move.Asset.Get(),Move.Old.Get());
  Registry.AssetCreated(Move.Asset.Get());
 }
 for(auto& Move:Moves)
 {
  RemapParts(Move.Asset.Get(),PathMap);
  Move.TargetPackage->GetMetaData().SetValue(Move.Asset.Get(),TEXT("TreeDuckOwnerRoot"),*ObjectPath(TargetMesh));
  if(!Move.Manifest.IsEmpty())Move.TargetPackage->GetMetaData().SetValue(Move.Asset.Get(),TEXT("BranchForgeTrunkManifest"),*Move.Manifest);
  Move.Asset->MarkPackageDirty();Move.Asset->PostEditChange();
 }
 if(Skeletal&&!ValidateBranchForgeTrunkBinding(Cast<USkeletalMesh>(LoadAsset(TargetMesh)),MakeShared<FJsonObject>(),Error)){Rollback();return Failure(Error);}
 for(auto& Move:Moves)
 {
  FSavePackageArgs Args;Args.TopLevelFlags=RF_Public|RF_Standalone;Args.SaveFlags=SAVE_NoError;
  const FString File=FPackageName::LongPackageNameToFilename(Move.Target,FPackageName::GetAssetPackageExtension());
  if(!UPackage::SavePackage(Move.TargetPackage,Move.Asset.Get(),*File,Args)){Rollback();return Failure(TEXT("保存成品失败，发布已回退"));}
 }
 for(auto& Move:Moves)if(Move.Old.IsValid())Move.Old->MarkAsGarbage();
 auto Result=MakeShared<FJsonObject>();Result->SetBoolField(TEXT("passed"),true);Result->SetStringField(TEXT("primary_asset"),ObjectPath(TargetMesh));
 Result->SetStringField(TEXT("output_folder"),Folder);Result->SetStringField(TEXT("resources_folder"),Resources);
 Result->SetStringField(Skeletal?TEXT("skeletal_mesh"):TEXT("static_mesh"),ObjectPath(TargetMesh));
 if(Skeletal)Result->SetStringField(TEXT("skeleton_asset"),ObjectPath(TargetSkeleton));
 Result->SetNumberField(TEXT("published_assets"),Moves.Num());Result->SetStringField(TEXT("backup_folder"),BackupRoot);
 return JSON(Result);
}
