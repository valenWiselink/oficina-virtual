# Instala la Oficina virtual en esta compu: dependencias, compilacion y acceso directo.
# Se corre una vez, desde la carpeta del repo:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
# Volver a correrlo actualiza la instalacion (por ejemplo despues de un git pull).
$repo = $PSScriptRoot

function Paso($texto) { Write-Host ''; Write-Host "== $texto" -ForegroundColor Cyan }
function Falla($texto) { Write-Host ''; Write-Host $texto -ForegroundColor Red; exit 1 }

Paso 'Revisando Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Falla "Falta Node.js (20 o mas nuevo). Instalalo con:`n  winget install OpenJS.NodeJS.LTS`ny volve a correr este script en una terminal nueva."
}
$version = (node -v).Trim()
if ([int]($version.TrimStart('v').Split('.')[0]) -lt 20) {
    Falla "Tenes Node $version y hace falta 20 o mas nuevo:`n  winget install OpenJS.NodeJS.LTS"
}
Write-Host "Node $version"

Paso 'Revisando Claude Code'
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "Claude Code $((claude --version) -replace '\s*\(Claude Code\)\s*$', '')"
} else {
    Write-Host 'No encontre Claude Code. Los agentes lo necesitan; instalalo con:' -ForegroundColor Yellow
    Write-Host '  npm install -g @anthropic-ai/claude-code' -ForegroundColor Yellow
    Write-Host 'y entra una vez con el comando "claude" para iniciar sesion. La oficina se instala igual.'
}

Push-Location $repo
try {
    Paso 'Instalando dependencias (tarda unos minutos la primera vez)'
    # --loglevel=error: npm 11 warns about install scripts it skips; none is
    # needed here (esbuild and node-pty ship prebuilt), and the warning only scares.
    npm install --no-fund --no-audit --loglevel=error
    if ($LASTEXITCODE -ne 0) { Falla 'Fallo "npm install". Revisa el mensaje de arriba.' }

    Paso 'Compilando'
    npm run build:app
    if ($LASTEXITCODE -ne 0) { Falla 'Fallo la compilacion. Revisa el mensaje de arriba.' }
} finally {
    Pop-Location
}

Paso 'Creando el acceso directo "Oficina virtual"'
$vbs = Join-Path $repo 'instalar\abrir-oficina.vbs'
$ico = Join-Path $repo 'webview-ui\public\icons\oficina.ico'
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $lnk = $shell.CreateShortcut((Join-Path $folder 'Oficina virtual.lnk'))
    $lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $lnk.Arguments = '"' + $vbs + '"'
    $lnk.WorkingDirectory = Join-Path $repo 'instalar'
    $lnk.IconLocation = "$ico,0"
    $lnk.Description = 'Tus agentes de Claude Code: quien te necesita, quien trabaja y que hacen'
    $lnk.Save()
    Write-Host "Listo en $folder"
}

Paso 'Aviso "Te toca" (opcional)'
Write-Host 'Si queres, les pido a tus agentes que cierren con una linea "Te toca: ..." cuando te'
Write-Host 'dejen algo para hacer (mergear un PR, probar algo). Asi la oficina te lo muestra en'
Write-Host '"Te necesita". Se agrega al final de tu ~/.claude/CLAUDE.md.'
$claudeMd = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
$yaEsta = (Test-Path $claudeMd) -and ([IO.File]::ReadAllText($claudeMd, [Text.Encoding]::UTF8) -match 'Te toca:')
if ($yaEsta) {
    Write-Host 'Ya la tenias: no toco nada.'
} elseif ((Read-Host 'Agregarla? (S/n)') -notmatch '^[nN]') {
    New-Item -ItemType Directory -Force (Split-Path $claudeMd) | Out-Null
    $regla = [IO.File]::ReadAllText((Join-Path $repo 'instalar\regla-te-toca.md'), [Text.Encoding]::UTF8)
    [IO.File]::AppendAllText($claudeMd, $regla, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Agregada a $claudeMd"
}

Paso 'Listo'
Write-Host 'Abri la oficina con el acceso "Oficina virtual" del escritorio. La primera vez te'
Write-Host 'guia para elegir tu carpeta y crear tu primer agente.'
if ((Read-Host 'Abrirla ahora? (S/n)') -notmatch '^[nN]') {
    Start-Process -FilePath "$env:SystemRoot\System32\wscript.exe" -ArgumentList ('"' + $vbs + '"')
}
