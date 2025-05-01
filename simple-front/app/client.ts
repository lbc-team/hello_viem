import { createWalletClient, custom } from 'viem'
import { mainnet, foundry } from 'viem/chains'
 
export const walletClient = createWalletClient({
  chain: foundry,
  transport: custom(window.ethereum!),
})