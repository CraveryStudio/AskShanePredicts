export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '3rem', letterSpacing: '0.05em', color: '#C9A227', marginBottom: '0.5rem' }}>
        ASP
      </h1>
      <p style={{ fontSize: '1.1rem', color: '#E5E5E5', marginBottom: '2rem' }}>
        AskShanePredicts &mdash; Phase 0 scaffold live.
      </p>
      <p style={{ fontSize: '0.9rem', color: '#8A94A6', maxWidth: 480 }}>
        Kalshi-based prediction intelligence tool. Fed/macro and weather
        tracking coming online in Phase 1.
      </p>
    </main>
  );
}
// trigger redeploy after billing reactivation
