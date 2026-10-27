#pragma once
#include "sl.h"
#include "sl_dlss.h"
// Manual integration: the editor owns all queues, resources and command lists.
// OTA is disabled; only the pinned signed production SDK is loaded.
struct EditorStreamline {
 HMODULE module=nullptr; bool initialized=false,supported=false;
 PFun_slShutdown* shutdown=nullptr;
 PFun_slSetD3DDevice* setDevice=nullptr;
 PFun_slIsFeatureSupported* featureSupported=nullptr;
 PFun_slGetFeatureFunction* featureFunction=nullptr;
 PFun_slGetNewFrameToken* newFrame=nullptr;
 PFun_slSetConstants* constants=nullptr;
 PFun_slSetTagForFrame* tag=nullptr;
 PFun_slEvaluateFeature* evaluate=nullptr;
 PFun_slFreeResources* freeResources=nullptr;
 PFun_slUpgradeInterface* upgrade=nullptr;
 PFun_slDLSSSetOptions* options=nullptr;
 PFun_slDLSSGetOptimalSettings* optimal=nullptr;
 sl::ViewportHandle viewport{1};
 int lastResult=-1;
 template<class T>T* function(const char* name){return reinterpret_cast<T*>(GetProcAddress(module,name));}
 void init(const std::filesystem::path& folder,const std::filesystem::path& logs) {
   module=LoadLibraryExW((folder/L"sl.interposer.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!module)return;
   auto initialize=function<PFun_slInit>("slInit");shutdown=function<PFun_slShutdown>("slShutdown");
   setDevice=function<PFun_slSetD3DDevice>("slSetD3DDevice");featureSupported=function<PFun_slIsFeatureSupported>("slIsFeatureSupported");featureFunction=function<PFun_slGetFeatureFunction>("slGetFeatureFunction");
   newFrame=function<PFun_slGetNewFrameToken>("slGetNewFrameToken");constants=function<PFun_slSetConstants>("slSetConstants");tag=function<PFun_slSetTagForFrame>("slSetTagForFrame");evaluate=function<PFun_slEvaluateFeature>("slEvaluateFeature");freeResources=function<PFun_slFreeResources>("slFreeResources");
   upgrade=function<PFun_slUpgradeInterface>("slUpgradeInterface");
   if(!initialize||!shutdown||!setDevice||!featureSupported||!featureFunction||!newFrame||!constants||!tag||!evaluate||!freeResources||!upgrade)return;
   const sl::Feature requested[]={sl::kFeatureDLSS};const auto path=folder.wstring(),log=logs.wstring();const wchar_t* paths[]={path.c_str()};sl::Preferences p{};
   p.flags=sl::PreferenceFlags::eDisableCLStateTracking|sl::PreferenceFlags::eUseManualHooking|sl::PreferenceFlags::eUseFrameBasedResourceTagging;
   p.pathsToPlugins=paths;p.numPathsToPlugins=1;p.pathToLogsAndData=log.c_str();p.featuresToLoad=requested;p.numFeaturesToLoad=1;p.engine=sl::EngineType::eCustom;p.engineVersion="BranchForge-editor-1";p.projectId="c4f87282-3550-4fa5-98ab-c53db6c31df7";p.renderAPI=sl::RenderAPI::eD3D12;
   lastResult=int(initialize(p,sl::kSDKVersion));initialized=lastResult==0;
 }
 void attach(ID3D12Device* device,LUID luid) {
   if(!initialized)return;sl::AdapterInfo info{};info.deviceLUID=reinterpret_cast<uint8_t*>(&luid);info.deviceLUIDSizeInBytes=sizeof(luid);
   supported=featureSupported(sl::kFeatureDLSS,info)==sl::Result::eOk&&setDevice(device)==sl::Result::eOk;
   void* raw=nullptr;if(supported&&featureFunction(sl::kFeatureDLSS,"slDLSSSetOptions",raw)==sl::Result::eOk)options=reinterpret_cast<PFun_slDLSSSetOptions*>(raw);
   raw=nullptr;if(supported&&featureFunction(sl::kFeatureDLSS,"slDLSSGetOptimalSettings",raw)==sl::Result::eOk)optimal=reinterpret_cast<PFun_slDLSSGetOptimalSettings*>(raw);
   supported=supported&&options&&optimal;
 }
 ~EditorStreamline(){if(initialized)shutdown();if(module)FreeLibrary(module);}
};
