import { useRateLimit } from 'flowguard/react';

export default function App() {
  const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('demo', {
    max: 5,
    window: '30s',
    onLimit: (result) => alert(`Rate limited! Retry in ${Math.ceil(result.retryAfter / 1000)}s`),
  });

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Flowguard React Demo</h1>
      <p>Allowed: {allowed ? 'Yes' : 'No'}</p>
      <p>Remaining: {remaining}</p>
      {retryAfter > 0 && <p>Retry after: {Math.ceil(retryAfter / 1000)}s</p>}
      <button onClick={() => attempt()} disabled={!allowed}>
        Click me ({remaining} left)
      </button>
      <button onClick={() => reset()} style={{ marginLeft: '1rem' }}>
        Reset
      </button>
    </div>
  );
}
