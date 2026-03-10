import './globals.css';

export const metadata = {
  title: 'YELO Copilot Platform',
  description: 'Internal AI copilot for yelo-server and frontends'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
