# From nothing to your first Transaction

This takes you from a machine with Docker to a running Instance with a real
Transaction recorded in it. It should take about ten minutes, most of it waiting
for images to download.

You need Docker with the Compose plugin, and nothing else. No email server, no
TLS certificate, no database administration.

## 1. Create a directory for your Instance

Everything about your Instance — its configuration and its data volume — is tied
to one directory. Pick somewhere permanent.

```bash
mkdir kuber && cd kuber
```

## 2. Fetch the Compose file and configuration

```bash
curl -fsSLO https://raw.githubusercontent.com/t-dhruv/Kuber/master/docker-compose.prod.yml
curl -fsSL  https://raw.githubusercontent.com/t-dhruv/Kuber/master/.env.example -o .env
```

## 3. Set your secrets

Kuber will not start without these three. Generate them rather than inventing
them:

```bash
printf 'POSTGRES_PASSWORD=%s\n'  "$(openssl rand -base64 32 | tr -d '/+=')" >> .env
printf 'JWT_SECRET=%s\n'         "$(openssl rand -base64 48 | tr -d '/+=')" >> .env
printf 'JWT_REFRESH_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '/+=')" >> .env
```

Choose the port you will reach Kuber on:

```bash
echo 'HTTP_PORT=8080' >> .env
```

If you will use Kuber over plain HTTP on your home network — that is, you will
type an address like `http://192.168.1.50:8080` rather than `https://` — add
this too:

```bash
echo 'COOKIE_SECURE=false' >> .env
```

Without it your browser discards Kuber's session cookie and logs you out every
fifteen minutes or so. Leave it out if you are going to put HTTPS in front.

## 4. Start it

```bash
docker compose -f docker-compose.prod.yml up -d
```

The first start pulls two images, initialises the database, and applies about
eighty migrations before the API accepts traffic. Watch it happen:

```bash
docker compose -f docker-compose.prod.yml logs -f server
```

Press `Ctrl-C` to stop watching once you see the server report it is listening.

Check all three services are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

And that the Instance answers:

```bash
curl -fsS http://localhost:8080/health
# ok
```

## 5. Claim your Instance

Open `http://localhost:8080` in a browser — or `http://<machine-ip>:8080` from
another device on your network.

Choose **Sign up**, and fill in your name, email address, a password of at least
eight characters, and a name for your Household.

You are signed straight in. There is no verification email to wait for, because
you have not configured an email server and a message nobody can deliver would
lock you out of your own Instance.

Two things just happened worth knowing:

- **Your Household was created.** It is the boundary every financial record
  belongs to. No query can cross between Households.
- **Registration closed behind you.** Now that a Household exists, strangers
  cannot sign up, even if this Instance is reachable from the internet. You can
  invite people from Settings, or reopen signup with `ALLOW_SIGNUP=true`.

## 6. Add an Account

An **Account** in Kuber is a financial account — chequing, savings, a credit
card. It is never a login.

Go to **Accounts** and choose **Add Account**. Fill in:

- **Account Name** — `Main Chequing`
- **Account Type** — `Chequing`
- **Starting Balance** — `5000`

Choose **Add Account**. It appears in the list, and your net worth updates to
match.

The starting balance is the balance *today*, not when the account was opened.
Kuber works backwards from it as you add history.

## 7. Record a Transaction

Go to **Transactions** and choose **Add Transaction**.

The form opens on **Expense**, which is what we want. Fill in:

- **Amount** — `42.50`
- **Merchant / Description** — `Corner Grocer`
- **Account** — `Main Chequing`

Leave the date as today and the category empty for now.

Choose **Add Expense**.

The Transaction appears in the list, and `Main Chequing` drops to $4,957.50.

That is the whole loop: an Instance you own, a Household, an Account, and a
Transaction recorded against it. Everything else in Kuber builds on these.

## What to do next

**Categorise as you go.** Assign a Category to that Transaction. Category type —
income, expense, or transfer — is what every report reads, so getting it right
matters more than the name.

**Bring in your history.** Rather than typing months of Transactions, export CSV
from your bank and import it. See the
[CSV import format](03-reference.md#csv-import-format).

**Automate the categorising.** Once you have imported real data, create Rules so
matching Transactions are categorised for you.

**Protect the Instance.** Two things are worth doing before you rely on it:

- [Set up backups](02-how-to/backup.md) — your data exists in exactly one place
  until you do.
- [Put HTTPS in front](02-how-to/https.md) if it will be reachable from outside
  your network.

**Invite your Household.** [Configure email](02-how-to/email.md) first, so
invitations can actually be delivered.
