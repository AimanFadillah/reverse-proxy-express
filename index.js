const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const app = express();
const port = 3000;

app.use(cors());

const proxyMiddleware = createProxyMiddleware({
  target: 'https://zephyronline.com',
  changeOrigin: true,
  pathFilter: '/',
});

app.use(proxyMiddleware);

app.listen(port,() => console.log('zephyronline'));