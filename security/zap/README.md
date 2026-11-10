# OWASP ZAP baseline scan
#
# Baseline scan is passive: it observes responses and does not perform
# intrusive attack payloads. The workflow currently uses -I so warning-level
# alerts are reported without failing the job. ZAP FAIL-level findings and
# scanner/runtime errors still fail the workflow.
#
# Review alerts manually before deciding whether to promote a rule to a
# blocking release gate. Do not suppress alerts merely to obtain a green run.
