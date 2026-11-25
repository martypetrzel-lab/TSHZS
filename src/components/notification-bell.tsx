import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;
  const count = await prisma.operationalNotification.count({
    where: { userId: user.id, readAt: null },
  });
  return (
    <Link
      href="/upozorneni"
      aria-label={`Upozornění: ${count} nepřečtených`}
      className="row-actions"
    >
      <Bell size={21} />
      {count > 0 && <span className="badge danger">{count}</span>}
    </Link>
  );
}
