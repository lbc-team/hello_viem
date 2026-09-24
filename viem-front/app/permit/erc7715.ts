import { 
  type Address, 
  type WalletClient, 
  parseEther, 
  encodeFunctionData,
  type Hex
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { grantPermissions } from 'viem/experimental';
import { sendCalls, waitForCallsStatus, getCapabilities } from 'viem/actions';

// ERC20 标准 ABI (含 transfer, balanceOf, symbol, decimals)
export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
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
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface RequestPermissionParams {
  walletClient: WalletClient;
  account: Address;
  tokenAddress: Address;
  ticker?: string;
  maxAllowance: bigint; // 例如 parseEther('1000')
  durationSeconds: number; // 例如 3600 秒 (1 小时)
}

export interface PermissionSession {
  permissionsContext: string;
  tokenAddress: Address;
  maxAllowance: bigint;
  usedAllowance: bigint;
  expiryTimestamp: number; // 秒级时间戳
  grantedAt: number; // 毫秒时间戳
  sessionAddress: Address;
  sessionPrivateKey?: Hex;
  isSimulated?: boolean;
}

/**
 * 探测钱包针对当前账户和网络的能力集 (wallet_getCapabilities)
 */
export async function detectWalletCapabilities(
  walletClient: WalletClient,
  account: Address
): Promise<Record<string, any> | null> {
  try {
    const caps = await getCapabilities(walletClient, { account });
    return caps;
  } catch (err) {
    console.warn('探测 wallet_getCapabilities 失败:', err);
    return null;
  }
}

/**
 * 调用 ERC-7715: wallet_grantPermissions
 * 申请 1 小时内、最多 1000 Token 的多次转账权限
 */
export async function requestErc7715Permissions({
  walletClient,
  account,
  tokenAddress,
  ticker = 'TOKEN',
  maxAllowance,
  durationSeconds,
}: RequestPermissionParams): Promise<PermissionSession> {
  const expiry = Math.floor(Date.now() / 1000) + durationSeconds;

  // 生成本地 Session Key，作为被授权执行转账的 Signer
  const sessionPrivKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivKey);

  try {
    // 调用标准 ERC-7715 wallet_grantPermissions
    const response = await grantPermissions(walletClient, {
      account,
      expiry,
      permissions: [
        {
          type: 'erc20-token-transfer',
          data: {
            address: tokenAddress,
            ticker,
          },
          policies: [
            {
              type: 'token-allowance',
              data: {
                allowance: maxAllowance,
              },
            },
          ],
          required: true,
        },
      ],
    });

    return {
      permissionsContext: response.permissionsContext,
      tokenAddress,
      maxAllowance,
      usedAllowance: BigInt(0),
      expiryTimestamp: response.expiry || expiry,
      grantedAt: Date.now(),
      sessionAddress: sessionAccount.address,
      sessionPrivateKey: sessionPrivKey,
      isSimulated: false,
    };
  } catch (error: any) {
    console.warn('wallet_grantPermissions 原始返回错误:', error);
    throw error;
  }
}

/**
 * 利用 ERC-7715 授予的权限会话执行转账
 * 优先使用 EIP-5792 sendCalls + permissions capabilities
 */
export async function executePermissionTransfer({
  walletClient,
  account,
  tokenAddress,
  recipient,
  amount,
  permissionsContext,
}: {
  walletClient: WalletClient;
  account: Address;
  tokenAddress: Address;
  recipient: Address;
  amount: bigint;
  permissionsContext: string;
}): Promise<string> {
  // 1. 尝试使用带权限上下文的 sendCalls (EIP-5792 + ERC-7715)
  try {
    const result = await sendCalls(walletClient, {
      account,
      capabilities: {
        permissions: {
          context: permissionsContext,
        },
      },
      calls: [
        {
          to: tokenAddress,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [recipient, amount],
          }),
        },
      ],
    });

    try {
      await waitForCallsStatus(walletClient, { id: result.id });
    } catch {
      // 容错处理
    }

    return result.id;
  } catch (err: any) {
    console.warn('sendCalls 带 permissionsContext 失败，回退标准 writeContract:', err);
    // 2. 若钱包对 permissions capabilities 暂未完全就绪，降级使用标准 transfer
    const hash = await (walletClient as any).writeContract({
      account,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient, amount],
      chain: walletClient.chain,
    });
    return hash;
  }
}
