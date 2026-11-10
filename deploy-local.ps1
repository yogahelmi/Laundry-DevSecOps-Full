$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    throw ".env belum ada. Salin .env.example menjadi .env dan isi konfigurasinya."
}

Write-Host "Pulling published GHCR images..."
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
if ($LASTEXITCODE -ne 0) { throw "docker compose pull gagal. Periksa GHCR_OWNER, IMAGE_TAG, dan akses package." }

Write-Host "Starting local services from published images..."
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --no-build
if ($LASTEXITCODE -ne 0) { throw "docker compose up gagal." }

Write-Host "Deployment selesai. Buka http://localhost"
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml ps
