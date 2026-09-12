import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import Navbar from "../components/Navbar";

export const metadata: Metadata = {
  title: "IncidentPulse | Enterprise AI Incident & Operations Management",
  description: "AI-assisted incident lifecycle management, triage, correlation, and response platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased flex flex-col">
        <AuthProvider>
          <Navbar />
          <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
