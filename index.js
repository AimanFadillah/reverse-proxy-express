const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const app = express();
const port = 3000;

const TARGET = 'https://zephyronline.com';

app.use(cors());

function rewriteToProxy(text, proxyOrigin, proxyHost) {
  return text
    .replaceAll('https://zephyronline.com', proxyOrigin)
    .replaceAll('http://zephyronline.com', proxyOrigin)
    .replaceAll('//zephyronline.com', `//${proxyHost}`)
    .replaceAll('https:\\/\\/zephyronline.com', proxyOrigin.replaceAll('/', '\\/'))
    .replaceAll('http:\\/\\/zephyronline.com', proxyOrigin.replaceAll('/', '\\/'))
    .replaceAll('\\/\\/zephyronline.com', `\\/\\/${proxyHost}`);
}

function getProxyOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

function rewriteCsp(cspValue, proxyOrigin, proxyHost) {
  if (!cspValue) return cspValue;
  return String(cspValue)
    .replaceAll('https://zephyronline.com', proxyOrigin)
    .replaceAll('http://zephyronline.com', proxyOrigin)
    .replaceAll('zephyronline.com', proxyHost);
}

// Streaming proxy — untuk file besar (gambar, video, font, dll)
const proxyStreaming = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  cookieDomainRewrite: '',
  autoRewrite: true,
  on: {
    proxyRes(proxyRes, req, res) {
      const proxyHost = req.headers.host;
      const proxyOrigin = getProxyOrigin(req);
      if (proxyRes.headers['content-security-policy']) {
        proxyRes.headers['content-security-policy'] = rewriteCsp(
          proxyRes.headers['content-security-policy'], proxyOrigin, proxyHost
        );
      }
    },
    error(err, req, res) {
      if (res.headersSent) return;
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Gateway');
    },
  },
});

// Text-rewrite proxy — untuk HTML, JS, CSS, JSON agar URL di dalamnya ikut diganti
const proxyTextRewrite = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  cookieDomainRewrite: '',
  autoRewrite: true,
  selfHandleResponse: true,
  on: {
    proxyReq(proxyReq) {
      proxyReq.setHeader('accept-encoding', 'identity');
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const contentType = String(proxyRes.headers['content-type'] || '');
      const proxyHost = req.headers.host;
      const proxyOrigin = getProxyOrigin(req);

      if (proxyRes.headers['content-security-policy']) {
        proxyRes.headers['content-security-policy'] = rewriteCsp(
          proxyRes.headers['content-security-policy'], proxyOrigin, proxyHost
        );
      }

      res.setHeader('cache-control', 'no-store');

      const isTextual =
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml+xml') ||
        contentType.includes('application/javascript') ||
        contentType.includes('text/javascript') ||
        contentType.includes('text/css') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml') ||
        contentType.includes('text/xml') ||
        contentType.includes('text/plain');

      if (!isTextual) return responseBuffer;

      const text = responseBuffer.toString('utf8');
      return rewriteToProxy(text, proxyOrigin, proxyHost);
    }),
    error(err, req, res) {
      if (res.headersSent) return;
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Gateway');
    },
  },
});

function shouldRewrite(req) {
  const url = String(req.originalUrl || req.url || '');
  const accept = String(req.headers.accept || '');
  const fetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();

  if (['document', 'iframe', 'script', 'style'].includes(fetchDest)) return true;
  if (accept.includes('text/html')) return true;
  return /\.(?:html?|js|css|json|xml|txt)(?:\?|#|$)/i.test(url);
}

app.use((req, res, next) => {
  if (shouldRewrite(req)) return proxyTextRewrite(req, res, next);
  return proxyStreaming(req, res, next);
});

app.listen(port, () => console.log(`zephyronline proxy at http://localhost:${port}`));
