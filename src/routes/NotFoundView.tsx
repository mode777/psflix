import { Link } from 'react-router-dom';

export default function NotFoundView() {
  return (
    <main className="pt-32 px-margin-mobile md:px-margin-desktop text-center">
      <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">404</h1>
      <p className="text-body-lg text-on-surface-variant mt-2">That page doesn't exist.</p>
      <Link to="/" className="inline-block mt-6 px-6 py-2 rounded-lg bg-primary text-on-primary">
        Back to browse
      </Link>
    </main>
  );
}
