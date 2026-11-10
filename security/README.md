# Security scanning

- Semgrep scans JavaScript source code for selected static-analysis rules.
- Gitleaks scans repository history for accidentally committed secrets.
- npm audit checks known vulnerabilities in npm dependencies.
- Trivy scans repository filesystem and built container images.
- Review findings; security scanners can produce false positives and passing scans do not prove the application is secure.
