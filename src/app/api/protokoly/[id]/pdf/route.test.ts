import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permissions: vi.fn(),
  document: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/operational-authorization", () => ({
  operationalPermissions: mocks.permissions,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { operationalProtocol: { findFirst: mocks.document } },
}));
vi.mock("@/lib/operational-snapshot", () => ({ operationalSnapshot: vi.fn() }));
vi.mock("@/lib/pdf-fonts", () => ({ pdfFonts: async () => ({}) }));
vi.mock("@/lib/storage", () => ({ getStorage: vi.fn() }));
vi.mock("@/lib/operational-pdf", () => ({
  renderOperationalPdf: async () => ({
    bytes: new Uint8Array([37, 80, 68, 70]),
    hasAppendix: false,
  }),
  operationalPdfFilename: () => "Proudnice_MP-001.pdf",
}));
import { GET } from "./route";
describe("PDF pro tisk a stažení", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "me", organizationId: "org" });
    mocks.permissions.mockResolvedValue(new Set(["protocol:download"]));
    mocks.document.mockResolvedValue({ status: "ISSUED", snapshot: {} });
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
});
