$ErrorActionPreference = "Stop"
if (-not $env:GHCR_TOKEN -or -not $env:GHCR_USER) {
    throw "Set GHCR_USER dan GHCR_TOKEN terlebih dahulu."
}
$env:GHCR_TOKEN | docker login ghcr.io -u $env:GHCR_USER --password-stdin
if ($LASTEXITCODE -ne 0) { throw "Login GHCR gagal." }
