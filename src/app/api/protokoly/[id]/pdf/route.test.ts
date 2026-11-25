import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permissions: vi.fn(),
  document: vi.fn(),
  attachments: vi.fn(),
  attachment: vi.fn(),
  render: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/operational-authorization", () => ({
  operationalPermissions: mocks.permissions,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    operationalProtocol: { findFirst: mocks.document },
    attachment: {
      findMany: mocks.attachments,
      findFirst: mocks.attachment,
    },
  },
}));
vi.mock("@/lib/operational-snapshot", () => ({ operationalSnapshot: vi.fn() }));
vi.mock("@/lib/pdf-fonts", () => ({ pdfFonts: async () => ({}) }));
vi.mock("@/lib/storage", () => ({ getStorage: vi.fn() }));
vi.mock("@/lib/operational-pdf", () => ({
  renderOperationalPdf: mocks.render,
  mergePdfDocuments: mocks.merge,
  operationalPdfFilename: () => "Proudnice_MP-001.pdf",
}));
import { GET } from "./route";
describe("PDF pro tisk a stažení", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "me", organizationId: "org" });
    mocks.permissions.mockResolvedValue(new Set(["protocol:download"]));
    mocks.document.mockResolvedValue({ status: "ISSUED", snapshot: {} });
    mocks.attachments.mockResolvedValue([]);
    mocks.render.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      hasAppendix: false,
    });
    mocks.merge.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  });
  it.each([
    ["?zobrazeni=tisk", "inline"],
    ["", "attachment"],
  ])("režim %s vrací %s", async (query, disposition) => {
    const response = await GET(
      new Request(`https://example.test/api/protokoly/doc/pdf${query}`),
      { params: Promise.resolve({ id: "doc" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `${disposition}; filename="Proudnice_MP-001.pdf"`,
    );
    expect(mocks.document).toHaveBeenCalledWith({
      where: { id: "doc", organizationId: "org" },
    });
  });
  it("ani tisk neobchází oprávnění", async () => {
    mocks.permissions.mockResolvedValue(new Set());
    const response = await GET(
      new Request("https://example.test/api/protokoly/doc/pdf?zobrazeni=tisk"),
      { params: Promise.resolve({ id: "doc" }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.document).not.toHaveBeenCalled();
  });
  it("běžné stažení připojí přílohu A do stejného PDF", async () => {
    mocks.render
      .mockResolvedValueOnce({
        bytes: new Uint8Array([1]),
        hasAppendix: true,
      })
      .mockResolvedValueOnce({
        bytes: new Uint8Array([2]),
        hasAppendix: true,
      });
    mocks.merge.mockResolvedValue(new Uint8Array([3]));
    const response = await GET(
      new Request("https://example.test/api/protokoly/doc/pdf"),
      { params: Promise.resolve({ id: "doc" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls[1][0]).toMatchObject({ appendix: true });
    expect(mocks.merge).toHaveBeenCalledWith([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
  });
});
