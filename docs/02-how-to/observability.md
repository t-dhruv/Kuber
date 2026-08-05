# Adding the observability overlay

The default stack is three services. Prometheus, Loki, Promtail and Grafana are
opt-in: tracking a household budget should not require operating a metrics
pipeline
([ADR-0001](../adr/0001-three-service-deploy-with-optional-observability.md)).

They are still shipped, unchanged, in a second Compose file.

## Start it

The overlay needs the `observability/` configuration directory, which is in the
repository. If you installed by downloading only `docker-compose.prod.yml`,
clone the repository or fetch that directory first.

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.observability.yml \
  up -d
```

Both files, every time. Composing only the overlay will not work, and composing
only the default file after starting the overlay leaves orphaned containers —
Compose will tell you so and suggest `--remove-orphans`.

Set Grafana's credentials in `.env` before the first start:

```bash
GRAFANA_USER=admin
GRAFANA_PASSWORD=a-long-random-password
```

## What you get

| Service      | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `prometheus` | Scrapes the server's metrics endpoint and stores them.      |
| `loki`       | Stores logs.                                                |
| `promtail`   | Ships container logs into Loki.                             |
| `grafana`    | Dashboards over both, provisioned on first start.           |

Grafana comes up with its datasources and three dashboards already provisioned —
an overview, a logs view, and a jobs view. You do not need to add them by hand.

## A note on the metrics

Kuber's metrics deliberately carry no `household_id` label. Per-Household
labels would let anyone with access to the metrics endpoint infer your
Household's activity, and on a single-family Instance the cardinality buys
nothing.

## Stop just the overlay

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.observability.yml \
  stop prometheus loki promtail grafana
```

To remove it entirely and return to three services:

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.observability.yml \
  down

docker compose -f docker-compose.prod.yml up -d
```

Your financial data is untouched by any of this — it lives in the Postgres
volume, which the overlay never writes to.
