'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, WagmiProvider, createConfig } from 'wagmi';
import { foundry, optimism } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const projectId = '95e25ba0eac827fb18d92ddd44e6fa67';

const config = createConfig({
  chains: [foundry, optimism],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [foundry.id]: http(),
    [optimism.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
} 