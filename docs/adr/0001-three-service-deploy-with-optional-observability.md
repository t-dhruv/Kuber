# Three-service default deploy, observability opt-in

The production stack ran eight services — postgres, server, client, a standalone nginx,
plus prometheus, loki, promtail and grafana — and proxied through nginx twice, because
the client image already bakes in an nginx that proxies `/api` to the server. That is a
lot of machinery to ask a household to operate in order to track a budget, and every one
of those services is surface we would have to support at 1.0.

The default `docker-compose.prod.yml` is now postgres + server + client. The standalone
nginx is dropped as redundant. The observability stack is preserved verbatim as an opt-in
`docker-compose.observability.yml` overlay for self-hosters who want it.

## Consequences

TLS no longer has an obvious home, since the edge nginx was the only place terminating
it. Self-hosters are expected to front Kuber with their own reverse proxy or tunnel. See
ADR-0002 for how plain-HTTP LAN installs are handled.
