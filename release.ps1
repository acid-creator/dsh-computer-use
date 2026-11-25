# release.ps1 — pin the current commit SHA and timestamp into market.json
$ErrorActionPreference = 'Stop'

$sha = (git rev-parse HEAD).Trim()
if (-not $sha) { throw 'git rev-parse HEAD returned nothing; are you in the repo?' }
if ($sha -notmatch '^[0-9a-f]{40}$') { throw "unexpected SHA: $sha" }

$path = Join-Path $PSScriptRoot 'market.json'
$json = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$json = $json -replace '<COMMIT_SHA>', $sha

$now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
$json = $json -replace '"publishTimestamp":\s*\d+', ('"publishTimestamp": ' + $now)

[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "market.json updated: commit=$sha ts=$now"
Write-Host 'Next: git add market.json && git commit -m "publish: pin commit" && git push'
