# Laundry DevSecOps (Full Local)

Cloud Laundry management app with a local Docker Compose runtime and GitHub Actions CI / Continuous Delivery.

## Architecture

- Frontend: Nginx serving the Vue CDN-based single-page app.
- Backend: Node.js + Express REST API.
- Database: MariaDB with persistent Docker volume.
- CI: tests, Semgrep SAST, Gitleaks secret scan, npm audit, Trivy filesystem scan.
- CD: build and publish backend/frontend images to GitHub Container Registry (GHCR). Pull and deploy the published images on the local Windows host using `deploy-local.ps1`.

> GitHub-hosted runners cannot deploy to `localhost` on your Windows computer. Therefore this repository implements Continuous Delivery to GHCR and a controlled local deployment step. For fully automatic deployment to the same PC, configure a GitHub self-hosted runner on that PC and harden it appropriately.

## Requirements

- Windows 10/11
- Docker Desktop with Linux containers enabled
- Git
- GitHub repository
- GitHub Actions enabled

## Run locally

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Change `DB_PASSWORD` and `DB_ROOT_PASSWORD` in `.env`.
3. Start the application:
   ```powershell
   docker compose up --build -d
   ```
4. Open <http://localhost>.
5. API health: <http://localhost/api/health>.
6. View logs:
   ```powershell
   docker compose logs -f
   ```
7. Stop:
   ```powershell
   docker compose down
   ```
   Database data remains in the `mariadb_data` volume. To delete data too, use `docker compose down -v`.

## API

- `GET /api/health`
- `GET /api/services`
- `GET /api/orders`
- `POST /api/orders` JSON: `customer_name`, `service_id`, `weight`
- `PUT /api/orders/:id/status` JSON: `order_status`, `payment_status`

## GitHub Actions setup

1. Push this repository to GitHub.
2. In repository Settings → Actions → General, allow GitHub Actions.
3. Ensure the workflow permissions allow `Read and write` for packages if you want GHCR publishing.
4. Push to `main`:
   - `ci.yml` runs tests and security checks.
   - `cd.yml` builds images and publishes them to `ghcr.io/<owner>/<repo>-backend` and `ghcr.io/<owner>/<repo>-frontend`.
5. For a public package, make the GHCR packages public. For private packages, authenticate Docker locally with a GitHub token that has `read:packages`.

## Local deployment from GHCR

Edit `.env` and set:
```env
GHCR_OWNER=your-github-username-or-org
IMAGE_TAG=latest
```

For public GHCR packages:
```powershell
.\deploy-local.ps1
```

The deployment script uses `docker-compose.ghcr.yml` to select published GHCR images instead of building local images.

For private packages, first authenticate:
```powershell
$env:GHCR_TOKEN = "YOUR_TOKEN_WITH_READ_PACKAGES"
$env:GHCR_USER = "YOUR_GITHUB_USERNAME"
.\login-ghcr.ps1
.\deploy-local.ps1
```

Do not commit `.env`, tokens, or credentials.

## Security notes

- Change all example passwords before use.
- Do not expose MariaDB port to the public internet.
- CORS is restricted by configuration; the browser accesses `/api` through the same Nginx origin.
- API errors do not return database exception details.
- The SQL schema is idempotent for table creation and seed insertion.
- `npm audit` is a security gate; review and deliberately resolve reported vulnerabilities rather than blindly applying breaking upgrades.
- Semgrep / Gitleaks / Trivy findings must be triaged. A scan passing does not prove the application is secure.

## Current scope / limitations

- This is a development/demo setup, not a hardened production deployment.
- Vue and Tailwind are loaded from public CDNs; internet access is required by the browser.
- The included tests cover health and input validation, not full database integration.
- CD runs only after the CI workflow succeeds, then publishes container artifacts to GHCR. Local deployment is an explicit PowerShell action because a hosted GitHub runner cannot access the developer's localhost.
