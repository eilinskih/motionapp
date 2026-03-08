const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export default function ResultPage({ params }: { params: { id: string } }) {
  const src = `${API_BASE}/jobs/${params.id}/result`;

  return (
    <main>
      <h1>Result video</h1>
      <div className="card">
        <video src={src} controls style={{ width: '100%', borderRadius: '8px' }} />
      </div>
    </main>
  );
}
