import { 
  type Address, 
  type WalletClient, 
  parseEther,
  encodeFunctionData 
} from 'viem';
import { sendCalls, waitForCallsStatus } from 'viem/actions';
import TokenBankABI from '../contracts/TokenBank.json';

// ERC20 标准 ABI (含 approve)
export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface SendApproveAndDepositParams {
  walletClient: WalletClient;
  account: Address;
  tokenAddress: Address;
  bankAddress: Address;
  amount: string | bigint;
}

/**
 * 利用 EIP-5792 sendCalls 批量发送 approve 和 deposit 调用
 * 一次钱包签名/交互完成授权与存入
 */
export async function sendApproveAndDepositCalls({
  walletClient,
  account,
  tokenAddress,
  bankAddress,
  amount,
}: SendApproveAndDepositParams): Promise<{ id: string }> {
  const parsedAmount = typeof amount === 'string' ? parseEther(amount) : amount;

  // 使用 sendCalls (EIP-5792: wallet_sendCalls)
  // forceAtomic: true 对应 EIP-5792 的 atomicRequired: true
  const result = await sendCalls(walletClient, {
    account,
    forceAtomic: true,
    calls: [
      {
        to: tokenAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [bankAddress, parsedAmount],
        }),
      },
      {
        to: bankAddress,
        data: encodeFunctionData({
          abi: TokenBankABI,
          functionName: 'deposit',
          args: [parsedAmount],
        }),
      },
    ],
  });

  return result;
}

/**
 * 等待 sendCalls 批次执行完成
 */
export async function waitForBatchStatus(
  walletClient: WalletClient,
  callId: string
) {
  try {
    return await waitForCallsStatus(walletClient, {
      id: callId,
    });
  } catch (error) {
    console.warn('waitForCallsStatus 警告 (可能钱包未完全实现 getCallsStatus):', error);
    // 降级等待一小段时间，以便区块链节点打包与状态更新
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return null;
  }
}
