# Windows audio mixer server for Novora.
#
# Two modes:
#   1) Parameter mode (one shot):
#        powershell -NoProfile -STA -File volume.ps1 -Cmd list
#        powershell ... -Cmd set    -TargetPid 1234 -Volume 40
#        powershell ... -Cmd set    -Process chrome -Volume 40
#        powershell ... -Cmd mute   -TargetPid 1234 -Muted true
#        powershell ... -Cmd master -Volume 50
#   2) Stdin mode: one JSON object per line, one JSON line per reply.
#        {"id":1,"cmd":"list"}
#        {"id":2,"cmd":"set","pid":1234,"volume":40}
#        {"id":3,"cmd":"set","process":"chrome","volume":40}
#        {"id":4,"cmd":"mute","pid":1234,"muted":true}
#        {"id":5,"cmd":"master","volume":50}
#
# Replies: {"id":n,"ok":true,...} or {"id":n,"ok":false,"error":"..."}
# list -> {"id":n,"ok":true,"sessions":[{pid,process,name,volume,muted}]}
# Only set/mute/master touch the system; list and the ready line are read-only.

param(
  [string]$Cmd = '',
  [int]$TargetPid = 0,
  [string]$ProcessName = '',
  [double]$Volume = -1,
  [string]$Muted = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class AudioCtl
{
    public class SessionInfo
    {
        public int pid;
        public string process;
        public string name;
        public int volume;
        public bool muted;
        public int sessions;
    }

    private const int CLSCTX_ALL = 23;
    private const int E_RENDER = 0;
    private const int E_CAPTURE = 1;
    private const int E_MULTIMEDIA = 1;
    private const int E_COMMUNICATIONS = 2;

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role,
            [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,
            [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    // Flat declarations (no C# interface inheritance) keep the vtable offsets exact.
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(ref Guid guid, int flags,
            [MarshalAs(UnmanagedType.Interface)] out IAudioSessionControl control);
        [PreserveSig] int GetSimpleAudioVolume(ref Guid guid, int flags,
            [MarshalAs(UnmanagedType.Interface)] out ISimpleAudioVolume volume);
        [PreserveSig] int GetSessionEnumerator(
            [MarshalAs(UnmanagedType.Interface)] out IAudioSessionEnumerator enumerator);
        [PreserveSig] int RegisterSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterSessionNotification(IntPtr notify);
        [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr notify);
        [PreserveSig] int UnregisterDuckNotification(IntPtr notify);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index,
            [MarshalAs(UnmanagedType.Interface)] out IAudioSessionControl control);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
        [PreserveSig] int GetGroupingParam(out Guid grouping);
        [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid eventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notify);
    }

    // IID taken from audiopolicy.h (IID_IAudioSessionControl2).
    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
        [PreserveSig] int GetGroupingParam(out Guid grouping);
        [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid eventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notify);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool enable);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, IntPtr eventContext);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute(bool mute, IntPtr eventContext);
        [PreserveSig] int GetMute(out bool mute);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out int count);
        [PreserveSig] int SetMasterVolumeLevel(float level, IntPtr eventContext);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, IntPtr eventContext);
        [PreserveSig] int GetMasterVolumeLevel(out float level);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, IntPtr eventContext);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, IntPtr eventContext);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, IntPtr eventContext);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    private static void Check(int hr)
    {
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
    }

    private static void Release(object com)
    {
        try { if (com != null && Marshal.IsComObject(com)) Marshal.ReleaseComObject(com); }
        catch { }
    }

    private static IAudioSessionManager2 OpenManager(out object hold)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        hold = enumerator;
        IMMDevice device;
        Check(enumerator.GetDefaultAudioEndpoint(E_RENDER, E_MULTIMEDIA, out device));
        try
        {
            object obj;
            Guid iid = typeof(IAudioSessionManager2).GUID;
            Check(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out obj));
            return (IAudioSessionManager2)obj;
        }
        finally
        {
            Release(device);
        }
    }

    private static string CleanName(string raw)
    {
        if (raw == null) return "";
        string s = raw.Trim();
        if (s.Length == 0) return "";
        if (s[0] == '@') return "";                                        // indirect resource string
        if (s.StartsWith("{0.0.0.", StringComparison.Ordinal)) return "";   // device id prefix
        if (s.IndexOf("|%SystemRoot%", StringComparison.OrdinalIgnoreCase) >= 0) return "";
        return s;
    }

    private static string ProcName(uint pid)
    {
        try
        {
            using (Process p = Process.GetProcessById((int)pid)) return p.ProcessName;
        }
        catch { return ""; }
    }

    private static string ProcTitle(uint pid)
    {
        try
        {
            using (Process p = Process.GetProcessById((int)pid))
            {
                string t = p.MainWindowTitle;
                return t == null ? "" : t.Trim();
            }
        }
        catch { return ""; }
    }

    private static string BaseName(string processName)
    {
        if (processName == null) return "";
        string s = processName.Trim();
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s.Substring(0, s.Length - 4);
        return s;
    }

    public static List<SessionInfo> List()
    {
        var byPid = new Dictionary<uint, SessionInfo>();
        var order = new List<uint>();

        object hold;
        IAudioSessionManager2 manager = OpenManager(out hold);
        try
        {
            IAudioSessionEnumerator sessions;
            Check(manager.GetSessionEnumerator(out sessions));
            try
            {
                int count;
                Check(sessions.GetCount(out count));
                for (int i = 0; i < count; i++)
                {
                    IAudioSessionControl ctl;
                    if (sessions.GetSession(i, out ctl) != 0 || ctl == null) continue;
                    try
                    {
                        var ctl2 = ctl as IAudioSessionControl2;
                        var simple = ctl as ISimpleAudioVolume;
                        if (ctl2 == null || simple == null) continue;

                        uint pid;
                        if (ctl2.GetProcessId(out pid) != 0) continue;
                        if (pid == 0) continue;              // no process -> system sounds

                        float level = 0f;
                        bool muted = false;
                        if (simple.GetMasterVolume(out level) != 0) continue;
                        if (simple.GetMute(out muted) != 0) muted = false;

                        int vol = (int)Math.Round(Math.Max(0f, Math.Min(1f, level)) * 100.0);
                        string proc = ProcName(pid);
                        if (proc.Length == 0) continue;       // process already gone

                        string display = null;
                        ctl2.GetDisplayName(out display);
                        string name = CleanName(display);
                        if (name.Length == 0)
                        {
                            name = ProcTitle(pid);
                            if (name.Length == 0) name = proc;
                        }

                        SessionInfo existing;
                        if (byPid.TryGetValue(pid, out existing))
                        {
                            // Several sessions per process: report the loudest, muted only if all are muted.
                            if (vol > existing.volume) existing.volume = vol;
                            if (!muted) existing.muted = false;
                            existing.sessions++;
                        }
                        else
                        {
                            var info = new SessionInfo();
                            info.pid = (int)pid;
                            info.process = proc;
                            info.name = name;
                            info.volume = vol;
                            info.muted = muted;
                            info.sessions = 1;
                            byPid[pid] = info;
                            order.Add(pid);
                        }
                    }
                    finally
                    {
                        Release(ctl);
                    }
                }
            }
            finally
            {
                Release(sessions);
            }
        }
        finally
        {
            Release(manager);
            Release(hold);
        }

        var result = new List<SessionInfo>();
        for (int i = 0; i < order.Count; i++) result.Add(byPid[order[i]]);
        return result;
    }

    // Applies volume and/or mute to every session of the matching pid / process.
    private static int Apply(int pid, string process, bool setVolume, float volume,
                             bool setMute, bool mute)
    {
        string wanted = BaseName(process);
        int changed = 0;

        object hold;
        IAudioSessionManager2 manager = OpenManager(out hold);
        try
        {
            IAudioSessionEnumerator sessions;
            Check(manager.GetSessionEnumerator(out sessions));
            try
            {
                int count;
                Check(sessions.GetCount(out count));
                for (int i = 0; i < count; i++)
                {
                    IAudioSessionControl ctl;
                    if (sessions.GetSession(i, out ctl) != 0 || ctl == null) continue;
                    try
                    {
                        var ctl2 = ctl as IAudioSessionControl2;
                        var simple = ctl as ISimpleAudioVolume;
                        if (ctl2 == null || simple == null) continue;

                        uint spid;
                        if (ctl2.GetProcessId(out spid) != 0 || spid == 0) continue;

                        bool match;
                        if (pid > 0) match = (spid == (uint)pid);
                        else if (wanted.Length > 0)
                        {
                            string pn = ProcName(spid);
                            match = pn.Length > 0 &&
                                (string.Equals(pn, wanted, StringComparison.OrdinalIgnoreCase) ||
                                 string.Equals(BaseName(pn), wanted, StringComparison.OrdinalIgnoreCase));
                        }
                        else match = false;

                        if (!match) continue;

                        bool touched = false;
                        if (setVolume && simple.SetMasterVolume(volume, IntPtr.Zero) == 0) touched = true;
                        if (setMute && simple.SetMute(mute, IntPtr.Zero) == 0) touched = true;
                        if (touched) changed++;
                    }
                    finally
                    {
                        Release(ctl);
                    }
                }
            }
            finally
            {
                Release(sessions);
            }
        }
        finally
        {
            Release(manager);
            Release(hold);
        }

        if (changed == 0)
        {
            if (pid > 0) throw new InvalidOperationException("no audio session for pid " + pid);
            if (wanted.Length > 0) throw new InvalidOperationException("no audio session for process " + wanted);
            throw new InvalidOperationException("pid or process required");
        }
        return changed;
    }

    public static int SetVolume(int pid, string process, float volume)
    {
        if (volume < 0f || volume > 1f) throw new ArgumentOutOfRangeException("volume", "volume must be 0..1");
        return Apply(pid, process, true, volume, false, false);
    }

    public static int SetMuted(int pid, string process, bool muted)
    {
        return Apply(pid, process, false, 0f, true, muted);
    }

    private static IAudioEndpointVolume OpenEndpoint(int dataFlow, int role)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice device;
        Check(enumerator.GetDefaultAudioEndpoint(dataFlow, role, out device));
        try
        {
            object obj;
            Guid iid = typeof(IAudioEndpointVolume).GUID;
            Check(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out obj));
            return (IAudioEndpointVolume)obj;
        }
        finally
        {
            Release(device);
            Release(enumerator);
        }
    }

    private static IAudioEndpointVolume OpenMaster()
    {
        return OpenEndpoint(E_RENDER, E_MULTIMEDIA);
    }

    public static void SetMasterVolume(float volume)
    {
        if (volume < 0f || volume > 1f) throw new ArgumentOutOfRangeException("volume", "volume must be 0..1");
        var master = OpenMaster();
        try { Check(master.SetMasterVolumeLevelScalar(volume, IntPtr.Zero)); }
        finally { Release(master); }
    }

    public static int GetMasterVolume()
    {
        var master = OpenMaster();
        try
        {
            float level;
            Check(master.GetMasterVolumeLevelScalar(out level));
            return (int)Math.Round(Math.Max(0f, Math.Min(1f, level)) * 100.0);
        }
        finally { Release(master); }
    }

    public static int StepMasterVolume(int delta)
    {
        var master = OpenMaster();
        try
        {
            float level;
            Check(master.GetMasterVolumeLevelScalar(out level));
            int cur = (int)Math.Round(Math.Max(0f, Math.Min(1f, level)) * 100.0);
            int next = Math.Max(0, Math.Min(100, cur + delta));
            Check(master.SetMasterVolumeLevelScalar(next / 100.0f, IntPtr.Zero));
            if (delta > 0) master.SetMute(false, IntPtr.Zero);
            return next;
        }
        finally { Release(master); }
    }

    public static bool ToggleMasterMute()
    {
        var master = OpenMaster();
        try
        {
            bool muted;
            Check(master.GetMute(out muted));
            bool next = !muted;
            Check(master.SetMute(next, IntPtr.Zero));
            return next;
        }
        finally { Release(master); }
    }

    private static IAudioSessionManager2 OpenManagerFlow(int dataFlow, int role, out object hold)
    {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        hold = enumerator;
        IMMDevice device;
        Check(enumerator.GetDefaultAudioEndpoint(dataFlow, role, out device));
        try
        {
            object obj;
            Guid iid = typeof(IAudioSessionManager2).GUID;
            Check(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out obj));
            return (IAudioSessionManager2)obj;
        }
        finally
        {
            Release(device);
        }
    }

    public static bool ToggleSessionMute(int dataFlow, string process, out int changedOut)
    {
        string wanted = BaseName(process);
        if (wanted.Length == 0) throw new InvalidOperationException("process required");
        int[] roles = dataFlow == E_CAPTURE ? new int[] { E_COMMUNICATIONS, E_MULTIMEDIA } : new int[] { E_MULTIMEDIA };
        bool? targetState = null;
        int changed = 0;

        foreach (int role in roles)
        {
            object hold = null;
            IAudioSessionManager2 manager = null;
            try
            {
                manager = OpenManagerFlow(dataFlow, role, out hold);
                IAudioSessionEnumerator sessions;
                Check(manager.GetSessionEnumerator(out sessions));
                try
                {
                    int count;
                    Check(sessions.GetCount(out count));
                    for (int i = 0; i < count; i++)
                    {
                        IAudioSessionControl ctl;
                        if (sessions.GetSession(i, out ctl) != 0 || ctl == null) continue;
                        try
                        {
                            var ctl2 = ctl as IAudioSessionControl2;
                            var simple = ctl as ISimpleAudioVolume;
                            if (ctl2 == null || simple == null) continue;
                            uint spid;
                            if (ctl2.GetProcessId(out spid) != 0 || spid == 0) continue;
                            string pn = ProcName(spid);
                            if (pn.Length == 0) continue;
                            string bn = BaseName(pn);
                            bool match = string.Equals(pn, wanted, StringComparison.OrdinalIgnoreCase)
                                || string.Equals(bn, wanted, StringComparison.OrdinalIgnoreCase)
                                || bn.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) >= 0;
                            if (!match) continue;
                            if (!targetState.HasValue)
                            {
                                bool curMute = false;
                                simple.GetMute(out curMute);
                                targetState = !curMute;
                            }
                            if (simple.SetMute(targetState.Value, IntPtr.Zero) == 0) changed++;
                        }
                        finally { Release(ctl); }
                    }
                }
                finally { Release(sessions); }
            }
            catch { }
            finally
            {
                Release(manager);
                Release(hold);
            }
        }
        changedOut = changed;
        if (changed == 0) throw new InvalidOperationException("keine aktive Audio-Session fuer " + wanted);
        return targetState.Value;
    }

    public static bool ToggleMicMute()
    {
        IAudioEndpointVolume mic = null;
        try { mic = OpenEndpoint(E_CAPTURE, E_COMMUNICATIONS); }
        catch { mic = OpenEndpoint(E_CAPTURE, E_MULTIMEDIA); }
        bool next;
        try
        {
            bool muted;
            Check(mic.GetMute(out muted));
            next = !muted;
            Check(mic.SetMute(next, IntPtr.Zero));
        }
        finally { Release(mic); }
        // Auch das Multimedia-Aufnahmegeraet synchron schalten (falls abweichend).
        try
        {
            var mm = OpenEndpoint(E_CAPTURE, E_MULTIMEDIA);
            try { mm.SetMute(next, IntPtr.Zero); }
            finally { Release(mm); }
        }
        catch { }
        return next;
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop

function Reply($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
}

# .NET method calls surface as MethodInvocationException; report the cause itself.
function ErrText($err) {
  $inner = $err.Exception.InnerException
  if ($null -ne $inner -and -not [string]::IsNullOrEmpty($inner.Message)) { return [string]$inner.Message }
  return [string]$err.Exception.Message
}

function ClampVolume([double]$v) {
  if ([double]::IsNaN($v)) { throw 'volume is not a number' }
  if ($v -lt 0 -or $v -gt 100) { throw 'volume out of range 0-100' }
  return [float]($v / 100.0)
}

function Do-List {
  $rows = New-Object System.Collections.ArrayList
  foreach ($s in [AudioCtl]::List()) {
    [void]$rows.Add([ordered]@{
      pid     = [int]$s.pid
      process = [string]$s.process
      name    = [string]$s.name
      volume  = [int]$s.volume
      muted   = [bool]$s.muted
    })
  }
  return [ordered]@{ ok = $true; sessions = @($rows.ToArray()) }
}

function Do-Set([double]$vol, [int]$p, [string]$proc) {
  if ($p -le 0 -and [string]::IsNullOrWhiteSpace($proc)) { throw 'pid or process required' }
  $level = ClampVolume $vol
  if ($p -lt 0) { $p = 0 }
  $changed = [AudioCtl]::SetVolume($p, $proc, $level)
  return [ordered]@{ ok = $true; changed = $changed }
}

function Do-Mute([bool]$state, [int]$p, [string]$proc) {
  if ($p -le 0 -and [string]::IsNullOrWhiteSpace($proc)) { throw 'pid or process required' }
  if ($p -lt 0) { $p = 0 }
  $changed = [AudioCtl]::SetMuted($p, $proc, $state)
  return [ordered]@{ ok = $true; changed = $changed; muted = $state }
}

function Do-Master([double]$vol) {
  $level = ClampVolume $vol
  [AudioCtl]::SetMasterVolume($level)
  return [ordered]@{ ok = $true; volume = [int][Math]::Round($vol) }
}

function Do-MasterStep([int]$delta) {
  $v = [AudioCtl]::StepMasterVolume($delta)
  return [ordered]@{ ok = $true; volume = [int]$v }
}

function Do-MasterMute {
  $m = [AudioCtl]::ToggleMasterMute()
  $v = [AudioCtl]::GetMasterVolume()
  return [ordered]@{ ok = $true; muted = [bool]$m; volume = [int]$v }
}

function Do-MicMute {
  $m = [AudioCtl]::ToggleMicMute()
  return [ordered]@{ ok = $true; muted = [bool]$m }
}

function Do-AppMicMute([string]$proc) {
  $changed = 0
  $m = [AudioCtl]::ToggleSessionMute(1, $proc, [ref]$changed)
  return [ordered]@{ ok = $true; muted = [bool]$m; changed = [int]$changed }
}

function Do-AppRenderMute([string]$proc) {
  $changed = 0
  $m = [AudioCtl]::ToggleSessionMute(0, $proc, [ref]$changed)
  return [ordered]@{ ok = $true; muted = [bool]$m; changed = [int]$changed }
}

# --- parameter mode: run once and exit -------------------------------------
if ($Cmd -ne '') {
  try {
    switch ($Cmd.ToLower()) {
      'list'   { Reply (Do-List) }
      'set'    { Reply (Do-Set $Volume $TargetPid $ProcessName) }
      'mute'   {
        $state = ($Muted -eq 'true' -or $Muted -eq '1' -or $Muted -eq 'yes')
        Reply (Do-Mute $state $TargetPid $ProcessName)
      }
      'master' { Reply (Do-Master $Volume) }
      default  { throw "unknown command '$Cmd'" }
    }
  } catch {
    Reply ([ordered]@{ ok = $false; error = (ErrText $_) })
  }
  exit 0
}

# --- stdin mode: one JSON line in, one JSON line out -----------------------
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }             # stdin closed -> stop, no busy loop
  if ($line.Trim().Length -eq 0) { continue }

  $id = 0
  try {
    $msg = $line | ConvertFrom-Json
    if ($null -eq $msg) { continue }
    if ($null -ne $msg.id) { $id = [int]$msg.id }

    $cmd = ''
    if ($null -ne $msg.cmd) { $cmd = [string]$msg.cmd }

    $p = 0
    if ($null -ne $msg.pid) { $p = [int]$msg.pid }

    $proc = ''
    if ($null -ne $msg.process) { $proc = [string]$msg.process }

    switch ($cmd.ToLower()) {
      'list' {
        $result = Do-List
      }
      'set' {
        if ($null -eq $msg.volume) { throw 'volume required' }
        $result = Do-Set ([double]$msg.volume) $p $proc
      }
      'mute' {
        if ($null -eq $msg.muted) { throw 'muted required' }
        $result = Do-Mute ([bool]$msg.muted) $p $proc
      }
      'master' {
        if ($null -eq $msg.volume) { throw 'volume required' }
        $result = Do-Master ([double]$msg.volume)
      }
      'masterstep' {
        $delta = if ($null -ne $msg.delta) { [int]$msg.delta } else { 5 }
        $result = Do-MasterStep $delta
      }
      'mastermute' {
        $result = Do-MasterMute
      }
      'micmute' {
        $result = Do-MicMute
      }
      'appmicmute' {
        if ([string]::IsNullOrWhiteSpace($proc)) { throw 'process required' }
        $result = Do-AppMicMute $proc
      }
      'apprendermute' {
        if ([string]::IsNullOrWhiteSpace($proc)) { throw 'process required' }
        $result = Do-AppRenderMute $proc
      }
      default { throw "unknown command '$cmd'" }
    }

    $out = [ordered]@{ id = $id }
    foreach ($key in $result.Keys) { $out[$key] = $result[$key] }
    Reply $out
  } catch {
    Reply ([ordered]@{ id = $id; ok = $false; error = (ErrText $_) })
  }
}
