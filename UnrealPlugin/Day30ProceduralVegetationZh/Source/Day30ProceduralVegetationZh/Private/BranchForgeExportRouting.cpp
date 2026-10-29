#include "BranchForgeExportRouting.h"
#include "BranchForgeAssemblyLibrary.h"
#include "PVBranchForgeSkeletonSettings.h"
#include "Editor.h"
#include "ProceduralVegetation.h"
#include "PCGNode.h"
#include "Framework/Commands/InputBindingManager.h"
#include "Framework/Commands/UICommandList.h"
#include "Subsystems/AssetEditorSubsystem.h"
#include "Toolkits/AssetEditorToolkit.h"
#include "Misc/CoreDelegates.h"
#include "Misc/FileHelper.h"
#include "Misc/MessageDialog.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Framework/Notifications/NotificationManager.h"
#include "Widgets/Notifications/SNotificationList.h"

namespace
{
FDelegateHandle InitHandle, OpenHandle;
struct FExportAction
{
 TWeakPtr<FUICommandList> Commands;
 TSharedPtr<const FUICommandInfo> Command;
 FUIAction Original;
};
TArray<FExportAction> Actions;
TMap<FString,TWeakPtr<SNotificationItem>> ExportNotifications;

bool IsImportedTrunk(UProceduralVegetation* Asset)
{
 if(!Asset||!Asset->GetGraph())return false;
 for(const UPCGNode* Node:Asset->GetGraph()->GetGraph()->GetNodes())
  if(const auto* Settings=Cast<UPVBranchForgeSkeletonSettings>(Node->GetSettings()))
  {
   FString Path=Settings->SkeletonFile.FilePath,Text;
   if(FPaths::IsRelative(Path))Path=FPaths::ProjectDir()/Path;
   TSharedPtr<FJsonObject> Source;
   return FFileHelper::LoadFileToString(Text,*Path)&&FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Source)&&Source&&Source->HasField(TEXT("imported_trunks"));
  }
 return false;
}

void OnOpened(UObject* Object,IAssetEditorInstance* Editor)
{
 auto* Asset=Cast<UProceduralVegetation>(Object);
 if(!Asset||!Editor)return;
 auto Command=FInputBindingManager::Get().FindCommandInContext(TEXT("PVPCGEditor"),TEXT("Export"));
 auto Commands=static_cast<FAssetEditorToolkit*>(Editor)->GetToolkitCommands();
 if(!Command)return;
 Actions.RemoveAll([](const FExportAction& Entry){return !Entry.Commands.IsValid();});
 for(const auto& Entry:Actions)if(Entry.Commands.Pin()==Commands)return;
 const FUIAction* Action=Commands->GetActionForCommand(Command.ToSharedRef());
 if(!Action)return;
 const FUIAction Original=*Action;
 Actions.Add({Commands,Command,Original});
 FUIAction Routed=Original;
 Routed.ExecuteAction=FExecuteAction::CreateLambda([Asset=TWeakObjectPtr<UProceduralVegetation>(Asset),Original]
 {
  if(!RouteImportedTrunkExport(Asset.Get()))Original.Execute();
 });
 Commands->UnmapAction(Command.ToSharedRef());
 Commands->MapAction(Command.ToSharedRef(),Routed);
}

void Install()
{
 if(GEditor&&!OpenHandle.IsValid())
  OpenHandle=GEditor->GetEditorSubsystem<UAssetEditorSubsystem>()->OnAssetOpenedInEditor().AddStatic(&OnOpened);
}
}

bool RouteImportedTrunkExport(UProceduralVegetation* Asset)
{
 if(!IsImportedTrunk(Asset))return false;
 // Imported geometry owns explicit two-control weights. The generic PVE bake
 // computes different weights; every editor/console entry must use the same job.
 const FString Command=FString::Printf(TEXT("py import branchforge_pve_trunk; branchforge_pve_trunk.export_from_pve_editor(\"%s\")"),*Asset->GetPathName().ReplaceCharWithEscapedChar());
 if(!GEditor||!GEditor->Exec(nullptr,*Command))
  FMessageDialog::Open(EAppMsgType::Ok,FText::FromString(TEXT("无法启动树干成品导出，请确认已启用 Python 并安装配套 PVE 工作台。")));
 return true;
}

void StartBranchForgeExportRouting()
{
 if(IsRunningCommandlet())return;
 InitHandle=FCoreDelegates::GetOnPostEngineInit().AddStatic(&Install);
 Install();
}

void StopBranchForgeExportRouting()
{
 FCoreDelegates::GetOnPostEngineInit().Remove(InitHandle);
 if(GEditor&&OpenHandle.IsValid())GEditor->GetEditorSubsystem<UAssetEditorSubsystem>()->OnAssetOpenedInEditor().Remove(OpenHandle);
 for(const auto& Entry:Actions)if(auto Commands=Entry.Commands.Pin())
 {
  Commands->UnmapAction(Entry.Command.ToSharedRef());
  Commands->MapAction(Entry.Command.ToSharedRef(),Entry.Original);
 }
 Actions.Reset();OpenHandle.Reset();InitHandle.Reset();
 for(const auto& Entry:ExportNotifications)if(auto Item=Entry.Value.Pin())Item->Fadeout();
 ExportNotifications.Reset();
}

void UBranchForgeAssemblyLibrary::UpdateTrunkExportNotification(const FString& Token,const FString& Message,const FString& Detail,const FString& ResultAsset,bool bFinished,bool bSucceeded)
{
 if(!IsInGameThread()||!GEditor)return;
 auto Item=ExportNotifications.FindRef(Token).Pin();
 if(!Item)
 {
  FNotificationInfo Info(FText::FromString(Message));
  Info.bFireAndForget=false;Info.bUseThrobber=true;Info.bUseSuccessFailIcons=true;Info.ExpireDuration=12.f;
  Info.ButtonDetails.Add(FNotificationButtonInfo(FText::FromString(TEXT("取消")),FText::FromString(TEXT("取消本次后台任务，保留已有成品")),FSimpleDelegate::CreateLambda([Token]
  {
   const FString Command=FString::Printf(TEXT("py import branchforge_pve_trunk; branchforge_pve_trunk.cancel_export(\"%s\")"),*Token.ReplaceCharWithEscapedChar());
   if(GEditor)GEditor->Exec(nullptr,*Command);
  }),SNotificationItem::CS_Pending));
  Info.ButtonDetails.Add(FNotificationButtonInfo(FText::FromString(TEXT("显示成品")),FText::FromString(TEXT("在内容浏览器中选中导出的模型")),FSimpleDelegate::CreateLambda([ResultAsset]
  {
   const FString Command=FString::Printf(TEXT("py import unreal; unreal.EditorAssetLibrary.sync_browser_to_objects([\"%s\"])"),*ResultAsset.ReplaceCharWithEscapedChar());
   if(GEditor)GEditor->Exec(nullptr,*Command);
  }),SNotificationItem::CS_Success));
  Item=FSlateNotificationManager::Get().AddNotification(Info);
  if(!Item)return;
  ExportNotifications.Add(Token,Item);Item->SetCompletionState(SNotificationItem::CS_Pending);
 }
 Item->SetText(FText::FromString(Message));Item->SetSubText(FText::FromString(Detail));
 if(bFinished)
 {
  Item->SetCompletionState(bSucceeded?SNotificationItem::CS_Success:SNotificationItem::CS_Fail);
  Item->ExpireAndFadeout();ExportNotifications.Remove(Token);
 }
}
