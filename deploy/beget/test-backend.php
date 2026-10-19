<?php
declare(strict_types=1);

require __DIR__ . '/private/backend.php';

function check(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
}

$temporary = tempnam(sys_get_temp_dir(), 'yandex-test-');
try {
    check(upstreamDetail('{"message":"Invalid apikey"}', 'test-secret') === 'Invalid apikey', 'Show upstream rejection reason');
    check(upstreamDetail('{"message":"Rejected test-secret"}', 'test-secret') === 'Rejected [скрыто]', 'Redact key from upstream message');
    check(upstreamDetail('{"message":"Rejected key%2Fsecret"}', 'key/secret') === 'Rejected [скрыто]', 'Redact encoded key');
    check(upstreamDetail('<html>error</html>', 'test-secret') === '', 'Ignore non-JSON upstream errors');
    check(upstreamDetail('<?xml version="1.0"?><error><message>Invalid api key</message></error>', 'test-secret') === 'Invalid api key', 'Read XML gateway error');
    check(upstreamDetail('<error><message>Rejected key&amp;secret</message></error>', 'key&secret') === 'Rejected [скрыто]', 'Redact XML-encoded key');
    $db = openStore($temporary);
    $beforeMidnight = new DateTimeImmutable('2026-10-19T20:59:59Z');
    $afterMidnight = new DateTimeImmutable('2026-10-19T21:00:00Z');
    check(dailyUsage($db, $beforeMidnight)['remaining'] === 100, 'Initial daily budget');
    check(dailyUsage($db, $beforeMidnight)['resetsAt'] === '2026-10-20T00:00:00+03:00', 'Moscow reset timestamp');
    check(reserveDailyCards($db, 50, $beforeMidnight)['allowed'], 'First request reserves requested cards');
    $secondConnection = openStore($temporary);
    check(reserveDailyCards($secondConnection, 49, $beforeMidnight)['usage']['used'] === 99, 'Budget shared across connections');
    check(!reserveDailyCards($db, 2, $beforeMidnight)['allowed'], 'Reject request exceeding remaining budget');
    check(dailyUsage($db, $beforeMidnight)['used'] === 99, 'Rejected request does not spend budget');
    check(reserveDailyCards($secondConnection, 1, $beforeMidnight)['allowed'], 'Allow exact final card');
    check(!reserveDailyCards($db, 1, $beforeMidnight)['allowed'], 'Reject all upstream requests at 100');
    check(dailyUsage($db, $afterMidnight)['remaining'] === 100, 'Reset at Moscow midnight independent of UTC date');
    $key = searchKey(' МОСКВА ', 'Ремонт   обуви', 50);
    check($key === searchKey('москва', 'ремонт обуви', 50), 'Russian search normalization');
    check(storedSearch($db, $key) === null, 'Empty cache');
    $payload = ['features' => [
        ['properties' => ['CompanyMetaData' => ['id' => 'fixture-1', 'name' => 'Тестовая мастерская', 'Categories' => [['name' => 'Ремонт обуви']], 'Phones' => [['formatted' => '+7 000 000-00-00']]]]],
        ['properties' => ['CompanyMetaData' => ['id' => 'fixture-2', 'name' => 'С сайтом', 'url' => 'https://example.com']]],
        ['properties' => []],
    ], 'properties' => ['ResponseMetaData' => ['SearchResponse' => ['found' => 72]]]];
    $result = transformResult($payload, 'Ремонт обуви, Москва', false);
    check($result['scanned'] === 3 && $result['totalFound'] === 72, 'Yandex metrics');
    check($result['withoutWebsite'] === 1 && $result['companies'][0]['id'] === 'fixture-1', 'Website filtering');
    $saved = saveSearch($db, $key, 'Москва', 'Ремонт обуви', $result);
    check(storedSearch($db, $key)['cached'] === true, 'Cache survives a second connection');
    check(dailyUsage($db, $beforeMidnight)['used'] === 100, 'Cache reads and saves do not spend daily budget');
    $reopened = openStore($temporary);
    check(storedSearch($reopened, $key)['companies'][0]['name'] === 'Тестовая мастерская', 'Persistent Unicode data');
    saveSearch($reopened, 'second-search', 'Киров', 'Мастерские', $result);
    $company = json_decode($reopened->query('SELECT payload FROM companies')->fetchColumn(), true);
    check($company['cities'] === ['Москва', 'Киров'], 'Merge cities');
    check($company['searchCategories'] === ['Ремонт обуви', 'Мастерские'], 'Merge categories');
    check($company['firstSeenAt'] === $saved['checkedAt'], 'Keep first-seen timestamp');
    check((int)$reopened->query('SELECT COUNT(*) FROM companies')->fetchColumn() === 1, 'Deduplicate company IDs');
    echo "PASS: daily quota, Moscow midnight, shared budget, cache, redaction, filtering, SQLite persistence and deduplication\n";
} finally {
    $reopened = null;
    $secondConnection = null;
    $db = null;
    foreach ([$temporary, $temporary . '-wal', $temporary . '-shm'] as $file) {
        if (is_file($file)) unlink($file);
    }
}
