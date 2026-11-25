import { prisma } from "@/lib/prisma";
import { attachmentKinds } from "@/lib/operational-fields";
import { OperationalActionForm } from "@/components/operational-action-form";
import { uploadOperationalAttachment } from "@/app/actions/operational-attachments";
export async function OperationalAttachments({
  ownerType,
  ownerId,
  canUpload,
}: {
  ownerType: "RepairCase" | "OperationalProtocol";
  ownerId: string;
  canUpload: boolean;
}) {
  const items =
    ownerType === "OperationalProtocol"
      ? await prisma.operationalProtocolItem.findMany({
          where: { protocolId: ownerId },
          select: { equipmentId: true },
        })
      : [];
  const names = items.length
    ? await prisma.equipmentItem.findMany({
        where: { id: { in: items.map((i) => i.equipmentId) } },
        select: { id: true, name: true },
      })
    : [];
  const files = await prisma.attachment.findMany({
    where: {
      ownerId,
      archivedAt: null,
      OR: [
        { ownerType: { startsWith: ownerType + ":" } },
        ...(ownerType === "OperationalProtocol"
          ? [{ ownerType: { startsWith: "OperationalFollowup:" } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="card">
      <h2>Přílohy a navazující dokumentace</h2>
      <p>
        Fotografie a nahrané PDF se připojí do kompletního PDF protokolu.
        Soubory přidané po vystavení jsou označené jako dodatečná dokumentace;
        původní vystavená verze zůstává beze změny.
      </p>
      {files.map((file) => (
        <p key={file.id}>
          <a href={`/api/prilohy/${file.id}`}>{file.fileName}</a> ·{" "}
          {attachmentKinds[file.ownerType.split(":")[1]]} ·{" "}
          {file.createdAt.toLocaleDateString("cs-CZ")}
          {file.ownerType.startsWith("OperationalFollowup") &&
            " · Dodatečná dokumentace"}
        </p>
      ))}
      {canUpload && (
        <OperationalActionForm action={uploadOperationalAttachment}>
          <input type="hidden" name="ownerType" value={ownerType} />
          <input type="hidden" name="ownerId" value={ownerId} />
          <label className="field">
            Prostředek (volitelné)
            <select name="equipmentId">
              <option value="">Celý dokument / servisní případ</option>
              {items.map((item) => (
                <option key={item.equipmentId} value={item.equipmentId}>
                  {names.find((e) => e.id === item.equipmentId)?.name ??
                    item.equipmentId}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Druh přílohy
            <select name="kind">
              {Object.entries(attachmentKinds).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            PDF nebo fotografie (do 20 MB)
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
          </label>
          <label className="field">
            Fotografie z telefonu
            <input
              name="fileCamera"
              type="file"
              accept="image/*"
              capture="environment"
            />
          </label>
          <button className="button">Nahrát přílohu</button>
        </OperationalActionForm>
      )}
    </section>
  );
}
