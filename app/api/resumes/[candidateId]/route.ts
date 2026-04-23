import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "../../../lib/db/connection";
import Candidate from "../../../lib/db/models/Candidate";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;

    if (!candidateId) {
      return NextResponse.json({ error: "Candidate ID is required" }, { status: 400 });
    }

    await connectDB();

    const candidate = await Candidate.findById(candidateId);

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (!candidate.resumeData || !candidate.resumeFilename || !candidate.resumeContentType) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    // Return the resume file
    return new NextResponse(new Uint8Array(candidate.resumeData), {
      headers: {
        "Content-Type": candidate.resumeContentType,
        "Content-Disposition": `inline; filename="${candidate.resumeFilename}"`,
      },
    });
  } catch (error) {
    console.error("Error fetching resume:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}