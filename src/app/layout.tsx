import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  let appName = "techPro Modulaciones";
  try {
    const adminClient = createSupabaseAdminClient();
    const { data } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", "app_name")
      .limit(1)
      .maybeSingle();
    if (data?.value) {
      appName = data.value as string;
    }
  } catch {
    // ignore
  }

  return {
    title: appName,
    description: "Gestión logística y modulaciones",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
