<?php
declare(strict_types=1);

// Data and optional server credentials live above public_html.
require dirname(__DIR__) . '/private/backend.php';
handleRequest();
