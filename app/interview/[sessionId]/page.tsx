'use client';

import { useParams } from 'next/navigation';
import { InterviewLayout } from '@/components/interview/InterviewLayout';

export default function InterviewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  if (!sessionId) {
    return <div>Loading...</div>;
  }

  return <InterviewLayout sessionId={sessionId} />;
}
