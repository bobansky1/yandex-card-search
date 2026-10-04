"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Check, CheckCircle2, ChevronsUpDown, CircleAlert, Database, Download, ExternalLink, KeyRound, MapPin, Phone, Search, Settings2, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { categories } from "@/lib/categories";

type Company = { id: string; name: string; address: string; postalCode: string; categories: string[]; phones: string[]; hours: string; coordinates: [number, number] | null; mapsUrl: string };
type SearchResult = { companies: Company[]; scanned: number; totalFound: number; withoutWebsite: number; query: string; usedServerKey: boolean; cached?: boolean; checkedAt?: string };
type CacheState = { searches: Record<string, SearchResult>; companies: Record<string, Company> };
const CACHE_KEY = "netsaita:verified:v1";
const emptyCache = (): CacheState => ({ searches: {}, companies: {} });
const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");

export default function Home() {
  const [city, setCity] = useState("Москва");
  const [category, setCategory] = useState("Кафе");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [limit, setLimit] = useState("50");
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);
  const [cache, setCache] = useState<CacheState>(emptyCache);
  const [cacheReady, setCacheReady] = useState(false);
  const phoneCount = useMemo(() => result?.companies.filter((company) => company.phones.length > 0).length ?? 0, [result]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(CACHE_KEY); if (saved) setCache(JSON.parse(saved) as CacheState); } catch { localStorage.removeItem(CACHE_KEY); }
      setCacheReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function persistCache(next: CacheState) { setCache(next); localStorage.setItem(CACHE_KEY, JSON.stringify(next)); }
  function cacheId() { return `${normalize(city)}::${normalize(category)}::${limit}`; }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!city.trim() || !category.trim()) return toast.error("Укажите город и категорию");
    const saved = cache.searches[cacheId()];
    if (saved) { setResult({ ...saved, cached: true }); setError(""); toast.success("Показаны уже проверенные данные — запрос к API не выполнен"); return; }
    setLoading(true); setError(""); setResult(null); setProgress(18);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + Math.ceil((92 - value) / 4), 92)), 350);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: city.trim(), category: category.trim(), results: Number(limit), apiKey: apiKey.trim() || undefined }) });
      const payload = (await response.json()) as SearchResult & { error?: string; code?: string };
      if (!response.ok) { if (payload.code === "API_KEY_REQUIRED") setKeyDialogOpen(true); throw new Error(payload.error || "Не удалось выполнить поиск"); }
      const checked = { ...payload, checkedAt: new Date().toISOString(), cached: false };
      const nextCompanies = { ...cache.companies };
      checked.companies.forEach((company) => { nextCompanies[company.id] = company; });
      persistCache({ companies: nextCompanies, searches: { ...cache.searches, [cacheId()]: checked } });
      setResult(checked); setProgress(100); toast.success(`Найдено без сайта: ${payload.withoutWebsite}. Результат сохранён.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Неизвестная ошибка"); }
    finally { window.clearInterval(timer); window.setTimeout(() => setProgress(0), 450); setLoading(false); }
  }

  function clearCache() {
    localStorage.removeItem(CACHE_KEY); setCache(emptyCache()); setResult(null); toast.success("Сохранённые проверки удалены");
  }

  function saveKey() {
    const value = keyDraft.trim();
    if (!value) return toast.error("Введите API-ключ");
    setApiKey(value); setKeyDraft(""); setKeyDialogOpen(false); toast.success("Ключ добавлен для текущей вкладки");
  }

  function exportCsv() {
    if (!result?.companies.length) return;
    const rows = [["Название", "Категории", "Адрес", "Индекс", "Телефоны", "Режим работы", "Яндекс Карты"], ...result.companies.map((company) => [company.name, company.categories.join(", "), company.address, company.postalCode, company.phones.join(", "), company.hours, company.mapsUrl])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `companies-without-websites-${city.toLowerCase().replaceAll(" ", "-")}.csv`; anchor.click(); URL.revokeObjectURL(url); toast.success("CSV-файл сформирован");
  }

  return <div className="min-h-screen bg-background text-foreground">
    <Toaster richColors position="bottom-center" />
    <header className="border-b border-border/80 bg-background/90 backdrop-blur-xl"><div className="mx-auto flex h-18 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Building2 className="size-5" /></div><div><div className="text-base font-extrabold tracking-tight">НетСайта</div><div className="text-xs text-muted-foreground">Лиды из Яндекс Карт</div></div></div>
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}><DialogTrigger asChild><Button variant="outline" className="rounded-xl"><KeyRound /><span className="hidden sm:inline">API-ключ</span>{apiKey && <span className="size-2 rounded-full bg-emerald-500" />}</Button></DialogTrigger><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Ключ API Яндекс Карт</DialogTitle><DialogDescription>Нужен ключ продукта «Поиск по организациям». Он используется только для запросов и не сохраняется в браузере.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="api-key">API-ключ</Label><Input id="api-key" type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="Вставьте ключ" autoComplete="off" onKeyDown={(event) => event.key === "Enter" && saveKey()} /></div><Alert className="border-amber-200 bg-amber-50 text-amber-950"><CircleAlert /><AlertTitle>Лицензия важна</AlertTitle><AlertDescription>Возможность сохранять и экспортировать данные определяется вашим тарифом Яндекс Maps API.</AlertDescription></Alert><DialogFooter><Button onClick={saveKey}>Использовать ключ</Button></DialogFooter></DialogContent></Dialog>
    </div></header>
    <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge variant="outline" className="mb-3 rounded-full border-primary/20 bg-primary/5 text-primary"><Sparkles className="size-3.5" /> Официальный API Яндекс Карт</Badge><h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Компании без сайта</h1><p className="mt-2 max-w-2xl text-base text-muted-foreground">Найдите организации в нужном городе, отфильтруйте карточки с сайтом и выгрузите готовый список.</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><span className={`size-2 rounded-full ${apiKey ? "bg-emerald-500" : "bg-amber-400"}`} />{apiKey ? "Ключ готов" : "Нужен API-ключ"}</div></div>
      <form onSubmit={runSearch} className="mb-6 rounded-3xl bg-[linear-gradient(135deg,#123b32,#092923)] p-5 text-white shadow-[0_22px_70px_rgba(10,46,38,.20)] sm:p-7"><div className="mb-5 flex items-center gap-2 text-sm font-semibold text-white/70"><SlidersHorizontal className="size-4" /> Параметры поиска</div><div className="grid gap-4 lg:grid-cols-[1fr_1.15fr_170px_auto] lg:items-end">
        <div className="space-y-2"><Label htmlFor="city" className="text-white/70">Город</Label><div className="relative"><MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input id="city" value={city} onChange={(event) => setCity(event.target.value)} className="h-11 border-white/15 bg-white pl-10 text-slate-950" /></div></div>
        <div className="space-y-2"><Label className="text-white/70">Категория или услуга</Label><Popover open={categoryOpen} onOpenChange={(open) => { setCategoryOpen(open); if (open) setCategorySearch(""); }}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={categoryOpen} className="h-11 w-full justify-between border-white/15 bg-white px-3 font-normal text-slate-950 hover:bg-white">{category || <span className="text-muted-foreground">Выберите категорию</span>}<ChevronsUpDown className="size-4 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command shouldFilter><CommandInput value={categorySearch} onValueChange={setCategorySearch} placeholder="Найти или ввести свою…" onKeyDown={(event) => { if (event.key === "Enter" && categorySearch.trim()) { event.preventDefault(); setCategory(categorySearch.trim()); setCategoryOpen(false); } }} /><CommandList><CommandEmpty><button type="button" className="w-full px-3 py-2 text-left" onClick={() => { setCategory(categorySearch.trim()); setCategoryOpen(false); }}>Использовать «{categorySearch}»</button></CommandEmpty><CommandGroup heading={`Все категории (${categories.length})`}>{categories.map((item) => <CommandItem key={item} value={item} onSelect={() => { setCategory(item); setCategoryOpen(false); }}><Check className={`size-4 ${category === item ? "opacity-100" : "opacity-0"}`} />{item}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover><p className="text-xs text-white/55">Откройте список или начните печатать свою услугу</p></div>
        <div className="space-y-2"><Label className="text-white/70">Проверить карточек</Label><Select value={limit} onValueChange={setLimit}><SelectTrigger className="h-11 w-full border-white/15 bg-white text-slate-950"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem></SelectContent></Select></div>
        <Button disabled={loading} size="lg" className="h-11 rounded-xl bg-[#d8ff52] px-7 font-extrabold text-[#123b32] hover:bg-[#c9ef48]"><Search /> {loading ? "Ищем…" : "Найти"}</Button>
      </div>{loading && <div className="mt-5"><Progress value={progress} className="h-1.5 bg-white/15" /><p className="mt-2 text-xs text-white/60">Получаем карточки и проверяем поле сайта…</p></div>}</form>
      {error && <Alert variant="destructive" className="mb-6 rounded-2xl"><CircleAlert /><AlertTitle>Поиск не выполнен</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <section className="grid gap-3 sm:grid-cols-4"><Metric label="Проверено карточек" value={result?.scanned ?? "—"} /><Metric label="Без сайта" value={result?.withoutWebsite ?? "—"} accent /><Metric label="С телефоном" value={result ? phoneCount : "—"} /><Metric label="Сохранено уникальных" value={cacheReady ? Object.keys(cache.companies).length : "—"} /></section>
      <Card className="mt-6 overflow-hidden rounded-3xl border-border/80 py-0 shadow-sm"><div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-extrabold">Результаты</h2><p className="text-sm text-muted-foreground">{result ? `Запрос «${result.query}» · Яндекс нашёл ${result.totalFound}` : "Запустите поиск, чтобы получить реальные организации"}</p></div><Button variant="outline" onClick={exportCsv} disabled={!result?.companies.length} className="rounded-xl"><Download /> Скачать CSV</Button></div><CardContent className="p-0">
        {result?.cached && <Alert className="m-4 border-emerald-200 bg-emerald-50 text-emerald-950 sm:m-6"><Database /><AlertTitle>Результат из локального хранилища</AlertTitle><AlertDescription>Повторный запрос к Яндексу не выполнялся. Проверено {result.checkedAt ? new Date(result.checkedAt).toLocaleString("ru-RU") : "ранее"}.</AlertDescription></Alert>}
        {!result && !loading && <EmptyState hasKey={Boolean(apiKey)} onKey={() => setKeyDialogOpen(true)} />}
        {result && result.companies.length === 0 && <div className="grid min-h-64 place-items-center px-6 text-center"><div><CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500" /><p className="font-bold">В этой выдаче все компании указали сайт</p><p className="mt-1 text-sm text-muted-foreground">Попробуйте другую категорию или более широкий запрос.</p></div></div>}
        {result && result.companies.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="pl-6">Компания</TableHead><TableHead>Категория</TableHead><TableHead>Телефон</TableHead><TableHead>Режим работы</TableHead><TableHead className="pr-6 text-right">Карточка</TableHead></TableRow></TableHeader><TableBody>{result.companies.map((company) => <TableRow key={company.id} className="cursor-pointer" onClick={() => setSelected(company)}><TableCell className="min-w-72 pl-6"><div className="font-bold">{company.name}</div><div className="mt-1 max-w-md text-sm text-muted-foreground">{company.address}</div></TableCell><TableCell className="min-w-48"><Badge variant="secondary" className="font-medium">{company.categories[0] || "Без категории"}</Badge></TableCell><TableCell className="min-w-44">{company.phones[0] || <span className="text-muted-foreground">Не указан</span>}</TableCell><TableCell className="min-w-48">{company.hours || <span className="text-muted-foreground">Не указан</span>}</TableCell><TableCell className="pr-6 text-right"><Button variant="ghost" size="icon-sm" asChild onClick={(event) => event.stopPropagation()}><a href={company.mapsUrl} target="_blank" rel="noreferrer" aria-label={`Открыть ${company.name} в Яндекс Картах`}><ExternalLink /></a></Button></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent></Card>
      {Object.keys(cache.searches).length > 0 && <div className="mt-4 flex items-center justify-between rounded-2xl border bg-muted/25 px-4 py-3 text-sm"><div className="flex items-center gap-2 text-muted-foreground"><Database className="size-4" /> Сохранено поисков: {Object.keys(cache.searches).length}</div><Button variant="ghost" size="sm" onClick={clearCache}><Trash2 /> Очистить историю</Button></div>}
    </main>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg">{selected && <><SheetHeader className="px-0 pt-6"><Badge className="mb-3 w-fit rounded-full bg-red-50 text-red-700 hover:bg-red-50">Сайт отсутствует</Badge><SheetTitle className="text-2xl font-black tracking-tight">{selected.name}</SheetTitle><SheetDescription>{selected.categories.join(" · ") || "Категория не указана"}</SheetDescription></SheetHeader><div className="mt-8 space-y-3"><Detail icon={<MapPin />} label="Адрес" value={selected.address} /><Detail icon={<Phone />} label="Телефоны" value={selected.phones.join(", ") || "Не указаны"} /><Detail icon={<Settings2 />} label="Режим работы" value={selected.hours || "Не указан"} />{selected.coordinates && <Detail icon={<MapPin />} label="Координаты" value={selected.coordinates.join(", ")} />}</div><Button className="mt-6 w-full rounded-xl" asChild><a href={selected.mapsUrl} target="_blank" rel="noreferrer"><ExternalLink /> Открыть в Яндекс Картах</a></Button></>}</SheetContent></Sheet>
  </div>;
}

function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) { return <Card className={`rounded-2xl py-0 ${accent ? "border-[#d8ff52] bg-[#d8ff52]" : ""}`}><CardContent className="p-5"><div className="text-3xl font-black tracking-tight">{value}</div><div className={`mt-1 text-sm ${accent ? "text-[#24463e]" : "text-muted-foreground"}`}>{label}</div></CardContent></Card>; }
function EmptyState({ hasKey, onKey }: { hasKey: boolean; onKey: () => void }) { return <div className="grid min-h-72 place-items-center px-6 py-12 text-center"><div className="max-w-md"><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/8 text-primary"><Search className="size-5" /></div><h3 className="text-lg font-extrabold">{hasKey ? "Готово к поиску" : "Подключите API Яндекс Карт"}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{hasKey ? "Выберите город и категорию. Мы покажем только карточки, в которых нет сайта." : "MVP использует официальный API поиска организаций — без тестовых и выдуманных данных."}</p>{!hasKey && <Button variant="outline" className="mt-5 rounded-xl" onClick={onKey}><KeyRound /> Добавить ключ</Button>}</div></div>; }
function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3 rounded-2xl border bg-muted/25 p-4"><div className="mt-0.5 text-primary [&_svg]:size-4">{icon}</div><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium leading-6">{value}</div></div></div>; }
