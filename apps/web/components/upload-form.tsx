'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export function UploadForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to create job');
      }

      const data = (await response.json()) as { id: string };
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Create motion video</h2>
      <label>
        Source photo
        <input type="file" name="source" accept="image/*" required />
      </label>
      <label>
        Driving video
        <input type="file" name="driving" accept="video/*" required />
      </label>
      <button disabled={loading}>{loading ? 'Submitting...' : 'Submit job'}</button>
      {error && <p>{error}</p>}
    </form>
  );
}
