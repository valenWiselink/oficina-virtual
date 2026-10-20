# Oficina virtual: la abre como una app de escritorio.
# - Si el servidor no esta corriendo, lo levanta escondido (sin ventana negra); lo que
#   imprime queda en ~/.pixel-agents/oficina.log. Se apaga desde Ajustes > Apagar la oficina.
# - Abre la oficina en su propia ventana de Edge o Chrome (modo app: sin pestanas ni barra).
# Cerrar la ventana NO apaga la oficina: tus agentes siguen trabajando.
$port = 3100
$repo = Split-Path $PSScriptRoot -Parent
$oficina = Join-Path $repo 'dist\cli.js'
$state = Join-Path $env:USERPROFILE '.pixel-agents'
$tokenFile = Join-Path $state 'standalone-token'
$log = Join-Path $state 'oficina.log'

function Test-Oficina {
    try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', $port); $c.Close(); return $true } catch { return $false }
}

# Si en el puerto corre otra cosa (otra copia, o una que arranco en modo "solo mirar"),
# se reinicia con esta para poder gestionar agentes.
$listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listen) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listen.OwningProcess)"
    if ($proc.CommandLine -match '--no-terminal' -or $proc.CommandLine -notlike "*$oficina*") {
        Stop-Process -Id $proc.ProcessId -Force
        Start-Sleep -Seconds 1
    }
}

if (-not (Test-Oficina)) {
    New-Item -ItemType Directory -Force $state | Out-Null
    $cmd = "/c node `"$oficina`" --port $port > `"$log`" 2>&1"
    Start-Process -FilePath 'cmd.exe' -ArgumentList $cmd -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden
    for ($i = 0; $i -lt 90 -and -not (Test-Oficina); $i++) { Start-Sleep -Seconds 1 }
}

$url = "http://127.0.0.1:$port/"
if (Test-Path $tokenFile) { $url += '?token=' + (Get-Content $tokenFile -TotalCount 1).Trim() }

# Su propia ventana: Edge en modo app (o Chrome); si no hay ninguno, el navegador de siempre.
$apps = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $apps | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--app=$url", '--window-size=1600,960'
} else {
    Start-Process $url
}
