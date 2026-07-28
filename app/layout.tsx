export const metadata = {
  title: 'AskShanePredicts',
  description: 'Personal prediction-market intelligence tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0B1F3A', color: 'white' }}>
        {children}
      </body>
    </html>
  );
}
