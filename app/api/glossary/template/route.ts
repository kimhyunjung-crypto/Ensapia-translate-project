import { GLOSSARY_CSV_TEMPLATE } from "@/modules/glossary/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(GLOSSARY_CSV_TEMPLATE, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="ensapia-glossary-template.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
