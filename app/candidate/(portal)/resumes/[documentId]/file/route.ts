import { NextResponse, type NextRequest } from "next/server";

import { getCandidateSession } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

/**
 * Preview / download of one of the signed-in candidate's own résumés. The
 * document must belong to the session candidate (another candidate's id is a
 * 404, indistinguishable from a missing one). Supabase: a 60-second signed URL
 * for the private bucket. `?download=1` asks the browser to save the file.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const session = await getCandidateSession();
  if (!session) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const { documentId } = await ctx.params;
  const file = await getCandidatePortalStore().resumeDownload(session.candidateId, documentId);
  if (!file) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const download = request.nextUrl.searchParams.get("download") === "1";
  if (file.kind === "redirect") {
    const url = new URL(file.url);
    if (download) url.searchParams.set("download", "");
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
  }

  const safeName = file.fileName.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
