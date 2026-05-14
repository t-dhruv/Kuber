# Security Policy

## Supported Versions

Kuber is currently pre-1.0 beta software. Security fixes are applied to the main development line unless a release branch is explicitly announced.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately. Do not open a public issue for vulnerabilities that could expose user data, credentials, infrastructure access, or account controls.

Include:

- Affected version, commit, or deployment type.
- Steps to reproduce or a proof of concept.
- Impact summary, including what data or privilege boundary is affected.
- Any logs or screenshots that help reproduction, with secrets redacted.

Expected handling:

- Acknowledgement target: 7 days.
- Initial triage target: 14 days.
- Remediation timing depends on severity, exploitability, and release scope.

## Safe Harbor

Good-faith testing is welcome when it avoids privacy violations, data destruction, persistence, lateral movement, social engineering, spam, and denial of service. Stop testing and report promptly if you access data that is not yours.

## Operator Responsibilities

Self-hosted operators are responsible for:

- Generating strong production secrets.
- Running behind TLS in production.
- Restricting administrative access.
- Backing up and protecting the database and uploaded files.
- Monitoring logs for suspicious activity.
- Keeping the application and dependencies updated.
