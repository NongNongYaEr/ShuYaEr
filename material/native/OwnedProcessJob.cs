using System;using System.ComponentModel;using System.Diagnostics;using System.Runtime.InteropServices;
namespace TreeMaterialLab {
    // Windows closes all owned descendants when the host releases this job.
    sealed class OwnedProcessJob:IDisposable {
        [StructLayout(LayoutKind.Sequential)]struct Basic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinimumWorkingSet,MaximumWorkingSet;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
        [StructLayout(LayoutKind.Sequential)]struct Io {public ulong ReadOperations,WriteOperations,OtherOperations,ReadBytes,WriteBytes,OtherBytes;}
        [StructLayout(LayoutKind.Sequential)]struct Limits {public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr security,string name);
        [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int type,ref Limits limits,uint size);
        [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
        [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
        IntPtr handle;
        public OwnedProcessJob(){handle=CreateJobObject(IntPtr.Zero,null);if(handle==IntPtr.Zero)throw new Win32Exception();var limits=new Limits();limits.Basic.Flags=0x2000;if(!SetInformationJobObject(handle,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits)))){int error=Marshal.GetLastWin32Error();Dispose();throw new Win32Exception(error);}}
        public void Attach(Process process){if(handle==IntPtr.Zero)throw new ObjectDisposedException("OwnedProcessJob");if(!AssignProcessToJobObject(handle,process.Handle))throw new Win32Exception();}
        public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
    }
}
