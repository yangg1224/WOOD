# Cobble — Architecture & Technical Decisions

## Overview

Cobble is a single-page static ecommerce site for handmade wooden goods. The frontend is a single `index.html` file (Tailwind CSS CDN, no build step). A minimal Node.js server handles static file serving and the payment API endpoint.

---

## System Diagram

```
Browser
  │
  ├─ GET /                → server.mjs → index.html
  ├─ GET /success.html    → server.mjs → success.html
  ├─ GET /cancel.html     → server.mjs → cancel.html
  │
  └─ POST /api/checkout   → server.mjs
                               │
                               └─ stripe.checkout.sessions.create()
                                       │
                                       ▼
                               Stripe Hosted Checkout Page
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                  success.html                 cancel.html
               (clears localStorage)         (cart preserved)
```

---

## File Structure

```
/
├── index.html            # Full site: nav, hero, products, cart drawer, all JS
├── server.mjs            # Node.js HTTP server: static files + POST /api/checkout
├── serve.mjs             # Legacy dev-only static server (no Stripe; keep for reference)
├── success.html          # Post-payment success page (clears cobble_cart from localStorage)
├── cancel.html           # Post-payment cancel page (cart preserved)
├── package.json          # "type":"module", start: node server.mjs
├── .env                  # STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, BASE_URL (never commit)
├── .env.example          # Template for .env
├── .gitignore            # .env + node_modules
├── screenshot.mjs        # Puppeteer screenshot tool (dev only)
├── reference/
│   ├── brand_assets/     # cobble-logo-transparent.png
│   └── Products/         # Product images (Wooden Mugs, Spoons, Trays, Art)
└── docs/
    ├── ARCHITECTURE.md   # This file
    └── plans/
        └── 2026-04-09-cart-checkout.md  # Step-by-step implementation plan
```

---

## Frontend Architecture (`index.html`)

### Product Data Layer

A global `PRODUCTS` array at the top of `<body>` is the frontend's product catalog:

```js
const PRODUCTS = [
  { id: 'walnut-mug', name: 'Walnut Turned Mug', price: 6800, img: '...' },
  // ...10 products total
];
// Prices in cents (Stripe convention): 6800 = $68.00 CAD
```

Each product card in HTML has `data-product-id="<id>"` linking it to this array.

**Important:** Frontend prices are display-only. The backend `server.mjs` maintains its own price table and never trusts client-submitted prices.

### Cart State (`Cart` module)

Vanilla JS IIFE module with `localStorage` persistence. Key: `cobble_cart`.

```js
Cart.add(productId)       // adds 1 unit, or increments if already in cart
Cart.remove(productId)    // removes item entirely
Cart.updateQty(id, qty)   // sets qty; qty < 1 removes
Cart.load()               // → [{id, qty}, ...]
Cart.count()              // → total units (badge count)
Cart.total()              // → subtotal in cents
Cart.clear()              // empties cart (called from success.html)
```

Dispatches a `cart:updated` CustomEvent on every mutation. Badge and drawer listen to this event.

### Cart Drawer

Slide-in panel (`#cart-drawer`, `z-index: 70`) with:
- Overlay backdrop (`#cart-overlay`, `z-index: 60`)
- CSS classes `is-open` drive the transform transition (no JS style mutations)
- `body.cart-open` sets `overflow: hidden` to prevent background scroll
- Delegated click handlers for qty +/−  and remove
- Accessible: `role="dialog"`, `aria-modal="true"`, focus moves to close button on open, Escape closes

### Checkout Flow

```
User clicks "Checkout"
  → fetch POST /api/checkout  { items: [{id, qty}, ...] }
  ← { url: "https://checkout.stripe.com/..." }
  → window.location.href = url  (redirect to Stripe hosted page)
```

---

## Backend Architecture (`server.mjs`)

Single Node.js HTTP server. No framework. Two responsibilities:

### 1. Static file serving

Reads files from project root by URL path. Returns 404 for missing files. Handles MIME types for HTML, CSS, JS, images, video, fonts.

### 2. `POST /api/checkout`

1. Parses JSON body `{ items: [{id, qty}] }`
2. Validates each item against the server-side `PRODUCTS` map (price lookup; unknown IDs are silently dropped)
3. Creates a Stripe Checkout Session with:
   - `mode: 'payment'` (one-time purchase)
   - `currency: 'cad'`
   - `success_url` → `/success.html?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url` → `/cancel.html`
4. Returns `{ url }` — the Stripe hosted checkout URL

**Security note:** Prices are always read from the server-side `PRODUCTS` map, never from the request body. This prevents price manipulation attacks.

---

## Payment Flow (Stripe Checkout)

```
Our server creates a Checkout Session
  → Stripe hosts the payment page (card entry, address, 3DS, Apple/Google Pay)
  → Stripe processes the payment
  → Stripe redirects to success_url or cancel_url
```

**PCI scope:** Zero. Card data never touches our server. Stripe is PCI DSS Level 1 certified.

**Test cards:**
| Card Number          | Behavior         |
|----------------------|------------------|
| 4242 4242 4242 4242  | Payment succeeds |
| 4000 0000 0000 0002  | Card declined    |
| 4000 0025 0000 3155  | Requires 3DS     |

Use any future expiry date, any 3-digit CVC, any postal code.

---

## Environment Variables

| Variable               | Required | Description                              |
|------------------------|----------|------------------------------------------|
| `STRIPE_SECRET_KEY`    | Yes      | `sk_test_...` for dev, `sk_live_...` for prod |
| `STRIPE_PUBLISHABLE_KEY` | No (unused server-side) | Documented in `.env.example` for future use |
| `BASE_URL`             | No       | Defaults to `http://localhost:3000`. Set to your production domain for Stripe redirect URLs. |

---

## Tech Stack Decisions

| Decision | Choice | Alternatives Considered | Why |
|---|---|---|---|
| Cart state | `localStorage` + vanilla JS | Redux, Zustand, React Context | No framework installed; localStorage survives refresh; zero dependencies |
| Payment | Stripe Checkout (hosted) | Stripe.js Payment Element, Shopify Buy Button, Snipcart | Hosted = zero PCI scope; Stripe handles card UI, 3DS, Apple Pay; free tier |
| Backend | Bare Node.js (`http` module) | Express, Fastify, Next.js API routes | Minimal: only one endpoint needed; no framework overhead |
| Frontend framework | None (vanilla JS) | React, Vue, Svelte | Site is a single HTML file; framework migration would be scope creep |
| Database | None | Postgres, Firestore | Product catalog is static; order data lives in Stripe Dashboard |
| Currency | CAD | USD | Brand is Canadian |

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Set up Stripe keys
cp .env.example .env
# Edit .env: add your STRIPE_SECRET_KEY from https://dashboard.stripe.com/test/apikeys

# 3. Start server
node server.mjs
# → http://localhost:3000

# 4. Take a screenshot (optional)
node screenshot.mjs http://localhost:3000
```

---

## Deployment Checklist

1. Set `STRIPE_SECRET_KEY=sk_live_...` in production environment
2. Set `BASE_URL=https://yourdomain.com` in production environment
3. Update Stripe Dashboard → Developers → Webhooks (optional: add order confirmation email via webhook)
4. Ensure `node_modules/` and `.env` are excluded from deployment if using git-based deploy
5. Switch from `serve.mjs` to `server.mjs` as the start command

---

## Known Limitations / Future Work

- **No order confirmation email** — requires a Stripe webhook handler (`POST /webhook`) and an email service (Resend, SendGrid)
- **No inventory management** — product catalog is static; sold-out states not tracked
- **No product detail pages** — all products exist as cards on the homepage
- **Cart has no expiry** — localStorage persists indefinitely; a real shop should expire carts after N days
- **No shipping calculation** — Stripe Checkout can collect shipping address; rates would need to be added
