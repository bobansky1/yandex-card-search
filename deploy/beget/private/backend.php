<?php
declare(strict_types=1);

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function openStore(?string $path = null): PDO
{
    $path ??= __DIR__ . '/company-store.sqlite';
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout = 10000');
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS searches (search_key TEXT PRIMARY KEY, payload TEXT NOT NULL, checked_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS daily_usage (usage_date TEXT PRIMARY KEY, cards INTEGER NOT NULL CHECK(cards >= 0 AND cards <= 100))');
    return $db;
}

function dailyUsage(PDO $db, ?DateTimeImmutable $now = null): array
{
    $now = ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone('Europe/Moscow'));
    $date = $now->format('Y-m-d');
    $query = $db->prepare('SELECT cards FROM daily_usage WHERE usage_date = ?');
    $query->execute([$date]);
    $used = (int)($query->fetchColumn() ?: 0);
    return ['date' => $date, 'limit' => 100, 'used' => $used, 'remaining' => max(0, 100 - $used),
        'resetsAt' => $now->modify('tomorrow')->setTime(0, 0)->format(DateTimeInterface::ATOM),
        'timezone' => 'Europe/Moscow'];
}

function reserveDailyCards(PDO $db, int $cards, ?DateTimeImmutable $now = null): array
{
    if ($cards < 1 || $cards > 50) throw new InvalidArgumentException('Expected 1 to 50 cards');
    $db->exec('BEGIN IMMEDIATE');
    try {
        $usage = dailyUsage($db, $now);
        if ($cards > $usage['remaining']) {
            $db->exec('COMMIT');
            return ['allowed' => false, 'usage' => $usage];
        }
        $query = $db->prepare('INSERT INTO daily_usage (usage_date, cards) VALUES (?, ?) ON CONFLICT(usage_date) DO UPDATE SET cards = daily_usage.cards + excluded.cards');
        $query->execute([$usage['date'], $cards]);
        $usage['used'] += $cards;
        $usage['remaining'] -= $cards;
        $db->exec('COMMIT');
        return ['allowed' => true, 'usage' => $usage];
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}

function searchKey(string $city, string $category, int $results): string
{
    $normalize = static fn(string $value): string => preg_replace('/\s+/u', ' ', mb_strtolower(trim($value), 'UTF-8'));
    return $normalize($city) . '::' . $normalize($category) . '::' . $results;
}

function storedSearch(PDO $db, string $key): ?array
{
    $query = $db->prepare('SELECT payload, checked_at FROM searches WHERE search_key = ?');
    $query->execute([$key]);
    $row = $query->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    return array_merge(json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR), [
        'cached' => true, 'checkedAt' => $row['checked_at'],
    ]);
}

function transformResult(array $payload, string $query, bool $usedServerKey): array
{
    $features = $payload['features'] ?? [];
    if (!is_array($features)) throw new RuntimeException('Invalid Yandex response');
    $companies = [];
    foreach ($features as $feature) {
        $company = $feature['properties']['CompanyMetaData'] ?? null;
        if (!is_array($company) || trim((string)($company['url'] ?? '')) !== '') continue;
        $id = (string)($company['id'] ?? '');
        if ($id === '') $id = hash('sha256', json_encode($company, JSON_THROW_ON_ERROR));
        $categories = array_values(array_filter(array_column($company['Categories'] ?? [], 'name'), 'is_string'));
        $phones = array_values(array_filter(array_column($company['Phones'] ?? [], 'formatted'), 'is_string'));
        $companies[] = [
            'id' => $id,
            'name' => $company['name'] ?? 'Без названия',
            'address' => $company['Address']['formatted'] ?? $company['address'] ?? 'Адрес не указан',
            'postalCode' => $company['Address']['postal_code'] ?? '',
            'categories' => $categories,
            'phones' => $phones,
            'hours' => $company['Hours']['text'] ?? '',
            'coordinates' => $feature['geometry']['coordinates'] ?? null,
            'mapsUrl' => 'https://yandex.ru/maps/org/' . rawurlencode($id) . '/',
        ];
    }
    return [
        'companies' => $companies, 'scanned' => count($features),
        'totalFound' => $payload['properties']['ResponseMetaData']['SearchResponse']['found'] ?? count($features),
        'withoutWebsite' => count($companies), 'query' => $query,
        'usedServerKey' => $usedServerKey, 'cached' => false,
    ];
}

function saveSearch(PDO $db, string $key, string $city, string $category, array $result): array
{
    $now = gmdate('Y-m-d\TH:i:s.000\Z');
    $db->exec('BEGIN IMMEDIATE');
    try {
        $find = $db->prepare('SELECT payload FROM companies WHERE id = ?');
        $save = $db->prepare('INSERT INTO companies (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload');
        foreach ($result['companies'] as $company) {
            $find->execute([$company['id']]);
            $oldJson = $find->fetchColumn();
            $previous = $oldJson === false ? [] : json_decode($oldJson, true, 512, JSON_THROW_ON_ERROR);
            $stored = array_merge($company, [
                'cities' => array_values(array_unique(array_merge($previous['cities'] ?? [], [$city]))),
                'searchCategories' => array_values(array_unique(array_merge($previous['searchCategories'] ?? [], [$category]))),
                'firstSeenAt' => $previous['firstSeenAt'] ?? $now,
                'lastCheckedAt' => $now,
            ]);
            $save->execute([$company['id'], json_encode($stored, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
        $result['checkedAt'] = $now;
        $query = $db->prepare('INSERT INTO searches (search_key, payload, checked_at) VALUES (?, ?, ?) ON CONFLICT(search_key) DO UPDATE SET payload = excluded.payload, checked_at = excluded.checked_at');
        $query->execute([$key, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $now]);
        $db->exec('COMMIT');
        return $result;
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}

function upstreamDetail(string $response, string $apiKey): string
{
    $payload = json_decode($response, true);
    $message = is_array($payload) ? ($payload['message'] ?? $payload['error'] ?? '') : '';
    // Yandex's gateway can return XML on auth failures even with Accept: application/json.
    // Read only the message text; do not resolve XML entities or external resources.
    if ($message === '' && preg_match('~<message>(.*?)</message>~si', $response, $match)) {
        $message = html_entity_decode(strip_tags($match[1]), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
    if (!is_string($message)) return '';
    // Upstream errors may echo request parameters. Never return the credential.
    if ($apiKey !== '') {
        $message = str_replace(array_unique([$apiKey, rawurlencode($apiKey), urlencode($apiKey)]), '[скрыто]', $message);
    }
    $message = preg_replace('/[\x00-\x1F\x7F]/u', ' ', strip_tags($message)) ?? '';
    return mb_substr(trim($message), 0, 250);
}

function handleRequest(): never
{
    ini_set('display_errors', '0');
    try {
        $path = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $allowed = ['/api/health' => 'GET', '/api/companies' => 'GET', '/api/usage' => 'GET', '/api/search' => 'POST'];
        if (!isset($allowed[$path])) jsonResponse(['error' => 'Не найдено'], 404);
        if ($method !== $allowed[$path]) {
            header('Allow: ' . $allowed[$path]);
            jsonResponse(['error' => 'Метод не поддерживается'], 405);
        }
        $db = openStore();
        if ($path === '/api/health') jsonResponse(['ok' => true, 'backend' => 'php', 'database' => 'sqlite']);
        if ($path === '/api/usage') jsonResponse(dailyUsage($db));
        if ($path === '/api/companies') {
            $companies = [];
            foreach ($db->query('SELECT payload FROM companies ORDER BY rowid') as $row) {
                $companies[] = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
            }
            jsonResponse(['companies' => $companies, 'total' => count($companies)]);
        }
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) jsonResponse(['error' => 'Слишком большой запрос'], 413);
        $raw = file_get_contents('php://input', false, null, 0, 16385);
        if ($raw === false || strlen($raw) > 16384) jsonResponse(['error' => 'Слишком большой запрос'], 413);
        try { $body = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
        catch (JsonException) { jsonResponse(['error' => 'Некорректный JSON'], 400); }
        if (!is_array($body)) jsonResponse(['error' => 'Некорректный запрос'], 400);
        foreach (['city', 'category', 'apiKey'] as $field) {
            if (isset($body[$field]) && !is_string($body[$field])) jsonResponse(['error' => 'Некорректный запрос'], 400);
        }
        $city = trim($body['city'] ?? '');
        $category = trim($body['category'] ?? '');
        if ($city === '' || $category === '') jsonResponse(['error' => 'Укажите город и категорию'], 400);
        if (mb_strlen($city) > 250 || mb_strlen($category) > 250) jsonResponse(['error' => 'Слишком длинное название города или категории'], 400);
        if (isset($body['results']) && !is_scalar($body['results'])) jsonResponse(['error' => 'Некорректный лимит'], 400);
        $results = min(max((int)($body['results'] ?? 50) ?: 50, 1), 50);
        $key = searchKey($city, $category, $results);
        $stored = storedSearch($db, $key);
        if ($stored !== null) jsonResponse($stored);
        $configPath = __DIR__ . '/config.php';
        $config = is_file($configPath) ? require $configPath : [];
        $serverKey = trim((string)(getenv('YANDEX_MAPS_API_KEY') ?: ($config['yandex_api_key'] ?? '')));
        $apiKey = $serverKey !== '' ? $serverKey : trim($body['apiKey'] ?? '');
        if ($apiKey === '') jsonResponse(['error' => 'Добавьте ключ продукта «Поиск по организациям»', 'code' => 'API_KEY_REQUIRED'], 401);
        $query = $category . ', ' . $city;
        $url = 'https://search-maps.yandex.ru/v1/?' . http_build_query([
            'apikey' => $apiKey, 'text' => $query, 'type' => 'biz', 'lang' => 'ru_RU', 'results' => $results,
        ], '', '&', PHP_QUERY_RFC3986);
        $curl = curl_init($url);
        $headers = ['Accept: application/json'];
        // Use the real request host, never a user-supplied referrer destination.
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if (preg_match('/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/D', $host)) {
            $scheme = ($_SERVER['HTTPS'] ?? '') === 'on' ? 'https' : 'http';
            $headers[] = 'Referer: ' . $scheme . '://' . $host . '/';
        }
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 35,
            CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        // Reserve before any upstream request, under a SQLite write lock shared by all visitors.
        // Keep the reservation on errors: the upstream may already have counted the request.
        $reservation = reserveDailyCards($db, $results);
        if (!$reservation['allowed']) {
            curl_close($curl);
            $usage = $reservation['usage'];
            jsonResponse([
                'error' => 'Дневной лимит — 100 карточек. Осталось на сегодня: ' . $usage['remaining'] . '. Уменьшите количество карточек или повторите после 00:00 по Москве. Сохранённые поиски доступны без ограничений.',
                'code' => 'DAILY_LIMIT_EXCEEDED', 'usage' => $usage,
            ], 429);
        }
        $response = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        if ($response === false || $status === 0) {
            curl_close($curl);
            jsonResponse(['error' => 'Не удалось связаться с Яндекс API. Повторите позже.'], 502);
        }
        curl_close($curl);
        if ($status < 200 || $status >= 300) {
            $message = match ($status) {
                403 => 'Яндекс отклонил доступ (403). Проверьте привязку ключа к API Поиска по организациям, статус продукта и ограничения по домену/IP.',
                429 => 'Превышен лимит запросов Яндекс API. Повторите позже.',
                default => 'Яндекс API вернул ошибку ' . $status,
            };
            $detail = upstreamDetail($response, $apiKey);
            if ($detail !== '') $message .= ' Ответ Яндекса: ' . $detail;
            jsonResponse(['error' => $message, 'code' => 'YANDEX_' . $status], $status >= 400 && $status <= 599 ? $status : 502);
        }
        try { $payload = json_decode($response, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { jsonResponse(['error' => 'Яндекс API вернул ответ неизвестного формата'], 502); }
        if (!is_array($payload)) jsonResponse(['error' => 'Яндекс API вернул ответ неизвестного формата'], 502);
        $result = transformResult($payload, $query, $serverKey !== '');
        jsonResponse(saveSearch($db, $key, $city, $category, $result));
    } catch (Throwable) {
        jsonResponse(['error' => 'Не удалось обработать запрос. Повторите позже.'], 500);
    }
}
