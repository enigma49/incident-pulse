import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { SocketProvider } from "../context/SocketContext";
import Navbar from "../components/Navbar";
import AppShell from "../components/AppShell";

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
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased flex flex-col">
        <AuthProvider>
          <SocketProvider>
            <Navbar />
            <AppShell>{children}</AppShell>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
