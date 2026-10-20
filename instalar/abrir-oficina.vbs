' Abre la oficina sin que aparezca ninguna ventana de consola (ni un parpadeo).
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\abrir-oficina.ps1""", 0, False
