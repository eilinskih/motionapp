import { UploadForm } from '../components/upload-form';

export default function HomePage() {
  return (
    <main>
      <h1>Motion Control Video MVP</h1>
      <p>Upload source photo + driving video, then track generation progress.</p>
      <UploadForm />
    </main>
  );
}
