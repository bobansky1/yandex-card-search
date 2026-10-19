# Beget / PHP deployment

This target preserves the React interface and replaces the Next/Vinext API with PHP. Node.js is needed only on the build machine.

Requirements: PHP 8.1+ with cURL, mbstring, PDO and PDO SQLite; Apache with mod_rewrite.

1. Run `npm ci`, then `npm run build:beget`.
2. Upload both directories from `beget-dist/` into the site's directory (for inwedo.ru: `~/yandexsearch/`). `public_html/` is the document root; `private/` must stay outside it.
3. Select PHP 8.3 or newer in the domain settings. Preserve any Beget-generated PHP handler settings when installing `.htaccess`.
4. Check `/api/health`, `/api/companies`, and the search UI.

The first API call creates `private/company-store.sqlite`. API credentials entered through the interface are used for the request and are not persisted. An optional server key can be configured with `YANDEX_MAPS_API_KEY` or ignored `private/config.php` returning `['yandex_api_key' => '...']`. Keep that file out of Git and future deployment archives.

Back up `private/company-store.sqlite` using SQLite's backup command or while writes are paused. Subsequent deployments must preserve the database, optional configuration, and any `-wal`/`-shm` files. The app's company list and search cache are shared by visitors, matching the original app.

To migrate the original JSON store, place `import-store.php` beside `private/` outside the document root and run `php8.3 import-store.php /private/path/company-store.json`. The importer keeps existing SQLite rows and preserves source timestamps. Do not upload the JSON store into `public_html/` or Git.

Run `php deploy/beget/test-backend.php` for isolated SQLite persistence and response transformation tests. It creates and removes a temporary database without calling Yandex. Local preview:

```
php -S 127.0.0.1:5180 -t beget-dist/public_html deploy/beget/preview-router.php
```

`GET /api/health` verifies PHP and SQLite. A real uncached organization search also requires a valid Yandex Organizations Search API key. No test fixtures are deployed or inserted into the live database.
