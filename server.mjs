import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import 'dotenv/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Server-side product catalog (source of truth for prices — never trust the client)
const PRODUCTS = {
  'walnut-mug':       { name: 'Walnut Turned Mug',      price: 6800  },
  'maple-mug':        { name: 'Maple Grain Mug',         price: 7200  },
  'carved-spoon-set': { name: 'Carved Spoon Set',        price: 4400  },
  'rustic-oak-mug':   { name: 'Rustic Oak Mug',          price: 6400  },
  'walnut-spoon':     { name: 'Serving Spoon — Walnut',  price: 3800  },
  'cherry-mug':       { name: 'Cherry Wood Mug',         price: 7500  },
  'birch-mug':        { name: 'Birch Mug',               price: 5900  },
  'deep-ladle':       { name: 'Deep Ladle',              price: 5200  },
  'ebony-mug':        { name: 'Ebony Mug',               price: 8200  },
  'butter-spreader':  { name: 'Butter Spreader',         price: 2900  },
};

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

async function handleCheckout(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try { parsed = JSON.parse(body); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

  const { items } = parsed;
  if (!Array.isArray(items) || items.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cart is empty' }));
    return;
  }

  // Build line items using server-side prices (never use client-submitted prices)
  const lineItems = items
    .filter(i => i && PRODUCTS[i.id] && Number.isInteger(i.qty) && i.qty > 0)
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
    res.end(JSON.stringify({ error: 'No valid items in cart' }));
    return;
  }

  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${BASE_URL}/cancel.html`,
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: session.url }));
}

const server = createServer(async (req, res) => {
  // CORS headers (dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API route
  if (req.method === 'POST' && req.url === '/api/checkout') {
    try { await handleCheckout(req, res); }
    catch (err) {
      console.error('Checkout error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Static file serving
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = join(__dirname, decodeURIComponent(urlPath));
  const ext = extname(filePath).toLowerCase();
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => console.log(`Cobble server → http://localhost:${PORT}`));
