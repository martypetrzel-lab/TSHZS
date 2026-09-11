import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const params = new URLSearchParams(
    Object.entries(q).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  redirect(`/kontroly?${params}`);
}
