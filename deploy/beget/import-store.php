<?php
declare(strict_types=1);

// Run through CLI only. Never include this utility or the JSON export in public_html.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/private/backend.php';

if ($argc !== 2) { fwrite(STDERR, "Usage: php import-store.php /private/path/company-store.json\n"); exit(1); }
$store = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
if (!isset($store['companies'], $store['searches']) || !is_array($store['companies']) || !is_array($store['searches'])) {
    throw new RuntimeException('Invalid source store');
}
$db = openStore();
$db->exec('BEGIN IMMEDIATE');
try {
    // Existing production rows take priority if this import is repeated.
    $saveCompany = $db->prepare('INSERT OR IGNORE INTO companies (id, payload) VALUES (?, ?)');
    foreach ($store['companies'] as $id => $company) {
        $saveCompany->execute([(string)$id, json_encode($company, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
    }
    $saveSearch = $db->prepare('INSERT OR IGNORE INTO searches (search_key, payload, checked_at) VALUES (?, ?, ?)');
    foreach ($store['searches'] as $key => $search) {
        $saveSearch->execute([$key, json_encode($search['result'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $search['checkedAt']]);
    }
    $db->exec('COMMIT');
    echo 'Companies: ' . $db->query('SELECT COUNT(*) FROM companies')->fetchColumn() . "\n";
    echo 'Searches: ' . $db->query('SELECT COUNT(*) FROM searches')->fetchColumn() . "\n";
} catch (Throwable $error) {
    $db->exec('ROLLBACK');
    throw $error;
}
