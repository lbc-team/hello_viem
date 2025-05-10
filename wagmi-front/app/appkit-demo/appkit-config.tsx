import { createAppKit } from '@reown/appkit/react'
import { WagmiProvider } from 'wagmi'
import { optimism, mainnet, foundry } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import type { AppKitNetwork } from '@reown/appkit'

// 0. Setup queryClient
const queryClient = new QueryClient()

// 1. Get projectId from https://cloud.reown.com
const projectId = '95e25ba0eac827fb18d92ddd44e6fa67'

// 2. 元数据在在钱包连接界面中显示 - Wallet Connect 扫码时将看到此信息
const metadata = {
  name: 'upchaintest',
  description: 'AppKit Example',
  url: 'https://reown.com/appkit',
  icons: ['https://learnblockchain.cn/image/avatar/412_big.jpg']
}

// 3. Set the networks
const networks: AppKitNetwork[] = [foundry, optimism]

// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
});

// 5. 钱包连接模态框， 在调用 useAppKit 的 open 函数时显示
createAppKit({
  adapters: [wagmiAdapter], // 与 wagmi 框架集成，负责处理底层的钱包连接、网络切换等操作
  networks,
  projectId,
  metadata,
  features: {
    analytics: true
  }
})

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
} 