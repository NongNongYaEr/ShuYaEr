using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace BranchGeneratorFBXTool
{
    internal sealed class PlantServerProcess : IDisposable
    {
        // Apply Windows' extension-point policy before PowerShell initializes.
        // This excludes legacy Winsock providers from this child process.
        private const long DisableExtensionPoints = 1L << 32;
        private const int MitigationPolicyAttribute = 0x00020007;
        private const int HandleListAttribute = 0x00020002;
        private const uint ExtendedStartupInfo = 0x00080000;
        private const uint CreateNoWindow = 0x08000000;
        private const uint UnicodeEnvironment = 0x00000400;
        private const uint UseStdHandles = 0x00000100;

        private readonly SafeProcessHandle process;
        internal readonly StreamReader StandardOutput;
        internal readonly StreamReader StandardError;

        private PlantServerProcess(SafeProcessHandle process, StreamReader output, StreamReader error)
        {
            this.process = process;
            StandardOutput = output;
            StandardError = error;
        }

        internal static PlantServerProcess Start(ProcessStartInfo info)
        {
            StreamReader output = null, error = null;
            try
            {
                using (var input = new AnonymousPipeServerStream(PipeDirection.Out, HandleInheritability.Inheritable))
                {
                    var outputPipe = new AnonymousPipeServerStream(PipeDirection.In, HandleInheritability.Inheritable);
                    output = new StreamReader(outputPipe, info.StandardOutputEncoding);
                    var errorPipe = new AnonymousPipeServerStream(PipeDirection.In, HandleInheritability.Inheritable);
                    error = new StreamReader(errorPipe, info.StandardErrorEncoding);
                    SafeProcessHandle handle = Create(info, input.ClientSafePipeHandle, outputPipe.ClientSafePipeHandle, errorPipe.ClientSafePipeHandle);
                    input.DisposeLocalCopyOfClientHandle();
                    outputPipe.DisposeLocalCopyOfClientHandle();
                    errorPipe.DisposeLocalCopyOfClientHandle();
                    return new PlantServerProcess(handle, output, error);
                }
            }
            catch
            {
                if (output != null) output.Dispose();
                if (error != null) error.Dispose();
                throw;
            }
        }

        private static SafeProcessHandle Create(ProcessStartInfo info, SafePipeHandle input, SafePipeHandle output, SafePipeHandle error)
        {
            IntPtr size = IntPtr.Zero, list = IntPtr.Zero, environment = IntPtr.Zero;
            GCHandle policy = default(GCHandle), handles = default(GCHandle);
            bool initialized = false;
            try
            {
                InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
                list = Marshal.AllocHGlobal(size);
                Check(InitializeProcThreadAttributeList(list, 2, 0, ref size));
                initialized = true;
                policy = GCHandle.Alloc(new[] { DisableExtensionPoints }, GCHandleType.Pinned);
                Check(UpdateProcThreadAttribute(list, 0, new IntPtr(MitigationPolicyAttribute), policy.AddrOfPinnedObject(), new IntPtr(sizeof(long)), IntPtr.Zero, IntPtr.Zero));
                IntPtr[] inherited = { input.DangerousGetHandle(), output.DangerousGetHandle(), error.DangerousGetHandle() };
                handles = GCHandle.Alloc(inherited, GCHandleType.Pinned);
                Check(UpdateProcThreadAttribute(list, 0, new IntPtr(HandleListAttribute), handles.AddrOfPinnedObject(), new IntPtr(IntPtr.Size * inherited.Length), IntPtr.Zero, IntPtr.Zero));

                var startup = new StartupInfoEx {
                    Size = Marshal.SizeOf(typeof(StartupInfoEx)), Flags = UseStdHandles, Attributes = list,
                    StandardInput = inherited[0], StandardOutput = inherited[1], StandardError = inherited[2]
                };
                var variables = info.EnvironmentVariables;
                var entries = variables.Keys.Cast<string>().OrderBy(key => key, StringComparer.OrdinalIgnoreCase)
                    .Select(key => key + "=" + variables[key]);
                environment = Marshal.StringToHGlobalUni(string.Join("\0", entries) + "\0");
                var command = new StringBuilder("\"" + info.FileName + "\" " + info.Arguments);
                ProcessInformation created;
                Check(CreateProcess(info.FileName, command, IntPtr.Zero, IntPtr.Zero, true,
                    ExtendedStartupInfo | CreateNoWindow | UnicodeEnvironment, environment, info.WorkingDirectory, ref startup, out created));
                CloseHandle(created.Thread);
                return new SafeProcessHandle(created.Process, true);
            }
            finally
            {
                if (initialized) DeleteProcThreadAttributeList(list);
                if (policy.IsAllocated) policy.Free();
                if (handles.IsAllocated) handles.Free();
                Marshal.FreeHGlobal(list);
                Marshal.FreeHGlobal(environment);
            }
        }

        internal bool HasExited { get { return WaitForExit(0); } }
        internal int ExitCode
        {
            get { int code; Check(GetExitCodeProcess(process, out code)); return code; }
        }

        internal bool WaitForExit(int milliseconds)
        {
            uint result = WaitForSingleObject(process, (uint)milliseconds);
            Check(result != uint.MaxValue);
            return result == 0;
        }

        internal void Kill() { Check(TerminateProcess(process, 1)); }

        public void Dispose()
        {
            StandardOutput.Dispose();
            StandardError.Dispose();
            process.Dispose();
        }

        private static void Check(bool success)
        {
            if (!success) throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct StartupInfoEx
        {
            public int Size;
            public IntPtr Reserved, Desktop, Title;
            public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
            public ushort ShowWindow, ReservedLength;
            public IntPtr ReservedData, StandardInput, StandardOutput, StandardError, Attributes;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation
        {
            public IntPtr Process, Thread;
            public uint ProcessId, ThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
            bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInformation information);
        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeProcess(SafeProcessHandle process, out int code);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(SafeProcessHandle process, uint code);
    }
}
