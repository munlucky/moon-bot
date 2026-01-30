param(
  [ValidateSet("start", "stop", "restart")]
  [string]$Action = "restart",
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pidDir = Join-Path $root ".moonbot-dev"
$gatewayPidPath = Join-Path $pidDir "gateway.pid"
$discordPidPath = Join-Path $pidDir "discord.pid"
$gatewayLogPath = Join-Path $root "gateway.log"
$gatewayErrLogPath = Join-Path $root "gateway.error.log"
$discordLogPath = Join-Path $root "discord-bot.log"
$discordErrLogPath = Join-Path $root "discord-bot.error.log"

function Get-RunningProcessFromPid([string]$path) {
  if (!(Test-Path $path)) {
    return $null
  }

  $pidValue = Get-Content $path -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $pidValue) {
    return $null
  }

  try {
    return Get-Process -Id ([int]$pidValue) -ErrorAction Stop
  } catch {
    return $null
  }
}

function Stop-ProcessFromPid([string]$path, [string]$name) {
  $proc = Get-RunningProcessFromPid $path
  if ($proc) {
    Write-Host "Stopping $name (PID $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
  } else {
    Write-Host "$name not running (pid file missing or stale)"
  }

  if (Test-Path $path) {
    Remove-Item $path -Force
  }
}

function Stop-ByPort([int]$port) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
      if ($conn.OwningProcess) {
        Write-Host "Stopping process on port $port (PID $($conn.OwningProcess))"
        Stop-Process -Id $conn.OwningProcess -Force
      }
    }
  } catch {
  }
}

function Ensure-PidDir() {
  if (!(Test-Path $pidDir)) {
    New-Item -ItemType Directory -Path $pidDir | Out-Null
  }
}

function Start-Gateway() {
  $running = Get-RunningProcessFromPid $gatewayPidPath
  if ($running) {
    Write-Host "Gateway already running (PID $($running.Id))"
    return
  }

  Write-Host "Starting gateway..."
  $proc = Start-Process `
    -FilePath "node" `
    -ArgumentList "dist/cli.js", "gateway", "start" `
    -WorkingDirectory $root `
    -PassThru `
    -RedirectStandardOutput $gatewayLogPath `
    -RedirectStandardError $gatewayErrLogPath

  Set-Content -Path $gatewayPidPath -Value $proc.Id
  Write-Host "Gateway started (PID $($proc.Id))"
}

function Start-Discord() {
  $running = Get-RunningProcessFromPid $discordPidPath
  if ($running) {
    Write-Host "Discord bot already running (PID $($running.Id))"
    return
  }

  Write-Host "Starting Discord bot..."
  $proc = Start-Process `
    -FilePath "node" `
    -ArgumentList "dist/discord-bot.js" `
    -WorkingDirectory $root `
    -PassThru `
    -RedirectStandardOutput $discordLogPath `
    -RedirectStandardError $discordErrLogPath

  Set-Content -Path $discordPidPath -Value $proc.Id
  Write-Host "Discord bot started (PID $($proc.Id))"
}

if ($Action -eq "stop" -or $Action -eq "restart") {
  Ensure-PidDir
  Stop-ProcessFromPid $discordPidPath "Discord bot"
  Stop-ProcessFromPid $gatewayPidPath "Gateway"
  Stop-ByPort 18789
}

if ($Action -eq "start" -or $Action -eq "restart") {
  Ensure-PidDir

  if ($Build) {
    Write-Host "Building..."
    Push-Location $root
    try {
      & pnpm build
    } finally {
      Pop-Location
    }
  }

  Start-Gateway
  Start-Discord
}
