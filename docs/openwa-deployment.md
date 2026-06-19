# Deploying the OpenWA WhatsApp gateway (Oracle Cloud Free) + connecting dr-tooth

dr-tooth runs on **Cloudflare Workers** and can't host OpenWA (which needs a 24/7
container with headless Chromium and a persistent disk). So OpenWA runs on its own
**Oracle Cloud Always Free** ARM VM, and the app talks to it over HTTPS.

```
Patient WhatsApp ─▶ OpenWA (Oracle VM) ─┬─ webhook ─▶ dr-tooth /api/whatsapp/webhook
                                        └─ QR/status/send ◀─ dr-tooth dashboard (proxied)
```

---

## 1. Create the Oracle Cloud VM

1. Sign up at <https://cloud.oracle.com> (card required for identity only — Always Free
   resources never charge).
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04 (aarch64)**
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM) — set **2 OCPU / 12 GB** (within the
     free 4 OCPU / 24 GB allowance).
   - Add your SSH public key.
   - ⚠️ If you get "Out of host capacity", switch Availability Domain or region and retry —
     A1 free capacity comes and goes.
3. SSH in: `ssh ubuntu@<public-ip>`

> We will **not** open port 2785 to the internet. Instead we use a Cloudflare Tunnel so
> the gateway is reachable over HTTPS with no inbound ports (Oracle's Ubuntu images also
> block ports via iptables by default, which the tunnel sidesteps).

---

## 2. Install Docker

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
```

## 3. Run OpenWA

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
docker compose up -d          # SQLite + local storage, zero config
docker compose logs -f        # watch it boot (Ctrl+C to stop watching)
```

It listens on **port 2785**. Grab the auto-generated admin API key (format `owa_k1_...`):

```bash
docker compose exec app cat /app/data/.api-key
```

Save that — it's your **`OPENWA_API_KEY`**.

---

## 4. Expose it via Cloudflare Tunnel (free HTTPS, no open ports)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo install cloudflared /usr/local/bin/ && rm cloudflared

cloudflared tunnel login                       # opens a URL; authorize your CF account
cloudflared tunnel create openwa
cloudflared tunnel route dns openwa openwa.<your-domain>.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: openwa
credentials-file: /home/ubuntu/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: openwa.<your-domain>.com
    service: http://localhost:2785
  - service: http_status:404
```

Run it as a service so it survives reboots:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Now `https://openwa.<your-domain>.com` → your gateway. That's your **`OPENWA_API_URL`**.

> No custom domain on Cloudflare? Use a quick tunnel for testing instead:
> `cloudflared tunnel --url http://localhost:2785` prints a temporary
> `https://<random>.trycloudflare.com` URL (changes each run — fine for a first test).

---

## 5. Create the WhatsApp session + webhook

Point OpenWA's webhook at your deployed app's webhook route:

```bash
curl -X POST https://openwa.<your-domain>.com/api/sessions \
  -H "X-API-Key: owa_k1_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dr-tooth",
    "webhook": {
      "url": "https://<your-app-domain>/api/whatsapp/webhook",
      "events": ["message.received"]
    }
  }'
```

The response includes `"id": "sess_..."` → that's your **`OPENWA_SESSION_ID`**.

(Optional HMAC: add `"secret": "<random-string>"` inside `webhook` above, and set the
same value as `OPENWA_WEBHOOK_SECRET` in step 6. The webhook route enforces it only when
that env var is present.)

---

## 6. Configure dr-tooth and redeploy

Set the secrets on the Cloudflare Worker:

```bash
npx wrangler secret put OPENWA_API_URL        # https://openwa.<your-domain>.com
npx wrangler secret put OPENWA_API_KEY        # owa_k1_...
npx wrangler secret put OPENWA_SESSION_ID     # sess_...
npx wrangler secret put OPENWA_WEBHOOK_SECRET # optional; only if you set a secret above
```

Redeploy:

```bash
npm run build:cloudflare && npx wrangler deploy
```

---

## 7. Scan the QR from the app

1. Open **Dashboard → Chat Bot → Connect WhatsApp** (`/dashboard/whatsapp/connect`).
2. The QR appears (proxied from OpenWA; the API key stays server-side).
3. On the clinic phone: **WhatsApp → Settings → Linked Devices → Link a Device** → scan.
4. The page flips to **✓ Connected** with the phone number.

## 8. Test end to end

From another phone, message the clinic number. Flow:
`OpenWA → webhook → dr-tooth agent → send-text → reply on WhatsApp`.

Watch logs with `docker compose logs -f` (gateway) and `npx wrangler tail` (worker).

---

## Notes / gotchas

- **Keep the session alive**: the named docker volume persists the WhatsApp login across
  restarts, so you only scan the QR once. Don't `docker compose down -v` (the `-v` wipes it).
- **Engine/endpoint differences**: OpenWA's docs disagree slightly on the send endpoint.
  This integration uses `POST /api/sessions/:id/messages/send-text` with `{chatId,text}`.
  If your build's Swagger (`/api/docs`) differs, adjust `lib/whatsapp/openwaClient.ts`.
- **Webhook payload**: parser expects `message.received` with `data.from` / `data.body` /
  `data.isGroup`. Confirm against a real delivery (`wrangler tail`) and tweak
  `app/api/whatsapp/webhook/route.ts` if field names differ.
