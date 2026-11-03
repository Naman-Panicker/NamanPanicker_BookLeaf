import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import express, { Router } from 'express';
import { buildOpenApiDocument } from './openapi';
import type { RouteSpec } from './routes';

const swaggerUiDir = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

// Absolute URLs, so the page works both directly and through the Next.js rewrite,
// which strips the trailing slash that relative asset URLs would depend on.
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BookLeaf API docs</title>
    <link rel="stylesheet" href="/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/assets/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: '/docs/openapi.json', dom_id: '#swagger-ui' });</script>
  </body>
</html>`;

export function createDocsRouter(specs: RouteSpec[]) {
  const document = buildOpenApiDocument(specs);

  return Router()
    .get('/docs', (_req, res) => {
      res.type('html').send(PAGE);
    })
    .get('/docs/openapi.json', (_req, res) => {
      res.json(document);
    })
    .use('/docs/assets', express.static(swaggerUiDir));
}
