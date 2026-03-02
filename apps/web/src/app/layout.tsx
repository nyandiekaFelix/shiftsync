import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/auth-context";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ShiftSync | Staff Scheduling",
  description: "Affordable and powerful staff scheduling for restaurants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0a0a0a] text-white">
        <AuthProvider>
          {children}
          <Toaster theme="dark" position="top-right" closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}
