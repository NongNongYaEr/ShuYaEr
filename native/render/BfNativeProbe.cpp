// Development-only hardware probe. This is not the editor's viewport backend.
// Streamline is loaded from a pinned, signed SDK with OTA disabled.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <wrl/client.h>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <string>
#include <vector>
#include "sl.h"
#include "sl_dlss.h"
using Microsoft::WRL::ComPtr;
static void check(HRESULT r,const char* label){if(FAILED(r))throw std::runtime_error(std::string(label)+" HRESULT="+std::to_string((unsigned long)r));}
static std::string utf8(const wchar_t* text){const int n=WideCharToMultiByte(CP_UTF8,0,text,-1,nullptr,0,nullptr,nullptr);std::string out(n,'\0');WideCharToMultiByte(CP_UTF8,0,text,-1,out.data(),n,nullptr,nullptr);out.pop_back();return out;}
static std::string quote(const std::string& s){std::string o="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){o+='\\';o+=c;}else if(c=='\n')o+="\\n";else if(c=='\r')o+="\\r";else if(c<32)o+=' ';else o+=c;}return o+'"';}
template<class T>static T* symbol(HMODULE h,const char* name){auto p=reinterpret_cast<T*>(GetProcAddress(h,name));if(!p)throw std::runtime_error(std::string("Missing SDK export ")+name);return p;}
struct Handle{HANDLE h=nullptr;~Handle(){if(h)CloseHandle(h);}};
struct Streamline{
 HMODULE module=nullptr;bool initialized=false;PFun_slShutdown* shutdown=nullptr;int initResult=-1,setDeviceResult=-1,supportResult=-1,optimalResult=-1;
 PFun_slSetD3DDevice* setDevice=nullptr;PFun_slIsFeatureSupported* supported=nullptr;PFun_slGetFeatureFunction* featureFunction=nullptr;
 Streamline(const std::filesystem::path& folder,const std::filesystem::path& logs){
  module=LoadLibraryExW((folder/L"sl.interposer.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
  if(!module)throw std::runtime_error("Cannot load signed Streamline runtime");
  auto init=symbol<PFun_slInit>(module,"slInit");shutdown=symbol<PFun_slShutdown>(module,"slShutdown");setDevice=symbol<PFun_slSetD3DDevice>(module,"slSetD3DDevice");supported=symbol<PFun_slIsFeatureSupported>(module,"slIsFeatureSupported");featureFunction=symbol<PFun_slGetFeatureFunction>(module,"slGetFeatureFunction");
  const sl::Feature features[]={sl::kFeatureDLSS};const auto plugins=folder.wstring(),data=logs.wstring();const wchar_t* paths[]={plugins.c_str()};sl::Preferences p{};
  p.flags=sl::PreferenceFlags::eDisableCLStateTracking|sl::PreferenceFlags::eUseManualHooking|sl::PreferenceFlags::eUseFrameBasedResourceTagging;
  p.pathsToPlugins=paths;p.numPathsToPlugins=1;p.pathToLogsAndData=data.c_str();p.featuresToLoad=features;p.numFeaturesToLoad=1;p.engine=sl::EngineType::eCustom;p.engineVersion="BranchForge-native-probe-1";p.projectId="c4f87282-3550-4fa5-98ab-c53db6c31df7";p.renderAPI=sl::RenderAPI::eD3D12;
  initResult=static_cast<int>(init(p,sl::kSDKVersion));initialized=initResult==0;
 }
 ~Streamline(){if(initialized)shutdown();if(module)FreeLibrary(module);}
};
static std::vector<double> timestampProbe(ID3D12Device* device,ID3D12CommandQueue* queue,bool& verified,std::vector<unsigned>& firstPixel){
 constexpr UINT count=20,width=256,height=128;
 ComPtr<ID3D12CommandAllocator> allocator;check(device->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT,IID_PPV_ARGS(&allocator)),"allocator");
 ComPtr<ID3D12GraphicsCommandList> list;check(device->CreateCommandList(0,D3D12_COMMAND_LIST_TYPE_DIRECT,allocator.Get(),nullptr,IID_PPV_ARGS(&list)),"command list");
 D3D12_HEAP_PROPERTIES heap{};heap.Type=D3D12_HEAP_TYPE_DEFAULT;D3D12_RESOURCE_DESC desc{};desc.Dimension=D3D12_RESOURCE_DIMENSION_TEXTURE2D;desc.Width=width;desc.Height=height;desc.DepthOrArraySize=1;desc.MipLevels=1;desc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;desc.SampleDesc.Count=1;desc.Flags=D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
 ComPtr<ID3D12Resource> color;check(device->CreateCommittedResource(&heap,D3D12_HEAP_FLAG_NONE,&desc,D3D12_RESOURCE_STATE_RENDER_TARGET,nullptr,IID_PPV_ARGS(&color)),"color target");
 D3D12_DESCRIPTOR_HEAP_DESC hd{};hd.Type=D3D12_DESCRIPTOR_HEAP_TYPE_RTV;hd.NumDescriptors=1;ComPtr<ID3D12DescriptorHeap> rtv;check(device->CreateDescriptorHeap(&hd,IID_PPV_ARGS(&rtv)),"RTV heap");const auto handle=rtv->GetCPUDescriptorHandleForHeapStart();device->CreateRenderTargetView(color.Get(),nullptr,handle);
 D3D12_QUERY_HEAP_DESC qd{};qd.Count=count*2;qd.Type=D3D12_QUERY_HEAP_TYPE_TIMESTAMP;ComPtr<ID3D12QueryHeap> queries;check(device->CreateQueryHeap(&qd,IID_PPV_ARGS(&queries)),"timestamp heap");
 auto buffer=[&](UINT64 size){D3D12_RESOURCE_DESC b{};b.Dimension=D3D12_RESOURCE_DIMENSION_BUFFER;b.Width=size;b.Height=1;b.DepthOrArraySize=1;b.MipLevels=1;b.SampleDesc.Count=1;b.Layout=D3D12_TEXTURE_LAYOUT_ROW_MAJOR;D3D12_HEAP_PROPERTIES hp{};hp.Type=D3D12_HEAP_TYPE_READBACK;ComPtr<ID3D12Resource> out;check(device->CreateCommittedResource(&hp,D3D12_HEAP_FLAG_NONE,&b,D3D12_RESOURCE_STATE_COPY_DEST,nullptr,IID_PPV_ARGS(&out)),"readback");return out;};
 // Avoid a half-integer UNORM conversion (0.5 * 255) in exact readback checks.
 auto timestamps=buffer(count*2*sizeof(UINT64));for(UINT n=0;n<count;n++){list->EndQuery(queries.Get(),D3D12_QUERY_TYPE_TIMESTAMP,n*2);float c[]={.25f,.625f,.75f,1};list->ClearRenderTargetView(handle,c,0,nullptr);list->EndQuery(queries.Get(),D3D12_QUERY_TYPE_TIMESTAMP,n*2+1);}list->ResolveQueryData(queries.Get(),D3D12_QUERY_TYPE_TIMESTAMP,0,count*2,timestamps.Get(),0);
 D3D12_RESOURCE_BARRIER barrier{};barrier.Type=D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;barrier.Transition.pResource=color.Get();barrier.Transition.Subresource=D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;barrier.Transition.StateBefore=D3D12_RESOURCE_STATE_RENDER_TARGET;barrier.Transition.StateAfter=D3D12_RESOURCE_STATE_COPY_SOURCE;list->ResourceBarrier(1,&barrier);
 D3D12_PLACED_SUBRESOURCE_FOOTPRINT layout{};UINT64 bytes=0;device->GetCopyableFootprints(&desc,0,1,0,&layout,nullptr,nullptr,&bytes);auto pixels=buffer(bytes);D3D12_TEXTURE_COPY_LOCATION src{},dst{};src.pResource=color.Get();src.Type=D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;dst.pResource=pixels.Get();dst.Type=D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;dst.PlacedFootprint=layout;list->CopyTextureRegion(&dst,0,0,0,&src,nullptr);
 check(list->Close(),"close");ID3D12CommandList* lists[]={list.Get()};queue->ExecuteCommandLists(1,lists);ComPtr<ID3D12Fence> fence;check(device->CreateFence(0,D3D12_FENCE_FLAG_NONE,IID_PPV_ARGS(&fence)),"fence");Handle event;event.h=CreateEventW(nullptr,FALSE,FALSE,nullptr);if(!event.h)throw std::runtime_error("Fence event creation failed");check(queue->Signal(fence.Get(),1),"signal");check(fence->SetEventOnCompletion(1,event.h),"fence event");if(WaitForSingleObject(event.h,15000)!=WAIT_OBJECT_0)throw std::runtime_error("GPU fence timeout");check(device->GetDeviceRemovedReason(),"device removed");
 UINT64 frequency=0;check(queue->GetTimestampFrequency(&frequency),"GPU timestamp frequency");if(!frequency)throw std::runtime_error("Invalid timestamp frequency");UINT64* ticks=nullptr;D3D12_RANGE range{0,count*2*sizeof(UINT64)};check(timestamps->Map(0,&range,reinterpret_cast<void**>(&ticks)),"map timestamps");std::vector<double> result;for(UINT n=0;n<count;n++){if(ticks[n*2+1]<ticks[n*2])throw std::runtime_error("Invalid GPU timestamps");result.push_back(double(ticks[n*2+1]-ticks[n*2])*1000./double(frequency));}D3D12_RANGE empty{0,0};timestamps->Unmap(0,&empty);
 unsigned char* data=nullptr;range={0,SIZE_T(bytes)};check(pixels->Map(0,&range,reinterpret_cast<void**>(&data)),"map pixels");for(int n=0;n<4;n++)firstPixel.push_back(data[layout.Offset+n]);verified=true;for(UINT y=0;y<height;y++)for(UINT x=0;x<width;x++){auto p=data+layout.Offset+y*layout.Footprint.RowPitch+x*4;if(p[0]!=64||p[1]!=159||p[2]!=191||p[3]!=255)verified=false;}pixels->Unmap(0,&empty);return result;
}
int wmain(int argc,wchar_t** argv){
 if(argc!=3)return 2;const std::filesystem::path sdk=std::filesystem::absolute(argv[1]),report=std::filesystem::absolute(argv[2]);std::filesystem::create_directories(report.parent_path());std::ofstream out(report,std::ios::binary);
 try{
  Streamline sl(sdk,report.parent_path());ComPtr<IDXGIFactory6> factory;check(CreateDXGIFactory2(0,IID_PPV_ARGS(&factory)),"DXGI factory");ComPtr<IDXGIAdapter1> adapter;ComPtr<ID3D12Device> device;DXGI_ADAPTER_DESC1 ad{};
  for(UINT n=0;factory->EnumAdapterByGpuPreference(n,DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE,IID_PPV_ARGS(&adapter))!=DXGI_ERROR_NOT_FOUND;n++){adapter->GetDesc1(&ad);if(!(ad.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)&&SUCCEEDED(D3D12CreateDevice(adapter.Get(),D3D_FEATURE_LEVEL_12_0,IID_PPV_ARGS(&device))))break;adapter.Reset();}
  if(!device)throw std::runtime_error("No hardware D3D12 feature-level 12.0 device");
  D3D12_COMMAND_QUEUE_DESC q{};q.Type=D3D12_COMMAND_LIST_TYPE_DIRECT;ComPtr<ID3D12CommandQueue> queue;check(device->CreateCommandQueue(&q,IID_PPV_ARGS(&queue)),"graphics queue");
  bool verified=false;std::vector<unsigned> firstPixel;auto ms=timestampProbe(device.Get(),queue.Get(),verified,firstPixel);
  if(sl.initialized){sl::AdapterInfo info{};info.deviceLUID=reinterpret_cast<uint8_t*>(&ad.AdapterLuid);info.deviceLUIDSizeInBytes=sizeof(ad.AdapterLuid);sl.supportResult=static_cast<int>(sl.supported(sl::kFeatureDLSS,info));sl.setDeviceResult=static_cast<int>(sl.setDevice(device.Get()));}
  sl::DLSSOptimalSettings optimal{};if(sl.setDeviceResult==0&&sl.supportResult==0){void* raw=nullptr;if(sl.featureFunction(sl::kFeatureDLSS,"slDLSSGetOptimalSettings",raw)==sl::Result::eOk&&raw){sl::DLSSOptions options{};options.mode=sl::DLSSMode::eMaxQuality;options.outputWidth=1700;options.outputHeight=1050;sl.optimalResult=static_cast<int>(reinterpret_cast<PFun_slDLSSGetOptimalSettings*>(raw)(options,optimal));}}
  LARGE_INTEGER driver{};adapter->CheckInterfaceSupport(__uuidof(IDXGIDevice),&driver);
  out<<"{\n\"version\":1,\n\"adapter\":"<<quote(utf8(ad.Description))<<",\n\"vendor_id\":"<<ad.VendorId<<",\n\"device_id\":"<<ad.DeviceId<<",\n\"dedicated_video_memory\":"<<ad.DedicatedVideoMemory<<",\n\"driver_version_raw\":"<<driver.QuadPart<<",\n\"d3d12_hardware_device\":true,\n\"render_target_readback_verified\":"<<(verified?"true":"false")<<",\n\"gpu_timestamp_clear_ms\":[";
  for(size_t n=0;n<ms.size();n++){if(n)out<<',';out<<std::setprecision(9)<<ms[n];}
  out<<"],\n\"first_pixel_rgba\":["<<firstPixel[0]<<','<<firstPixel[1]<<','<<firstPixel[2]<<','<<firstPixel[3]<<"],\n\"gpu_timestamp_scope\":\"20 offscreen 256x128 clear commands; not editor frame times\",\n\"streamline\":{\"version\":\"2.14.16\",\"init_result\":"<<sl.initResult<<",\"set_device_result\":"<<sl.setDeviceResult<<",\"dlss_support_result\":"<<sl.supportResult<<",\"optimal_settings_result\":"<<sl.optimalResult<<",\"optimal_render_size\":["<<optimal.optimalRenderWidth<<','<<optimal.optimalRenderHeight<<"],\"output_size\":[1700,1050],\"ota_enabled\":false},\n\"editor_native_viewport\":\"not_integrated\",\n\"editor_dlss\":\"not_integrated\"\n}";
  return verified?0:3;
 }catch(const std::exception& error){out<<"{\"failure\":"<<quote(error.what())<<"}";return 1;}
}
