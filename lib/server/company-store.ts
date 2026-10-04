type Company = { id: string; name: string; address: string; postalCode: string; categories: string[]; phones: string[]; hours: string; coordinates: [number, number] | null; mapsUrl: string };
export type StoredCompany = Company & { cities: string[]; searchCategories: string[]; firstSeenAt: string; lastCheckedAt: string };
type StoredSearch = { result: Record<string, unknown>; checkedAt: string };
type Store = { companies: Record<string, StoredCompany>; searches: Record<string, StoredSearch> };

const emptyStore = (): Store => ({ companies: {}, searches: {} });
const storePath = () => `${process.cwd()}\\data\\company-store.json`;
let writeQueue = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(storePath(), "utf8")) as Store;
  } catch { return emptyStore(); }
}

async function writeStore(store: Store) {
  writeQueue = writeQueue.then(async () => {
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${process.cwd()}\\data`, { recursive: true });
    const temporary = `${storePath()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temporary, storePath());
  });
  await writeQueue;
}

export function searchKey(city: string, category: string, results: number) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  return `${normalize(city)}::${normalize(category)}::${results}`;
}

export async function getStoredSearch(key: string) {
  return (await readStore()).searches[key] ?? null;
}

export async function saveSearch(key: string, city: string, category: string, companies: Company[], result: Record<string, unknown>) {
  const store = await readStore();
  const now = new Date().toISOString();
  for (const company of companies) {
    const previous = store.companies[company.id];
    store.companies[company.id] = {
      ...previous, ...company,
      cities: Array.from(new Set([...(previous?.cities ?? []), city])),
      searchCategories: Array.from(new Set([...(previous?.searchCategories ?? []), category])),
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastCheckedAt: now,
    };
  }
  store.searches[key] = { result: { ...result, checkedAt: now }, checkedAt: now };
  await writeStore(store);
}

export async function listStoredCompanies() {
  const companies = Object.values((await readStore()).companies);
  return { companies, total: companies.length };
}
