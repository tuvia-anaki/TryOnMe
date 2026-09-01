import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { findVisitor } from "../lib/visitor.server";
import { storage } from "../lib/storage.server";
import { recoverStuckJobs, shopperErrorMessage } from "../lib/jobs.server";

/**
 * POST /apps/tryon/job  { visitor_token, job_id }
 * Job status polling. Only the visitor who created the job (in this shop)
 * can read it; completed jobs return a short-lived signed image URL.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    void recoverStuckJobs();
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "job",
    });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.visitor_token;
    const jobId = body?.job_id;
    if (typeof token !== "string" || typeof jobId !== "string") {
      return jsonResponse({ message: "Invalid request." }, 400);
    }

    const visitor = await findVisitor(shop.id, token);
    if (!visitor) return jsonResponse({ message: "Not found." }, 404);

    const job = await prisma.tryOn.findFirst({
      where: { id: jobId, shopId: shop.id, visitorId: visitor.id },
    });
    if (!job) return jsonResponse({ message: "Not found." }, 404);

    if (job.status === "completed" && job.generatedImageStorageKey) {
      const resultUrl = await storage().signedUrl(job.generatedImageStorageKey);
      return jsonResponse({ status: "completed", resultUrl });
    }
    if (job.status === "failed") {
      return jsonResponse({
        status: "failed",
        message: shopperErrorMessage(job.errorCode),
      });
    }
    return jsonResponse({ status: job.status });
  } catch (error) {
    return handleProxyError(error);
  }
};
