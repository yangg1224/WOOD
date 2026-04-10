# Cart & Checkout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fully working add-to-cart + Stripe-powered checkout flow to the Cobble static site.

**Architecture:** Keep `index.html` as a single file with all cart state in `localStorage` and a slide-in cart drawer. Extend `serve.mjs` into a new `server.mjs` that also handles a `POST /api/checkout` route which creates a Stripe Checkout Session and returns the hosted URL. Payment page and all card handling are fully delegated to Stripe — zero PCI scope on our server.

**Tech Stack:** Vanilla JS + localStorage (cart), Stripe Checkout (hosted payment page), Node.js + `stripe` npm package (1 API endpoint), `.env` for secrets.

---

## Tech Stack Decision

| Concern | Choice | Why |
|---|---|---|
| Cart state | `localStorage` + vanilla JS | No framework needed; survives page refresh |
| Cart UI | Slide-in drawer (CSS + JS, inline in index.html) | Matches existing single-file approach |
| Payment | **Stripe Checkout** (hosted page) | PCI handled by Stripe; no card data on our server |
| Backend | Node.js `server.mjs` — 1 route (`POST /api/checkout`) | Minimal; secret key stays server-side |
| Product catalog | JS object `PRODUCTS` in index.html | No DB needed; static catalog |
| Success / cancel | `success.html`, `cancel.html` | Stripe redirects here after payment |

**Why NOT alternatives:**
- *Shopify Buy Button* — requires paid Shopify account, $29+/mo
- *Snipcart* — 2% transaction fee on top of payment processor
- *Stripe.js Payment Element (pure frontend)* — secret key still needs a server to create PaymentIntent
- *Next.js migration* — massive scope creep for a 1-page site

---

## Prerequisites (do before Task 1)

1. Create a [Stripe account](https://dashboard.stripe.com/register) (free)
2. Copy your **test keys** from Stripe Dashboard → Developers → API Keys:
   - `STRIPE_PUBLISHABLE_KEY` (starts with `pk_test_`)
   - `STRIPE_SECRET_KEY` (starts with `sk_test_`)
3. Run `npm init -y` in the project root (creates `package.json`)
4. Run `npm install stripe dotenv`
5. Create `.env` in project root:
   ```
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
   STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
   ```

---

## Task 1: Product Data Layer

**Goal:** Extract all products from HTML into a canonical JS object so cart + Stripe can reference them by ID.

**Files:**
- Modify: `index.html` — add `PRODUCTS` const in a `<script>` at the top of `<body>`

**Step 1: Add PRODUCTS array inside a script tag near the top of `<body>` in `index.html`**

```html
<script>
const PRODUCTS = [
  { id: 'walnut-mug',      name: 'Walnut Turned Mug',     price: 6800,  img: 'reference/Products/Wooden Mugs/52.jpg' },
  { id: 'maple-mug',       name: 'Maple Grain Mug',        price: 7200,  img: 'reference/Products/Wooden Mugs/53.jpg' },
  { id: 'carved-spoon-set',name: 'Carved Spoon Set',       price: 4400,  img: 'reference/Products/Wooden Spoons/71.jpg' },
  { id: 'rustic-oak-mug',  name: 'Rustic Oak Mug',         price: 6400,  img: 'reference/Products/Wooden Mugs/54.jpg' },
  { id: 'walnut-spoon',    name: 'Serving Spoon — Walnut', price: 3800,  img: 'reference/Products/Wooden Spoons/72.jpg' },
  { id: 'cherry-mug',      name: 'Cherry Wood Mug',        price: 7500,  img: 'reference/Products/Wooden Mugs/55.jpg' },
  { id: 'birch-spoon',     name: 'Birch Spoon — Slim',     price: 3200,  img: 'reference/Products/Wooden Spoons/74.jpg' },
  { id: 'oak-tray',        name: 'Oak Serving Tray',       price: 9800,  img: 'reference/Products/Wooden Trays/148.jpg' },
  { id: 'walnut-art',      name: 'Walnut Wall Art',        price: 12000, img: 'reference/Products/Wooden Art/65.jpg' },
];
// Prices are in cents (Stripe convention): 6800 = $68.00
</script>
```

> Note: Stripe uses **cents** (integers), not dollars. `6800 = $68.00`.

**Step 2: Add `data-product-id` attributes to each product card `<div class="product-card">`**

Match each card's `data-product-id` to the `id` in PRODUCTS. Example:
```html
<div class="product-card flex-none cursor-pointer" style="width: 300px;" data-product-id="walnut-mug">
```

Do this for all 6 cards in the Best Sellers strip.

**Step 3: Verify in browser console**
Open `http://localhost:3000`, open DevTools → Console, type `PRODUCTS` — should show the array.

**Step 4: Commit**
```bash
git add index.html
git commit -m "feat: add product data layer (PRODUCTS array)"
```

---

## Task 2: Cart State (localStorage)

**Goal:** A `Cart` module that persists items in `localStorage` and notifies the UI when it changes.

**Files:**
- Modify: `index.html` — add Cart module in `<script>` after PRODUCTS

**Step 1: Add Cart module to `index.html`**

```js
const Cart = (() => {
  const KEY = 'cobble_cart';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: items }));
  }

  function add(productId) {
    const items = load();
    const existing = items.find(i => i.id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      const product = PRODUCTS.find(p => p.id === productId);
      if (!product) return;
      items.push({ id: productId, qty: 1 });
    }
    save(items);
  }

  function remove(productId) {
    save(load().filter(i => i.id !== productId));
  }

  function updateQty(productId, qty) {
    if (qty < 1) { remove(productId); return; }
    const items = load();
    const item = items.find(i => i.id === productId);
    if (item) { item.qty = qty; save(items); }
  }

  function clear() { save([]); }

  function total() {
    return load().reduce((sum, item) => {
      const p = PRODUCTS.find(p => p.id === item.id);
      return sum + (p ? p.price * item.qty : 0);
    }, 0);
  }

  function count() {
    return load().reduce((sum, i) => sum + i.qty, 0);
  }

  return { load, add, remove, updateQty, clear, total, count };
})();
```

**Step 2: Verify in console**
```js
Cart.add('walnut-mug');
Cart.load(); // [{id: 'walnut-mug', qty: 1}]
Cart.count(); // 1
Cart.total(); // 6800
Cart.clear();
```

**Step 3: Commit**
```bash
git add index.html
git commit -m "feat: cart state module with localStorage persistence"
```

---

## Task 3: "Add to Cart" Buttons on Product Cards

**Goal:** Every product card gets an "Add to Cart" button that triggers `Cart.add()`.

**Files:**
- Modify: `index.html` — product card HTML + button click handler

**Step 1: Add button to each product card in the Best Sellers strip**

Inside each `.product-card`, after the price `<span>`, add:
```html
<button
  class="add-to-cart btn-primary w-full mt-3 py-2 text-sm"
  data-product-id="walnut-mug"
  style="font-size: 14px; letter-spacing: .04em;"
>
  Add to Cart
</button>
```

> The `data-product-id` on the button must match the card's product ID.

**Step 2: Add click handler (in the main JS `<script>` at bottom of `<body>`)**

```js
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.add-to-cart');
  if (!btn) return;
  const id = btn.dataset.productId;
  Cart.add(id);
  // Visual feedback
  btn.textContent = 'Added!';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Add to Cart';
    btn.disabled = false;
  }, 1200);
});
```

**Step 3: Test manually**
Click "Add to Cart" on any product → button flashes "Added!" → `Cart.count()` in console increments.

**Step 4: Commit**
```bash
git add index.html
git commit -m "feat: add-to-cart buttons on product cards"
```

---

## Task 4: Cart Count Badge in Nav

**Goal:** The cart icon badge in the nav shows the live item count from `Cart.count()`.

**Files:**
- Modify: `index.html` — nav badge + listener

**Step 1: Add `id="cart-count"` to the badge span in nav**

Find the existing badge span (currently shows "2"):
```html
<span id="cart-count" class="absolute top-1 right-1 w-4 h-4 rounded-full text-xs font-semibold flex items-center justify-center" style="background: #5B4545; color: #FFFFFF; font-family: Inter; font-size: 10px; line-height: 1;">0</span>
```
Change the hardcoded `2` to `0`.

**Step 2: Update badge on cart change**

```js
function updateCartBadge() {
  const el = document.getElementById('cart-count');
  const n = Cart.count();
  el.textContent = n;
  el.style.display = n > 0 ? 'flex' : 'none';
}

document.addEventListener('cart:updated', updateCartBadge);
updateCartBadge(); // init on page load
```

**Step 3: Test**
Add an item → badge updates immediately.

**Step 4: Commit**
```bash
git add index.html
git commit -m "feat: live cart count badge in nav"
```

---

## Task 5: Cart Drawer UI

**Goal:** A slide-in drawer from the right showing cart items, quantities, subtotal, and a Checkout button.

**Files:**
- Modify: `index.html` — drawer HTML + CSS + open/close logic + render function

**Step 1: Add drawer HTML at the bottom of `<body>` (before closing `</body>`)**

```html
<!-- Cart Drawer Overlay -->
<div id="cart-overlay" class="fixed inset-0 z-[60]" style="background: rgba(30,20,20,.45); backdrop-filter: blur(2px); display: none; opacity: 0; transition: opacity .25s ease;" aria-hidden="true"></div>

<!-- Cart Drawer Panel -->
<aside id="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart"
  class="fixed top-0 right-0 h-full z-[70] flex flex-col"
  style="width: min(420px, 100vw); background: #FFFFFF; box-shadow: -8px 0 40px rgba(61,46,46,.18); transform: translateX(100%); transition: transform .35s cubic-bezier(.25,.46,.45,.94);">

  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-5 border-b" style="border-color: #D7D0C5;">
    <h2 class="font-display font-semibold" style="font-size: 24px; color: #3D2E2E;">Your Cart</h2>
    <button id="cart-close" aria-label="Close cart" class="p-2 rounded hover:bg-cream-dark transition-colors" style="transition: background .2s;">
      <svg width="20" height="20" fill="none" stroke="#5B4545" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <!-- Item List -->
  <div id="cart-items" class="flex-1 overflow-y-auto px-6 py-4" style="overscroll-behavior: contain;"></div>

  <!-- Footer: subtotal + checkout -->
  <div id="cart-footer" class="px-6 py-5 border-t" style="border-color: #D7D0C5; display: none;">
    <div class="flex justify-between items-baseline mb-4">
      <span class="font-body text-sm" style="color: #7A5E5E;">Subtotal</span>
      <span id="cart-subtotal" class="font-display font-semibold" style="font-size: 22px; color: #3D2E2E;"></span>
    </div>
    <button id="checkout-btn" class="btn-primary w-full py-4" style="font-size: 17px; letter-spacing: .03em; text-align: center;">
      Checkout
    </button>
    <p class="text-center font-body mt-3" style="font-size: 12px; color: #7A5E5E;">Secure payment via Stripe</p>
  </div>
</aside>
```

**Step 2: Add CSS for drawer (inside `<style>` block)**

```css
#cart-overlay.open { display: block !important; opacity: 1; }
#cart-drawer.open { transform: translateX(0) !important; }
body.cart-open { overflow: hidden; }
```

**Step 3: Add drawer render function**

```js
function renderCartDrawer() {
  const items = Cart.load();
  const container = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  const subtotal = document.getElementById('cart-subtotal');

  if (items.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center py-16">
        <svg width="48" height="48" fill="none" stroke="#D7D0C5" stroke-width="1.5" viewBox="0 0 24 24" class="mb-4"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        <p class="font-display" style="font-size: 20px; color: #3D2E2E; margin-bottom: 6px;">Your cart is empty</p>
        <p class="font-body text-sm" style="color: #7A5E5E;">Add something beautiful.</p>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  container.innerHTML = items.map(item => {
    const p = PRODUCTS.find(p => p.id === item.id);
    if (!p) return '';
    const lineTotal = ((p.price * item.qty) / 100).toFixed(2);
    return `
      <div class="flex gap-4 py-4 border-b" style="border-color: #F2F2EF;">
        <img src="${p.img}" alt="${p.name}" class="rounded" style="width: 72px; height: 72px; object-fit: cover; flex-shrink: 0;" />
        <div class="flex-1 min-w-0">
          <p class="font-display font-semibold truncate" style="font-size: 16px; color: #3D2E2E;">${p.name}</p>
          <p class="font-body text-sm mt-0.5" style="color: #7A5E5E;">$${(p.price/100).toFixed(2)}</p>
          <div class="flex items-center gap-3 mt-2">
            <button class="qty-btn" data-id="${p.id}" data-delta="-1" style="width:28px;height:28px;border-radius:6px;border:1.5px solid #D7D0C5;background:white;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">−</button>
            <span class="font-body font-medium" style="font-size: 14px; min-width: 20px; text-align: center;">${item.qty}</span>
            <button class="qty-btn" data-id="${p.id}" data-delta="1"  style="width:28px;height:28px;border-radius:6px;border:1.5px solid #D7D0C5;background:white;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">+</button>
            <button class="remove-btn" data-id="${p.id}" style="margin-left:auto;font-size:12px;color:#7A5E5E;background:none;border:none;cursor:pointer;padding:4px;text-decoration:underline;">Remove</button>
          </div>
        </div>
        <span class="font-body font-medium flex-shrink-0" style="font-size: 15px; color: #3D2E2E;">$${lineTotal}</span>
      </div>`;
  }).join('');

  subtotal.textContent = `$${(Cart.total() / 100).toFixed(2)}`;
  footer.style.display = 'block';
}
```

**Step 4: Add open/close logic and event wiring**

```js
function openCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer  = document.getElementById('cart-drawer');
  overlay.style.display = 'block';
  document.body.classList.add('cart-open');
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    drawer.style.transform = 'translateX(0)';
  });
  renderCartDrawer();
}

function closeCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer  = document.getElementById('cart-drawer');
  overlay.style.opacity = '0';
  drawer.style.transform = 'translateX(100%)';
  document.body.classList.remove('cart-open');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// Open on cart icon click
document.querySelector('[aria-label="Cart"]').addEventListener('click', openCart);
// Close on overlay or X button
document.getElementById('cart-overlay').addEventListener('click', closeCart);
document.getElementById('cart-close').addEventListener('click', closeCart);
// Close on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

// Qty / remove buttons (delegated)
document.getElementById('cart-items').addEventListener('click', e => {
  const qtyBtn    = e.target.closest('.qty-btn');
  const removeBtn = e.target.closest('.remove-btn');
  if (qtyBtn) {
    const id = qtyBtn.dataset.id;
    const delta = parseInt(qtyBtn.dataset.delta);
    const item = Cart.load().find(i => i.id === id);
    if (item) Cart.updateQty(id, item.qty + delta);
    renderCartDrawer();
  }
  if (removeBtn) {
    Cart.remove(removeBtn.dataset.id);
    renderCartDrawer();
  }
});

// Re-render when cart changes (badge already listens to this)
document.addEventListener('cart:updated', () => {
  updateCartBadge();
  // Only re-render drawer if it's open
  if (document.body.classList.contains('cart-open')) renderCartDrawer();
});
```

**Step 5: Test**
- Add items → click cart icon → drawer slides in with items
- Click +/− → quantities update
- Click Remove → item disappears
- Click overlay or X → drawer slides out
- Press Escape → drawer closes

**Step 6: Commit**
```bash
git add index.html
git commit -m "feat: cart drawer UI with quantity controls"
```

---

## Task 6: Backend Server (`server.mjs`)

**Goal:** Replace `serve.mjs` with `server.mjs` — serves static files AND handles `POST /api/checkout`.

**Files:**
- Create: `server.mjs`
- Modify: `package.json` — add start script

**Step 1: Create `server.mjs`**

```js
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import 'dotenv/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const mime = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json',
};

async function handleCheckout(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const { items } = JSON.parse(body);

  // Validate items against server-side product list
  const PRODUCTS = {
    'walnut-mug':       { name: 'Walnut Turned Mug',     price: 6800  },
    'maple-mug':        { name: 'Maple Grain Mug',        price: 7200  },
    'carved-spoon-set': { name: 'Carved Spoon Set',       price: 4400  },
    'rustic-oak-mug':   { name: 'Rustic Oak Mug',         price: 6400  },
    'walnut-spoon':     { name: 'Serving Spoon — Walnut', price: 3800  },
    'cherry-mug':       { name: 'Cherry Wood Mug',        price: 7500  },
    'birch-spoon':      { name: 'Birch Spoon — Slim',     price: 3200  },
    'oak-tray':         { name: 'Oak Serving Tray',       price: 9800  },
    'walnut-art':       { name: 'Walnut Wall Art',        price: 12000 },
  };

  const lineItems = items
    .filter(i => PRODUCTS[i.id])
    .map(i => ({
      price_data: {
        currency: 'cad',
        product_data: { name: PRODUCTS[i.id].name },
        unit_amount: PRODUCTS[i.id].price,
      },
      quantity: i.qty,
    }));

  if (lineItems.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No valid items' }));
    return;
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: 'http://localhost:3000/success.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:  'http://localhost:3000/cancel.html',
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: session.url }));
}

const server = createServer(async (req, res) => {
  // CORS headers (dev only)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API route
  if (req.method === 'POST' && req.url === '/api/checkout') {
    try { await handleCheckout(req, res); }
    catch (err) {
      console.error('Checkout error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static file serving
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = join(__dirname, decodeURIComponent(urlPath));
  const ext = extname(filePath).toLowerCase();
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => console.log(`Cobble server → http://localhost:${PORT}`));
```

**Step 2: Add start script to `package.json`**

```json
"scripts": {
  "start": "node server.mjs",
  "dev": "node server.mjs"
}
```

**Step 3: Add `.env` to `.gitignore`**

Create/edit `.gitignore`:
```
.env
node_modules/
```

**Step 4: Test the server starts**
```bash
node server.mjs
# Expected: "Cobble server → http://localhost:3000"
```

**Step 5: Commit**
```bash
git add server.mjs package.json .gitignore
git commit -m "feat: add server.mjs with Stripe checkout endpoint"
```

---

## Task 7: Checkout Flow (Frontend → Stripe)

**Goal:** Clicking "Checkout" in the cart drawer calls `/api/checkout`, gets a Stripe URL, and redirects the browser.

**Files:**
- Modify: `index.html` — checkout button handler

**Step 1: Add checkout handler**

```js
document.getElementById('checkout-btn').addEventListener('click', async () => {
  const btn = document.getElementById('checkout-btn');
  btn.disabled = true;
  btn.textContent = 'Redirecting…';

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Cart.load() }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Checkout failed');
    }
  } catch (err) {
    alert('Something went wrong: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Checkout';
  }
});
```

**Step 2: Test end-to-end (test mode)**
1. Start server: `node server.mjs`
2. Open `http://localhost:3000`
3. Add items to cart
4. Open cart drawer → click Checkout
5. Should redirect to Stripe's hosted checkout page
6. Use test card: **4242 4242 4242 4242**, any future date, any CVC, any zip
7. Should redirect to `http://localhost:3000/success.html`

**Step 3: Commit**
```bash
git add index.html
git commit -m "feat: checkout button calls Stripe API and redirects"
```

---

## Task 8: Success & Cancel Pages

**Goal:** Friendly landing pages after payment completes or is cancelled.

**Files:**
- Create: `success.html`
- Create: `cancel.html`

**Step 1: Create `success.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmed — Cobble</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    body { background: #FFFFFF; font-family: 'Inter', sans-serif; color: #3D2E2E; }
    .font-display { font-family: 'Cormorant Garamond', Georgia, serif; }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center text-center px-6">
  <div class="max-w-md">
    <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style="background: #E3E0AC;">
      <svg width="28" height="28" fill="none" stroke="#3D2E2E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1 class="font-display font-semibold mb-3" style="font-size: 42px; color: #3D2E2E;">Order received.</h1>
    <p class="mb-8" style="color: #7A5E5E; font-size: 17px; line-height: 1.7;">Thank you for your Cobble order. You'll receive a confirmation email shortly.</p>
    <a href="/" style="display:inline-block; background:#5B4545; color:#fff; font-family:'Cormorant Garamond',serif; font-weight:600; padding: 14px 32px; border-radius:6px; text-decoration:none; font-size:17px; letter-spacing:.02em;">Back to Shop</a>
  </div>
  <script>
    // Clear the cart on successful checkout
    localStorage.removeItem('cobble_cart');
  </script>
</body>
</html>
```

**Step 2: Create `cancel.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Checkout Cancelled — Cobble</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    body { background: #FFFFFF; font-family: 'Inter', sans-serif; color: #3D2E2E; }
    .font-display { font-family: 'Cormorant Garamond', Georgia, serif; }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center text-center px-6">
  <div class="max-w-md">
    <h1 class="font-display font-semibold mb-3" style="font-size: 42px; color: #3D2E2E;">Checkout cancelled.</h1>
    <p class="mb-8" style="color: #7A5E5E; font-size: 17px; line-height: 1.7;">No worries — your cart is still saved. Head back whenever you're ready.</p>
    <a href="/" style="display:inline-block; background:#5B4545; color:#fff; font-family:'Cormorant Garamond',serif; font-weight:600; padding: 14px 32px; border-radius:6px; text-decoration:none; font-size:17px; letter-spacing:.02em;">Return to Cart</a>
  </div>
</body>
</html>
```

**Step 3: Commit**
```bash
git add success.html cancel.html
git commit -m "feat: success and cancel pages for Stripe checkout"
```

---

## Task 9: Full End-to-End Test

**Goal:** Confirm the entire flow works with Stripe test cards.

**Step 1: Start the server**
```bash
node server.mjs
```

**Step 2: Test happy path**
1. Open `http://localhost:3000`
2. Add 2–3 items to cart
3. Click cart icon → drawer opens, items + subtotal visible
4. Click Checkout
5. Stripe hosted page loads with correct items + CAD prices
6. Enter test card: `4242 4242 4242 4242`, exp `12/29`, CVC `123`, postal `K1A 0B1`
7. Click Pay → redirects to `http://localhost:3000/success.html`
8. Cart badge resets to 0

**Step 3: Test cancel path**
1. Go through checkout
2. Click back/cancel in Stripe
3. Redirects to `cancel.html` with cart still intact

**Step 4: Test declined card**
Use card `4000 0000 0000 0002` → Stripe shows "Your card was declined."

**Step 5: Commit (if any fixes needed)**
```bash
git add .
git commit -m "fix: e2e checkout test fixes"
```

---

## Summary

| What | Where |
|---|---|
| Product data | `PRODUCTS` array in `index.html` |
| Cart logic | `Cart` module in `index.html` (localStorage) |
| Cart drawer UI | `#cart-drawer` in `index.html` |
| Backend API | `server.mjs` — `POST /api/checkout` |
| Payment | Stripe Checkout (hosted) |
| Post-payment | `success.html` / `cancel.html` |
| Secrets | `.env` (never committed) |

**To run in production:** swap `localhost:3000` URLs in `server.mjs` for your real domain and set `STRIPE_SECRET_KEY` to your live key (`sk_live_...`).
