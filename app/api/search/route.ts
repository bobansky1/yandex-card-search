type SearchBody = { city?: string; category?: string; results?: number; apiKey?: string };
type YandexCompany = { id?: string; name?: string; address?: string; url?: string; Address?: { formatted?: string; postal_code?: string }; Categories?: Array<{ name?: string }>; Phones?: Array<{ formatted?: string }>; Hours?: { text?: string } };
type YandexFeature = { properties?: { CompanyMetaData?: YandexCompany }; geometry?: { coordinates?: [number, number] } };
type YandexResponse = { features?: YandexFeature[]; properties?: { ResponseMetaData?: { SearchResponse?: { found?: number } } }; message?: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchBody;
    const city = body.city?.trim() ?? "";
    const category = body.category?.trim() ?? "";
    const results = Math.min(Math.max(Number(body.results) || 50, 1), 50);
    const runtimeEnv = await getRuntimeEnv();
    const apiKey = runtimeEnv.YANDEX_MAPS_API_KEY || body.apiKey?.trim();
    if (!city || !category) return Response.json({ error: "Укажите город и категорию" }, { status: 400 });
    if (!apiKey) return Response.json({ error: "Добавьте ключ продукта «Поиск по организациям»", code: "API_KEY_REQUIRED" }, { status: 401 });

    const query = `${category}, ${city}`;
    const url = new URL("https://search-maps.yandex.ru/v1/");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("text", query);
    url.searchParams.set("type", "biz");
    url.searchParams.set("lang", "ru_RU");
    url.searchParams.set("results", String(results));
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const raw = await response.text();
    let payload: YandexResponse = {};
    try {
      payload = JSON.parse(raw) as YandexResponse;
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const message = response.status === 403
        ? "Яндекс отклонил API-ключ. Проверьте, что подключён продукт «Поиск по организациям»."
        : response.status === 429
          ? "Превышен лимит запросов Яндекс API. Повторите позже."
          : payload.message || `Яндекс API вернул ошибку ${response.status}`;
      return Response.json({ error: message, code: `YANDEX_${response.status}` }, { status: response.status });
    }
    if (!raw.trim().startsWith("{")) {
      return Response.json({ error: "Яндекс API вернул ответ неизвестного формата" }, { status: 502 });
    }
    const features = payload.features ?? [];
    const companies = features.flatMap((feature) => {
      const company = feature.properties?.CompanyMetaData;
      if (!company || company.url?.trim()) return [];
      const id = company.id || crypto.randomUUID();
      return [{ id, name: company.name || "Без названия", address: company.Address?.formatted || company.address || "Адрес не указан", postalCode: company.Address?.postal_code || "", categories: (company.Categories ?? []).flatMap((item) => item.name ? [item.name] : []), phones: (company.Phones ?? []).flatMap((item) => item.formatted ? [item.formatted] : []), hours: company.Hours?.text || "", coordinates: feature.geometry?.coordinates ?? null, mapsUrl: `https://yandex.ru/maps/org/${encodeURIComponent(id)}/` }];
    });
    return Response.json({ companies, scanned: features.length, totalFound: payload.properties?.ResponseMetaData?.SearchResponse?.found ?? features.length, withoutWebsite: companies.length, query, usedServerKey: Boolean(runtimeEnv.YANDEX_MAPS_API_KEY) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось обработать запрос" }, { status: 500 });
  }
}

async function getRuntimeEnv(): Promise<Record<string, string | undefined>> {
  try {
    const specifier = "cloudflare:" + "workers";
    const workers = await import(/* @vite-ignore */ specifier) as { env?: Record<string, string | undefined> };
    return workers.env ?? {};
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}
