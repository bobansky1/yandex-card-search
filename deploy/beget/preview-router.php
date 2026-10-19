<?php
// Local PHP development server only; not part of the deployment archive.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) {
    require dirname(__DIR__, 2) . '/beget-dist/public_html/api.php';
    return true;
}
return false;
