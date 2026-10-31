import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const adminModuleRoot = join(__dirname, "..");

async function findControllerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findControllerFiles(path);
    return entry.name.endsWith(".controller.ts") ? [path] : [];
  }));
  return nested.flat();
}

/**
 * This is deliberately a source-level contract as a second line of defence:
 * controllers are registered explicitly in AdminModule, but it is easy to add
 * a new /admin controller and omit a decorator while focusing on its handler.
 * Authorization still happens at runtime in SessionAuthGuard/AdminAuthGuard.
 */
describe("admin route guard contract", () => {
  it("does not allow a newly added /admin controller to bypass session, admin, or permission checks", async () => {
    const files = await findControllerFiles(adminModuleRoot);
    const adminControllers = await Promise.all(files.map(async (file) => ({
      file: relative(adminModuleRoot, file),
      source: await readFile(file, "utf8"),
    })));
    const routed = adminControllers.filter(({ source }) => /@Controller\(\s*["']admin(?:\/|["'])/.test(source));

    // A shrinking set would make this test accidentally pass while skipping
    // controllers, so pin a conservative lower bound as well as the per-file assertions.
    expect(routed.length).toBeGreaterThanOrEqual(30);

    const standardGuardFailures = routed
      .filter(({ file }) => file !== join("auth", "admin-me.controller.ts"))
      .filter(({ source }) => !source.includes("@UseGuards(SessionAuthGuard, AdminAuthGuard)"))
      .map(({ file }) => file);
    expect(standardGuardFailures).toEqual([]);

    const permissionExceptions = new Set([
      join("auth", "admin-me.controller.ts"),
      join("dashboard", "admin-dashboard.controller.ts"),
    ]);
    const permissionFailures = routed
      .filter(({ file }) => !permissionExceptions.has(file))
      .filter(({ source }) => !source.includes("@RequireAdminPermission("))
      .map(({ file }) => file);
    expect(permissionFailures).toEqual([]);

    // /admin/me intentionally returns { isAdmin: false } to ordinary signed-in
    // customers; capabilities adds AdminAuthGuard at the handler. Dashboard is
    // accessible to every active admin, but its service gates every count by
    // permission before querying it. Both exceptions are therefore explicit.
    const adminMe = routed.find(({ file }) => file === join("auth", "admin-me.controller.ts"))?.source ?? "";
    expect(adminMe).toContain('@UseGuards(SessionAuthGuard)');
    expect(adminMe).toContain("@UseGuards(AdminAuthGuard)");

    const dashboard = routed.find(({ file }) => file === join("dashboard", "admin-dashboard.controller.ts"))?.source ?? "";
    expect(dashboard).toContain("@UseGuards(SessionAuthGuard, AdminAuthGuard)");
    const dashboardService = await readFile(join(adminModuleRoot, "dashboard", "admin-dashboard.service.ts"), "utf8");
    expect(dashboardService).toContain("roleHasPermission");
  });
});
