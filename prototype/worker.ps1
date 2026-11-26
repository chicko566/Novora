Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class K {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); Up(vk); }
}
"@

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Tell the server the worker is ready for commands.
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

# One JSON object per line: {"id":<n>,"b64":"<base64 script>"}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $id = 0
  try {
    $msg = $line | ConvertFrom-Json
    $id = [int]$msg.id
    $script = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$msg.b64))
    Invoke-Expression $script
    $resp = @{ id = $id; ok = $true } | ConvertTo-Json -Compress
  } catch {
    $resp = @{ id = $id; ok = $false; err = [string]$_.Exception.Message } | ConvertTo-Json -Compress
  }
  [Console]::Out.WriteLine($resp)
  [Console]::Out.Flush()
}
