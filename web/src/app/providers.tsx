"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { mezoTestnet } from "@/lib/mezo";

const config = createConfig({
  chains: [mezoTestnet],
  connectors: [injected()],
  transports: {
    [mezoTestnet.id]: http(
      "https://rpc.test.mezo.org"
    ),
  },
  ssr: true,
});

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient()
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
