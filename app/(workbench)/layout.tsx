import { AppShell } from "@/components/app-shell";
import { getEnvironmentStatus } from "@/lib/environment";
import { connection } from "next/server";

export default async function WorkbenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();

  return <AppShell environmentStatus={getEnvironmentStatus()}>{children}</AppShell>;
}
