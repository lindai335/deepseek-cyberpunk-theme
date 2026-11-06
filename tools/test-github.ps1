<#
.SYNOPSIS
    Test whether this machine can reach GitHub (DNS / TCP / TLS / HTTPS / git protocol).

.DESCRIPTION
    Uses curl.exe rather than Invoke-WebRequest: on this machine the .NET
    Framework stack in Windows PowerShell 5.1 stalls on GitHub's TLS
    renegotiation, while curl.exe and Node complete the handshake in ~2 s.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File C:\D界面主题\tools\test-github.ps1
#>
[CmdletBinding()]
param(
    [string]$Repo = 'octocat/Hello-World',
    [int]$Timeout = 20
)

$ErrorActionPreference = 'Continue'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
$script:results = @()

function Test-Endpoint {
    param([string]$Name, [string]$Url, [string]$UserAgent = $ua)
    $out = & curl.exe -s -o NUL -w '%{http_code}|%{time_total}s|%{size_download}B' --max-time $Timeout --connect-timeout 8 -A $UserAgent -L $Url 2>&1
    $parts = "$out" -split '\|'
    $code = $parts[0]
    $time = if ($parts.Count -gt 1) { $parts[1] } else { '-' }
    $size = if ($parts.Count -gt 2) { $parts[2] } else { '-' }
    $verdict = if ("$code" -match '^[23]') { 'OK' } else { 'FAIL' }
    $script:results += [pscustomobject]@{ Test = $Name; Code = $code; Time = $time; Size = $size; Result = $verdict }
    '  {0,-32} {1,-5} {2,9}  {3}' -f $Name, $code, $time, $size
}

Write-Host 'GitHub connectivity test' -ForegroundColor Cyan
Write-Host ''

Write-Host '[1] DNS'
try {
    $ips = (Resolve-DnsName github.com -Type A -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -First 3 -ExpandProperty IPAddress) -join ', '
    "  github.com -> $ips"
    $script:results += [pscustomobject]@{ Test = 'DNS github.com'; Code = '-'; Time = '-'; Size = $ips; Result = 'OK' }
} catch {
    "  resolve failed: $($_.Exception.Message)"
    $script:results += [pscustomobject]@{ Test = 'DNS github.com'; Code = '-'; Time = '-'; Size = '-'; Result = 'FAIL' }
}

Write-Host '[2] TCP 443'
$tcp = Test-NetConnection github.com -Port 443 -WarningAction SilentlyContinue
"  TcpTestSucceeded = $($tcp.TcpTestSucceeded)  ($($tcp.RemoteAddress))"
$script:results += [pscustomobject]@{ Test = 'TCP 443'; Code = '-'; Time = '-'; Size = "$($tcp.RemoteAddress)"; Result = $(if ($tcp.TcpTestSucceeded) { 'OK' } else { 'FAIL' }) }

Write-Host '[3] HTTPS'
Test-Endpoint 'GET https://github.com' 'https://github.com'
Test-Endpoint 'GET https://api.github.com' 'https://api.github.com' 'dsh-connectivity-test'
Test-Endpoint 'GET raw.githubusercontent.com' 'https://raw.githubusercontent.com/github/gitignore/main/README.md'
Test-Endpoint 'GET codeload tarball' "https://codeload.github.com/$Repo/tar.gz/refs/heads/master"

Write-Host '[4] git smart HTTP (clone / pull protocol)'
Test-Endpoint 'GET info/refs?service=git-upload-pack' "https://github.com/$Repo.git/info/refs?service=git-upload-pack" 'git/2.45.0'

Write-Host '[5] local tooling'
$git = Get-Command git -ErrorAction SilentlyContinue
$gitNote = if ($git) { $git.Source } else { 'not installed - can reach/download GitHub, but cannot git clone or pull' }
"  git command: $gitNote"
$script:results += [pscustomobject]@{ Test = 'git command'; Code = '-'; Time = '-'; Size = $(if ($git) { 'installed' } else { 'missing' }); Result = $(if ($git) { 'OK' } else { 'N/A' }) }

Write-Host ''
Write-Host 'summary:'
$script:results | ForEach-Object { '  {0,-36} {1,-5} {2}' -f $_.Test, $_.Result, $_.Code }
$fail = @($script:results | Where-Object { $_.Result -eq 'FAIL' })
if ($fail.Count -eq 0) {
    Write-Host ''
    Write-Host 'RESULT: GitHub is reachable (DNS / TCP / TLS / HTTPS / git protocol all pass)' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host "RESULT: failing -> $($fail.Test -join ', ')" -ForegroundColor Yellow
}
