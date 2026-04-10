param(
  [string]$Service = "LearnAppProject-branch",
  [string]$Environment = "production",
  [string[]]$Browsers = @("firefox", "chrome", "edge"),
  [string]$CookiesFile,
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

function Test-YouTubeCookieDomain {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Domain
  )

  $normalizedDomain = $Domain.Trim().TrimStart(".").ToLowerInvariant()
  if (-not $normalizedDomain) {
    return $false
  }

  if ($normalizedDomain -eq "youtu.be" -or $normalizedDomain.EndsWith(".youtu.be")) {
    return $true
  }

  if ($normalizedDomain -eq "youtube.com" -or $normalizedDomain.EndsWith(".youtube.com")) {
    return $true
  }

  if ($normalizedDomain -eq "googlevideo.com" -or $normalizedDomain.EndsWith(".googlevideo.com")) {
    return $true
  }

  if ($normalizedDomain -eq "googleapis.com" -or $normalizedDomain.EndsWith(".googleapis.com")) {
    return $true
  }

  return $normalizedDomain -match '(^|\.)google\.[a-z.]+$'
}

function Get-FilteredYouTubeCookiesContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CookiesPath
  )

  $filteredLines = New-Object System.Collections.Generic.List[string]
  $cookieLines = Get-Content -LiteralPath $CookiesPath

  foreach ($line in $cookieLines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($line.StartsWith("#")) {
      $filteredLines.Add($line)
      continue
    }

    $parts = $line -split "`t", 7
    if ($parts.Count -lt 7) {
      continue
    }

    if (Test-YouTubeCookieDomain -Domain $parts[0]) {
      $filteredLines.Add($line)
    }
  }

  if ($filteredLines.Count -eq 0) {
    throw "Cookie archive does not contain any Google/YouTube cookies after filtering."
  }

  return (($filteredLines.ToArray()) -join [Environment]::NewLine) + [Environment]::NewLine
}

function Get-RailwayCliConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
  )

  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Could not find Railway CLI config at '$ConfigPath'. Run 'railway login' first."
  }

  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $projectEntry = $null

  foreach ($projectProperty in $config.projects.PSObject.Properties) {
    $candidatePath = $projectProperty.Name
    try {
      $candidatePath = (Resolve-Path -LiteralPath $candidatePath).Path
    } catch {
      $candidatePath = $projectProperty.Name
    }

    if ($candidatePath -eq $ProjectPath) {
      $projectEntry = $projectProperty.Value
      break
    }
  }

  if (-not $projectEntry) {
    throw "Could not find a linked Railway project for '$ProjectPath' in '$ConfigPath'."
  }

  $accessToken = $config.user.accessToken
  if (-not $accessToken) {
    throw "Railway CLI access token is missing. Run 'railway login' again."
  }

  return [pscustomobject]@{
    AccessToken = $accessToken
    ProjectId = $projectEntry.project
  }
}

function Invoke-RailwayGraphQl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken,
    [Parameter(Mandatory = $true)]
    [string]$Query,
    [hashtable]$Variables = @{}
  )

  $body = @{
    query = $Query
    variables = $Variables
  } | ConvertTo-Json -Depth 30 -Compress

  $response = Invoke-RestMethod `
    -Uri "https://backboard.railway.com/graphql/v2" `
    -Method Post `
    -Headers @{
      Authorization = "Bearer $AccessToken"
      "Content-Type" = "application/json"
    } `
    -Body $body

  $errorsProperty = $response.PSObject.Properties["errors"]
  if ($errorsProperty -and $errorsProperty.Value) {
    $messages = ($errorsProperty.Value | ForEach-Object { $_.message }) -join " | "
    throw "Railway GraphQL request failed: $messages"
  }

  return $response.data
}

function Resolve-RailwayTargetContext {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RailwayPath,
    [Parameter(Mandatory = $true)]
    [string]$Service,
    [Parameter(Mandatory = $true)]
    [string]$Environment
  )

  $statusOutput = & $RailwayPath status --json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Railway CLI failed to read project status: $((($statusOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim())"
  }

  $status = $statusOutput | ConvertFrom-Json
  $environmentNode = $status.environments.edges `
    | ForEach-Object { $_.node } `
    | Where-Object { $_.name -eq $Environment -or $_.id -eq $Environment } `
    | Select-Object -First 1

  if (-not $environmentNode) {
    throw "Could not find Railway environment '$Environment'."
  }

  $serviceNode = $status.services.edges `
    | ForEach-Object { $_.node } `
    | Where-Object { $_.name -eq $Service -or $_.id -eq $Service } `
    | Select-Object -First 1

  if (-not $serviceNode) {
    throw "Could not find Railway service '$Service'."
  }

  return [pscustomobject]@{
    EnvironmentId = $environmentNode.id
    ProjectId = $status.id
    ServiceId = $serviceNode.id
  }
}

function Get-RailwayUserVariables {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken,
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentId,
    [Parameter(Mandatory = $true)]
    [string]$ServiceId
  )

  $data = Invoke-RailwayGraphQl `
    -AccessToken $AccessToken `
    -Query @'
query($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(
    projectId: $projectId
    environmentId: $environmentId
    serviceId: $serviceId
    unrendered: true
  )
}
'@ `
    -Variables @{
      environmentId = $EnvironmentId
      projectId = $ProjectId
      serviceId = $ServiceId
    }

  return $data.variables
}

function Set-RailwayUserVariables {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken,
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentId,
    [Parameter(Mandatory = $true)]
    [string]$ServiceId,
    [Parameter(Mandatory = $true)]
    [hashtable]$Variables,
    [switch]$SkipDeploys
  )

  Invoke-RailwayGraphQl `
    -AccessToken $AccessToken `
    -Query @'
mutation($input: VariableCollectionUpsertInput!) {
  variableCollectionUpsert(input: $input)
}
'@ `
    -Variables @{
      input = @{
        environmentId = $EnvironmentId
        projectId = $ProjectId
        replace = $true
        serviceId = $ServiceId
        skipDeploys = [bool]$SkipDeploys
        variables = $Variables
      }
    } | Out-Null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$railwayConfigPath = Join-Path $env:USERPROFILE ".railway\\config.json"
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

  if ($CookiesFile) {
    $resolvedCookiesFile = (Resolve-Path -LiteralPath $CookiesFile).Path
    $selectedExport = [pscustomobject]@{
      SourceLabel = [IO.Path]::GetFileName($resolvedCookiesFile)
      CookiesPath = $resolvedCookiesFile
      CookiesSize = (Get-Item -LiteralPath $resolvedCookiesFile).Length
    }
  } else {
    foreach ($browser in $Browsers) {
      $cookiesPath = Join-Path $tempDir "$browser-cookies.txt"
      $attempt = Try-ExportCookiesFromBrowser `
        -YtDlpPath $ytDlpPath `
        -Browser $browser `
        -CookiesPath $cookiesPath

      if ($attempt.ExitCode -eq 0 -and $attempt.HasCookiesFile -and $attempt.CookiesSize -gt 0) {
        $selectedExport = [pscustomobject]@{
          SourceLabel = $browser
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
  }

  $railwayConfig = Get-RailwayCliConfig `
    -ConfigPath $railwayConfigPath `
    -ProjectPath $repoRoot
  $railwayTarget = Resolve-RailwayTargetContext `
    -RailwayPath $railwayPath `
    -Service $Service `
    -Environment $Environment
  $filteredCookiesContent = Get-FilteredYouTubeCookiesContent -CookiesPath $selectedExport.CookiesPath
  $filteredCookiesPath = Join-Path $tempDir "youtube-cookies-filtered.txt"
  [IO.File]::WriteAllText($filteredCookiesPath, $filteredCookiesContent, [Text.UTF8Encoding]::new($false))
  $filteredCookieBytes = [Text.Encoding]::UTF8.GetBytes($filteredCookiesContent)
  $currentVariables = Get-RailwayUserVariables `
    -AccessToken $railwayConfig.AccessToken `
    -ProjectId $railwayTarget.ProjectId `
    -EnvironmentId $railwayTarget.EnvironmentId `
    -ServiceId $railwayTarget.ServiceId
  $nextVariables = @{}

  foreach ($variableProperty in $currentVariables.PSObject.Properties) {
    if ($variableProperty.Name -notlike "YTDLP_YOUTUBE_COOKIES*") {
      $nextVariables[$variableProperty.Name] = [string]$variableProperty.Value
    }
  }

  $base64Cookies = [Convert]::ToBase64String($filteredCookieBytes)
  $cookieChunks = for ($offset = 0; $offset -lt $base64Cookies.Length; $offset += $cookieChunkSize) {
    $chunkLength = [Math]::Min($cookieChunkSize, $base64Cookies.Length - $offset)
    $base64Cookies.Substring($offset, $chunkLength)
  }

  if ($cookieChunks.Count -eq 0) {
    throw "Exported cookie archive is empty after base64 encoding."
  }

  for ($index = 0; $index -lt $cookieChunks.Count; $index++) {
    $nextVariables["YTDLP_YOUTUBE_COOKIES_B64_PART_{0}" -f ($index + 1)] = $cookieChunks[$index]
  }

  $nextVariables["YTDLP_YOUTUBE_COOKIES_B64_PART_COUNT"] = [string]$cookieChunks.Count

  Set-RailwayUserVariables `
    -AccessToken $railwayConfig.AccessToken `
    -ProjectId $railwayTarget.ProjectId `
    -EnvironmentId $railwayTarget.EnvironmentId `
    -ServiceId $railwayTarget.ServiceId `
    -Variables $nextVariables `
    -SkipDeploys:$SkipDeploys

  Write-Host ("Updated YouTube cookies for Railway service '{0}' in environment '{1}' from source '{2}'. Original file size: {3} bytes. Filtered file size: {4} bytes across {5} Railway variables." -f `
    $Service, `
    $Environment, `
    $selectedExport.SourceLabel, `
    $selectedExport.CookiesSize, `
    $filteredCookieBytes.Length, `
    ($cookieChunks.Count + 1))
} finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
