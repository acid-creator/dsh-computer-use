# release.ps1 — pin the current commit SHA and timestamp into market.json
$ErrorActionPreference = 'Stop'

$sha = (git rev-parse HEAD).Trim()
if (-not $sha) { throw 'git rev-parse HEAD returned nothing; are you in the repo?' }
if ($sha -notmatch '^[0-9a-f]{40}$') { throw "unexpected SHA: $sha" }

$path = Join-Path $PSScriptRoot 'market.json'
$json = Get-Content -LiteralPath $path -Raw

$json = $json -replace '<COMMIT_SHA>', $sha

$now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
$json = $json -replace '"publishTimestamp":\s*\d+', ('"publishTimestamp": ' + $now)

Set-Content -LiteralPath $path -Value $json -Encoding utf8NoBOM

Write-Host "market.json updated: commit=$sha ts=$now"
Write-Host 'Next: git add market.json && git commit -m "publish: pin commit" && git push'
