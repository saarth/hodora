# Running Hodora on Unraid

A step-by-step guide for self-hosting Hodora on an Unraid server. This
assumes no prior Docker experience beyond clicking around the Unraid web UI.

Two ways to do it — pick one:

- **[Option A: Docker Compose Manager](#option-a-docker-compose-manager-recommended)**
  — easiest, uses the `docker-compose.yml` already in this repo.
- **[Option B: Manual container](#option-b-manual-container-no-plugin)** —
  no extra plugin, a bit more manual.

Either way, do this first:

## 0. Set up Supabase (one-time, needed either way)

Hodora needs a free [Supabase](https://supabase.com/) project for auth and
data storage — it's not optional, the app won't start without it. Follow
step 3 ("Configure environment variables") in the main
[README](../README.md#3-configure-environment-variables) to create a
Supabase project and collect these values:

- `SUPABASE_URL` (a.k.a. `VITE_SUPABASE_URL`)
- `SUPABASE_PROJECT_ID` (a.k.a. `VITE_SUPABASE_PROJECT_ID`)
- `SUPABASE_PUBLISHABLE_KEY` (a.k.a. `VITE_SUPABASE_PUBLISHABLE_KEY`) — the
  public "anon" key
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → **Project
  Settings → API**. Keep this one secret; never share it or put it in a
  public place.

Keep these handy — you'll paste them in below.

---

## Option A: Docker Compose Manager (recommended)

1. **Install the plugin.** In the Unraid web UI: **Apps** tab → search
   `Docker Compose Manager` → **Install**. (If you don't see an **Apps** tab,
   install the *Community Applications* plugin first from **Settings →
   Plugins → Install Plugin**, using this URL:
   `https://raw.githubusercontent.com/Squidly271/community.applications/master/plugins/community.applications.plg`.)

2. **Get the project files onto your Unraid array.** Open the Unraid
   terminal (top-right **>_** icon) and run:

   ```sh
   mkdir -p /mnt/user/appdata/hodora
   cd /mnt/user/appdata/hodora
   git clone https://github.com/<your-username>/hodora.git .
   cp .env.example .env
   ```

3. **Fill in `.env`.** Still in the terminal:

   ```sh
   nano .env
   ```

   Paste in the four Supabase values from step 0 (both the `VITE_`-prefixed
   ones and the plain ones — `docker-compose.yml` uses both), plus
   `SUPABASE_SERVICE_ROLE_KEY`. Save with `Ctrl+O`, `Enter`, then exit with
   `Ctrl+X`.

4. **Add the project in Docker Compose Manager.** Unraid UI → **Docker**
   tab → **Compose** sub-tab → **Add New Stack**. Name it `hodora`, set its
   path to `/mnt/user/appdata/hodora`, and save.

5. **Start it.** Click **Compose Up**. The first run builds the image (a
   few minutes); watch the log for `Listening on http://0.0.0.0:3000`.

6. **Check it works.** Visit `http://<your-unraid-ip>:3000` in a browser —
   you should see Hodora's sign-in page.

To update later: `cd /mnt/user/appdata/hodora && git pull`, then **Compose
Down** → **Compose Up** again in the plugin (rebuilds with the latest code).

---

## Option B: Manual container (no plugin)

Use this if you'd rather not install another plugin. It builds the image by
hand and adds it as a regular Unraid Docker container.

1. **Build the image.** Open the Unraid terminal and run:

   ```sh
   mkdir -p /mnt/user/appdata/hodora
   cd /mnt/user/appdata/hodora
   git clone https://github.com/<your-username>/hodora.git .

   docker build \
     --build-arg VITE_SUPABASE_URL=https://your-project-id.supabase.co \
     --build-arg VITE_SUPABASE_PROJECT_ID=your-project-id \
     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key \
     -t hodora .
   ```

   Replace the three placeholder values with your actual Supabase values
   from step 0. This step takes a few minutes.

2. **Add the container in the Unraid UI.** **Docker** tab → **Add
   Container**, and fill in:

   | Field | Value |
   |---|---|
   | Name | `hodora` |
   | Repository | `hodora` (the image you just built — leave "Docker Hub" search results alone, just type this in) |
   | Network Type | `Bridge` |
   | Port | Container port `3000` → Host port `3000` (or any free port you prefer) |

3. **Add the runtime environment variables.** Still on the Add Container
   page, click **Add another Path, Port, Variable...** four times and add:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://your-project-id.supabase.co` |
   | `SUPABASE_PROJECT_ID` | `your-project-id` |
   | `SUPABASE_PUBLISHABLE_KEY` | `your-anon-key` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `your-service-role-key` |

   These are separate from the `--build-arg` values in step 1 — the build
   args got baked into the client bundle already, these are read by the
   server at startup. Don't skip `SUPABASE_SERVICE_ROLE_KEY` here; account
   deletion won't work without it.

4. **Apply**, then check the container's log for `Listening on
   http://0.0.0.0:3000`.

5. **Check it works.** Visit `http://<your-unraid-ip>:3000` in a browser.

To update later: pull the latest code, rebuild the image, then restart the
container:

```sh
cd /mnt/user/appdata/hodora
git pull
docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_PROJECT_ID=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... -t hodora .
```

Then in the Unraid UI: **Docker** tab → click the `hodora` container's icon
→ **Restart** (it'll pick up the freshly built `hodora:latest` image).

---

## Put HTTPS in front of it (needed for offline mode)

`http://<unraid-ip>:3000` works fine for basic use, but browsers only allow
service workers over HTTPS (or real `localhost`) — so offline maps, offline
routes, and "Add to Home Screen" **won't work** without HTTPS in front.

If you already own a domain on Cloudflare, **Cloudflare Tunnel** (below) is
the simplest option — no port forwarding, and free HTTPS handled entirely
by Cloudflare. If you'd rather run your own reverse proxy instead,
[Nginx Proxy Manager](https://nginxproxymanager.com/) or
[SWAG](https://docs.linuxserver.io/general/swag/) (also installable from
the **Apps** tab) both work too — point them at `http://<unraid-ip>:3000`
the same way you would any other container.

### Using a Cloudflare domain (Cloudflare Tunnel)

This is the recommended option if your domain is already on Cloudflare —
it doesn't require opening any ports on your router, and Cloudflare issues
and renews the HTTPS certificate for you automatically.

1. **Make sure the domain is active on Cloudflare.** If you bought it
   through Cloudflare Registrar this is already true. If you bought it
   elsewhere, add it as a site in the
   [Cloudflare dashboard](https://dash.cloudflare.com/) and update your
   registrar's nameservers to the two Cloudflare gives you (can take a few
   hours to propagate).

2. **Create a tunnel.** In the
   [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) →
   **Networks → Tunnels → Create a tunnel** → choose **Cloudflared** → give
   it a name (e.g. `hodora`) → **Save tunnel**.

3. **Copy the tunnel token into `.env`.** The setup page shows an install
   command for several platforms — copy the token from any of them (the
   long string after `--token`) into `CLOUDFLARE_TUNNEL_TOKEN` in your
   `.env` file (`nano .env`, same one from step 3 above). No separate
   container to install — `docker-compose.yml` already has a `cloudflared`
   service that picks this up and runs alongside `hodora`.

4. **Add a public hostname.** Still on the tunnel's config page → **Public
   Hostname** tab → **Add a public hostname**:

   | Field | Value |
   |---|---|
   | Subdomain | `hodora` (or whatever you want, e.g. `bike`) |
   | Domain | your domain, e.g. `example.com` |
   | Type | `HTTP` |
   | URL | `hodora:3000` (the compose service name — the two containers talk over the compose network, not `localhost`) |

   Save. Cloudflare automatically creates the DNS record and terminates
   HTTPS for you — there's no certificate to manage.

5. **Bring up the stack** (or re-update it from Compose Manager if it's
   already running) so the `cloudflared` service picks up the new env var.
   The tunnel should show as **Healthy** in the Zero Trust dashboard within
   a few seconds.

6. **Visit** `https://hodora.example.com`. It should load Hodora with a
   valid HTTPS padlock, no port forwarding required.

To rotate the token later, generate a new one from the tunnel's config page
and update `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, then update the stack.

