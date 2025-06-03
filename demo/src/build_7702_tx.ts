import { createPublicClient, createWalletClient, http, encodeFunctionData, getContract, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains'
import { createRequire } from 'module';
import type { TransactionReceipt } from 'viem';


import SimpleDelegateAbi from './abis/SimpleDelegate.json' with { type: 'json' };
import ERC20Abi from './abis/MyERC20.json' with { type: 'json' };
import TokenBankAbi from './abis/TokenBank.json' with { type: 'json' };


// ====== 配置 ======
const ALICE_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const BOB_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const SIMPLE_DELEGATE_ADDRESS = '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0';
const ERC20_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const TOKENBANK_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

// deposit 参数
const DEPOSIT_AMOUNT = 1000000000000000000n; // 1 token




// 查询指定地址的链上代码
async function getCodeAtAddress(address: string, publicClient:any) {
  const code = await publicClient.getBytecode({ address: address as `0x${string}` });
  console.log(`地址 ${address} 的链上代码:`, code);
  return code;
}

async function getTokenBalance(userAddress: string, publicClient:any, walletClient:any) {
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
    const bob  = privateKeyToAccount(BOB_PRIVATE_KEY as `0x${string}`);

    const publicClient = createPublicClient({
        chain: foundry,
        transport: http(process.env.RPC_URL!),
    });

    const walletClient = createWalletClient({
        account: bob,
        chain: foundry,
        transport: http('http://127.0.0.1:8545'),
    } )   


  
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
      to: ERC20_ADDRESS,
      data: approveCalldata,
      value: 0n,
    },
    {
      to: TOKENBANK_ADDRESS,
      data: depositCalldata,
      value: 0n,
    },
  ];


  // 0. 查询eoa的链上代码
  const code =await getCodeAtAddress(alice.address, publicClient);

  if(code && code.length > 0){
    console.log('eoa的链上代码不为空');
    const executeCalldata = encodeFunctionData({
      abi: SimpleDelegateAbi,
      functionName: 'execute',
      args: [calls],
    });

    const hash = await walletClient.sendTransaction({
      to: alice.address,
      data: executeCalldata,
    });
    console.log('直接向eoa发送交易, tx hash:', hash);
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: hash })
    console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败')

  } else {

    // 生成 EIP-7702 授权
    const authorization = await walletClient.signAuthorization({
      account: alice,
      contractAddress: SIMPLE_DELEGATE_ADDRESS,
    });

    // Designate the Contract on the EOA, and invoke the execute function
    // 发送 EIP-7702 交易
    try {
      const hash = await walletClient.writeContract({
        abi: SimpleDelegateAbi,
        address: alice.address,
        functionName: 'execute',
        args: [calls],
        authorizationList: [authorization],
      });
      console.log('EIP-7702 批量交易已发送，tx hash:', hash);
    } catch (err) {
      console.error('发送 EIP-7702 交易失败:', err);
    }
  }

  // 检查bank下用户的存款数量
  await getTokenBalance(TOKENBANK_ADDRESS, publicClient, walletClient);
  await getTokenBalance(alice.address, publicClient, walletClient);
  await getCodeAtAddress(alice.address, publicClient);
}

main();
