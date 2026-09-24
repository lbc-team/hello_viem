import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  encodeFunctionData, 
  formatEther, 
  type TransactionReceipt 
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import SimpleDelegateAbi from './abis/SimpleDelegate.json' with { type: 'json' };
import ERC20Abi from './abis/MyERC20.json' with { type: 'json' };
import TokenBankAbi from './abis/TokenBank.json' with { type: 'json' };

// ====== 配置 ======
// alice -> 7702 account
const ALICE_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// bob as relayer
const BOB_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const SIMPLE_DELEGATE_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ERC20_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const TOKENBANK_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

// deposit 参数
const DEPOSIT_AMOUNT = 1000000000000000000n; // 1 token

// 查询指定地址的链上代码
async function getCodeAtAddress(address: string, publicClient: any) {
  const code = await publicClient.getBytecode({ address: address as `0x${string}` });
  console.log(`地址 ${address} 的链上代码:`, code);
  return code;
}

async function getTokenBalance(userAddress: string, publicClient: any, walletClient: any) {
  const eoaTokenBalance = await publicClient.readContract({
    address: ERC20_ADDRESS,
    abi: ERC20Abi,
    functionName: 'balanceOf',
    args: [userAddress],
  });
  console.log(userAddress, ' ERC20余额:', formatEther(eoaTokenBalance));
  return eoaTokenBalance;
}

async function main() {
  const alice = privateKeyToAccount(ALICE_PRIVATE_KEY as `0x${string}`);
  // bob as relay 代替 alice 发送交易
  const bob = privateKeyToAccount(BOB_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(process.env.RPC_URL || 'http://127.0.0.1:8545'),
  });

  const bobWalletClient = createWalletClient({
    account: bob,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  });

  const aliceWalletClient = createWalletClient({
    account: alice,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  });

  // 1. 构造 calldata
  const approveCalldata = encodeFunctionData({
    abi: ERC20Abi,
    functionName: 'approve',
    args: [TOKENBANK_ADDRESS, DEPOSIT_AMOUNT],
  });
  const depositCalldata = encodeFunctionData({
    abi: TokenBankAbi,
    functionName: 'deposit',
    args: [DEPOSIT_AMOUNT],
  });

  // 2. 构造批量 calls
  const calls = [
    {
      to: ERC20_ADDRESS as `0x${string}`,
      data: approveCalldata,
      value: 0n,
    },
    {
      to: TOKENBANK_ADDRESS as `0x${string}`,
      data: depositCalldata,
      value: 0n,
    },
  ];

  // 3. 读取 Alice 当前在 SimpleDelegateContract 中的 nonce (防重放)
  let currentNonce = 0n;
  try {
    currentNonce = await publicClient.readContract({
      address: alice.address,
      abi: SimpleDelegateAbi,
      functionName: 'getNonce',
    }) as bigint;
  } catch {
    currentNonce = 0n;
  }
  console.log('Alice 当前 Nonce:', currentNonce);

  // 4. Alice 对本次批量调用及 Nonce 进行 EIP-712 结构化签名
  const domain = {
    name: 'SimpleDelegateContract',
    version: '1',
    chainId: foundry.id,
    verifyingContract: alice.address,
  } as const;

  const types = {
    Execute: [
      { name: 'calls', type: 'Call[]' },
      { name: 'nonce', type: 'uint256' },
    ],
    Call: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  } as const;

  const signature = await aliceWalletClient.signTypedData({
    account: alice,
    domain,
    types,
    primaryType: 'Execute',
    message: {
      calls,
      nonce: currentNonce,
    },
  });
  console.log('Alice 已完成 EIP-712 授权签名:', signature.slice(0, 20) + '...');

  // 0. 查询 eoa 的链上代码
  const code = await getCodeAtAddress(alice.address, publicClient);

  if (code && code.length > 0) {
    console.log('eoa的链上代码不为空, Bob 调用 executeWithSignature 直接执行');
    const hash = await bobWalletClient.writeContract({
      abi: SimpleDelegateAbi,
      address: alice.address,
      functionName: 'executeWithSignature',
      args: [calls, currentNonce, signature],
    });
    console.log('直接向eoa发送交易, tx hash:', hash);
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败');
  } else {
    // 首次执行：生成 EIP-7702 授权，将 Alice 委托给 SimpleDelegateContract
    const authorization = await aliceWalletClient.signAuthorization({
      account: alice,
      contractAddress: SIMPLE_DELEGATE_ADDRESS,
    });
    console.log('Alice 已签署 EIP-7702 Authorization 凭证');

    // Bob 携带 authorizationList 提交交易并调用 executeWithSignature
    try {
      const hash = await bobWalletClient.writeContract({
        abi: SimpleDelegateAbi,
        address: alice.address,
        functionName: 'executeWithSignature',
        args: [calls, currentNonce, signature],
        authorizationList: [authorization],
      });
      console.log('EIP-7702 批量交易已发送，tx hash:', hash);
      const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败');
    } catch (err) {
      console.error('发送 EIP-7702 交易失败:', err);
    }
  }

  // 检查 bank 下用户的存款数量与余额
  await getTokenBalance(TOKENBANK_ADDRESS, publicClient, bobWalletClient);
  await getTokenBalance(alice.address, publicClient, bobWalletClient);
  await getCodeAtAddress(alice.address, publicClient);
}

main();
