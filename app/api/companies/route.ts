import { listStoredCompanies } from "@/lib/server/company-store";

export async function GET() {
  try { return Response.json(await listStoredCompanies()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось прочитать базу" }, { status: 500 }); }
}
