import InterviewRoom from "../../components/InterviewRoom";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <InterviewRoom sessionId={sessionId} />;
}
