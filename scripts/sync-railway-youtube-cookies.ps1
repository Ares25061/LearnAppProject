param(
  [string]$Service = "LearnAppProject-branch",
  [string]$Environment = "production",
  [string[]]$Browsers = @("firefox", "chrome", "edge"),
  [switch]$SkipDeploys
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ExecutablePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandName,
    [string[]]$FallbackPaths = @()
  )

  foreach ($fallbackPath in $FallbackPaths) {
    if ($fallbackPath -and (Test-Path -LiteralPath $fallbackPath)) {
      return (Resolve-Path -LiteralPath $fallbackPath).Path
    }
  }

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Could not find executable '$CommandName'."
}

function Try-ExportCookiesFromBrowser {
  param(
    [Parameter(Mandatory = $true)]
    [string]$YtDlpPath,
    [Parameter(Mandatory = $true)]
    [string]$Browser,
    [Parameter(Mandatory = $true)]
    [string]$CookiesPath
  )

  if (Test-Path -LiteralPath $CookiesPath) {
    Remove-Item -LiteralPath $CookiesPath -Force
  }

  $output = & $YtDlpPath `
    --cookies-from-browser $Browser `
    --cookies $CookiesPath `
    --skip-download `
    --ignore-config `
    --no-warnings `
    --no-playlist `
    "https://www.youtube.com/watch?v=bjvNUIcAYSw" 2>&1

  return [pscustomobject]@{
    Browser = $Browser
    ExitCode = $LASTEXITCODE
    Output = (($output | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim()
    HasCookiesFile = Test-Path -LiteralPath $CookiesPath
    CookiesSize = if (Test-Path -LiteralPath $CookiesPath) {
      (Get-Item -LiteralPath $CookiesPath).Length
    } else {
      0
    }
  }
}

function Set-RailwayVariableValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RailwayPath,
    [Parameter(Mandatory = $true)]
    [string]$Key,
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Service,
    [Parameter(Mandatory = $true)]
    [string]$Environment,
    [switch]$TriggerDeploy
  )

  $railwayArgs = @(
    "variable",
    "set",
    $Key,
    "--stdin",
    "--service",
    $Service,
    "--environment",
    $Environment
  )

  if (-not $TriggerDeploy) {
    $railwayArgs += "--skip-deploys"
  }

  $setOutput = $Value | & $RailwayPath @railwayArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Railway CLI failed to update $Key: $((($setOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim())"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ytDlpPath = Resolve-ExecutablePath `
  -CommandName "yt-dlp" `
  -FallbackPaths @(
    (Join-Path $repoRoot ".media-tools\\bin\\yt-dlp.exe"),
    (Join-Path $repoRoot ".media-tools\\bin\\yt-dlp")
  )
$railwayPath = Resolve-ExecutablePath `
  -CommandName "railway" `
  -FallbackPaths @(
    (Join-Path $env:USERPROFILE "scoop\\shims\\railway.exe")
  )

$tempDir = Join-Path $env:TEMP ("learnapp-youtube-cookies-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  $selectedExport = $null
  $attemptErrors = @()
  $cookieChunkSize = 24000

  foreach ($browser in $Browsers) {
    $cookiesPath = Join-Path $tempDir "$browser-cookies.txt"
    $attempt = Try-ExportCookiesFromBrowser `
      -YtDlpPath $ytDlpPath `
      -Browser $browser `
      -CookiesPath $cookiesPath

    if ($attempt.ExitCode -eq 0 -and $attempt.HasCookiesFile -and $attempt.CookiesSize -gt 0) {
      $selectedExport = [pscustomobject]@{
        Browser = $browser
        CookiesPath = $cookiesPath
        CookiesSize = $attempt.CookiesSize
      }
      break
    }

    $attemptErrors += "{0}: exit={1}; cookiesFile={2}; size={3}; output={4}" -f `
      $browser, `
      $attempt.ExitCode, `
      $attempt.HasCookiesFile, `
      $attempt.CookiesSize, `
      ($attempt.Output -replace "\s+", " ").Trim()
  }

  if (-not $selectedExport) {
    throw "Could not export YouTube cookies from any browser. Attempts: $($attemptErrors -join ' | ')"
  }

  $base64Cookies = [Convert]::ToBase64String([IO.File]::ReadAllBytes($selectedExport.CookiesPath))
  $cookieChunks = for ($offset = 0; $offset -lt $base64Cookies.Length; $offset += $cookieChunkSize) {
    $chunkLength = [Math]::Min($cookieChunkSize, $base64Cookies.Length - $offset)
    $base64Cookies.Substring($offset, $chunkLength)
  }

  if ($cookieChunks.Count -eq 0) {
    throw "Exported cookie archive is empty after base64 encoding."
  }

  for ($index = 0; $index -lt $cookieChunks.Count; $index++) {
    Set-RailwayVariableValue `
      -RailwayPath $railwayPath `
      -Key ("YTDLP_YOUTUBE_COOKIES_B64_PART_{0}" -f ($index + 1)) `
      -Value $cookieChunks[$index] `
      -Service $Service `
      -Environment $Environment
  }

  Set-RailwayVariableValue `
    -RailwayPath $railwayPath `
    -Key "YTDLP_YOUTUBE_COOKIES_B64_PART_COUNT" `
    -Value ([string]$cookieChunks.Count) `
    -Service $Service `
    -Environment $Environment `
    -TriggerDeploy:(-not $SkipDeploys)

  Write-Host ("Updated YouTube cookies for Railway service '{0}' in environment '{1}' from browser '{2}'. Cookie file size: {3} bytes across {4} Railway variables." -f `
    $Service, `
    $Environment, `
    $selectedExport.Browser, `
    $selectedExport.CookiesSize, `
    ($cookieChunks.Count + 1))
} finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
