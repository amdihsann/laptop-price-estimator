import "./globals.css";


export const metadata = {
  title: "Laptop Prive Estimator",
  description: "ML-powered laptop price prediction using Ridge Regression",
  icons: {
    icon: "/icon.jpg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
