' Startet den Server ohne Konsolenfenster (fuer Autostart / Desktop-Verknuepfung)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "node server.mjs", 0, False
