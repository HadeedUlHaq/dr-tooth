# Deploying the OpenWA WhatsApp gateway and connecting dr-tooth

dr-tooth runs on Vercel and cannot host OpenWA directly. OpenWA needs an
always-on container with headless Chromium and persistent storage, so it should
run on a separate VM or container host. The Vercel app only talks to it over
HTTPS for QR/status/send calls and receives OpenWA webhooks.

```text
Patient WhatsApp -> OpenWA gateway -> dr-tooth /api/whatsapp/webhook
dr-tooth dashboard -> OpenWA gateway for QR/status/send
```

## 1. Run OpenWA

On the VM or container host:

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
docker compose up -d
docker compose logs -f
```

OpenWA listens on port `2785`. Get the generated admin API key:

```bash
docker compose exec app cat /app/data/.api-key
```

Save that value as `OPENWA_API_KEY`.

## 2. Expose OpenWA over HTTPS

Use a stable HTTPS URL for the gateway. A Cloudflare Tunnel works well because
you do not need to expose port `2785` directly.

The resulting URL becomes:

```text
OPENWA_API_URL=https://openwa.<your-domain>.com
```

Do not use a temporary tunnel URL for production because it changes when the
tunnel restarts.

## 3. Create the WhatsApp session and webhook

Create the OpenWA session with the webhook URL pointing at the Vercel production
domain:

```bash
curl -X POST https://openwa.<your-domain>.com/api/sessions \
  -H "X-API-Key: owa_k1_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dr-tooth",
    "webhook": {
      "url": "https://<your-vercel-production-domain>/api/whatsapp/webhook",
      "events": ["message.received"]
    }
  }'
```

The response includes an `id` like `sess_...`. Save that as
`OPENWA_SESSION_ID`.

For the current Vercel production alias, the webhook URL is:

```text
https://dental-clinic-hazel-ten.vercel.app/api/whatsapp/webhook
```

If your OpenWA build does not expose a webhook update endpoint, create a new
session with the Vercel webhook URL and use the new `sess_...` value in Vercel.

## 4. Configure Vercel environment variables

Set these on the `dr-tooth/dental-clinic` Vercel project for Production:

```powershell
vercel env add OPENWA_API_URL production
vercel env add OPENWA_API_KEY production
vercel env add OPENWA_SESSION_ID production
```

If you configured a webhook secret in OpenWA, set the same value in Vercel:

```powershell
vercel env add OPENWA_WEBHOOK_SECRET production
```

The WhatsApp agent also needs the AI key at runtime:

```powershell
vercel env add OPENAI_API_KEY production
```

Vercel injects environment variables only into new deployments. Redeploy after
adding or changing them:

```powershell
vercel --prod
```

## 5. Scan the QR from the app

1. Open Dashboard -> Chat Bot -> Connect WhatsApp.
2. The QR appears through the server-side Vercel proxy, so the OpenWA API key
   never reaches the browser.
3. On the clinic phone, open WhatsApp -> Settings -> Linked Devices -> Link a
   Device, then scan the QR code.
4. The page switches to connected once OpenWA reports the session is linked.

## 6. Test end to end

From another phone, message the clinic number. The expected flow is:

```text
OpenWA -> Vercel webhook -> dr-tooth agent -> OpenWA send-text -> WhatsApp reply
```

Useful checks:

- `vercel env ls` should show the OpenWA variables for Production.
- `https://<your-vercel-production-domain>/api/whatsapp/webhook` should return
  JSON with `status: "ok"` on GET.
- `docker compose logs -f` on the OpenWA host should show webhook delivery.
- Vercel function logs should show `/api/whatsapp/webhook` requests.
