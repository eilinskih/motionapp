'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JobRecord, JobStatus } from '@motionapp/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export default function JobPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${params.id}`);
        if (!res.ok) throw new Error('Failed to load job');
        const data = (await res.json()) as JobRecord;
        if (mounted) {
          setJob(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [params.id]);

  return (
    <main>
      <div className="card">
        <h1>Job {params.id}</h1>
        {error && <p>{error}</p>}
        <p>Status: {job?.status ?? 'loading...'}</p>
        {job?.status === JobStatus.COMPLETED && <Link href={`/jobs/${params.id}/result`}>View result video</Link>}
        {job?.status === JobStatus.FAILED && <p>Failed: {job.errorMessage}</p>}
      </div>
      <section>
        <h2>Logs</h2>
        {job?.logs.map((log) => (
          <div className="log" key={`${log.at}-${log.message}`}>
            <strong>{new Date(log.at).toLocaleTimeString()}:</strong> {log.message}
          </div>
        ))}
      </section>
    </main>
  );
}
