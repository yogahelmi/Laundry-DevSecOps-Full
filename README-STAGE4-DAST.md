# Stage 4.2 — OWASP ZAP DAST Baseline

## Files in this patch
- `.github/workflows/dast.yml`: dedicated DAST workflow.
- `docker-compose.dast.yml`: temporary ZAP scanner service on the same Compose network.
- `security/zap/README.md`: scan policy notes.

## What it does
1. Runs for pull requests to `main`, pushes to `main`, or manual dispatch.
2. Starts a disposable MariaDB + backend + frontend stack using test-only credentials from the workflow environment.
3. Waits for `http://127.0.0.1/api/health`.
4. Runs OWASP ZAP Baseline against `http://frontend:8080`.
5. Saves HTML and JSON reports as a GitHub Actions artifact.
6. Tears down the temporary stack and its disposable database volume.

## Scan safety and gate behavior
This first integration uses ZAP Baseline, which performs passive analysis. It is suitable as a first DAST stage and avoids active attack traffic against the app. The workflow uses `-I`: warning-level alerts are reported but do not fail the job; FAIL-level findings and runtime errors can fail it. Review the report and tune a documented risk policy before adding active scanning or making more alert classes blocking.

## Apply
Copy the files into the existing repository, preserving paths. Do not replace the existing `docker-compose.yml`, `.env`, or other application files.

## Run
Commit and push to the feature branch used by the open PR:
```powershell
git add .github/workflows/dast.yml docker-compose.dast.yml security/zap/README.md
git commit -m "Add OWASP ZAP baseline DAST workflow"
git push origin security-hardening
```

The workflow runs on the PR targeting `main`. In GitHub Actions, open `DAST - OWASP ZAP Baseline`, then download artifact `owasp-zap-baseline-<run number>`.

## Important validation
The workflow is prepared from the supplied project configuration but has not been executed in the user's GitHub repository. Confirm that the test stack becomes healthy and inspect the ZAP report. If the app needs additional environment variables beyond those in `docker-compose.yml`, add disposable test values to the workflow `env`; never add production secrets.
