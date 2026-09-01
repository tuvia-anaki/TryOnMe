import prisma from "../db.server";

/**
 * Health check for the host's uptime probe (Render `healthCheckPath`).
 * Verifies the process is up AND can reach the database, so a broken
 * DATABASE_URL fails the deploy instead of serving errors to merchants.
 */
export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response("ok", {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("database unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
