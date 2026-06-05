"use client";
import { ThirdwebProvider } from "thirdweb/react";
import { client, mantleSepolia } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
    </ThirdwebProvider>
  );
}
