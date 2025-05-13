'use client';

import { useState, useEffect } from 'react';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseEther, 
  formatEther,
  type Address,
  type Hash,
  custom
} from 'viem';
import { foundry } from 'viem/chains';
import TokenBankABI from '../contracts/TokenBank.json';

// ERC20 标准 ABI
const ERC20_ABI = [
  {
    "constant": false,
    "inputs": [
      {
        "name": "_spender",
        "type": "address"
      },
      {
        "name": "_value",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      },
      {
        "name": "_spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
] as const;

const TOKEN_BANK_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address;
const ERC20_TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;

export default function TokenBankPage() {
  const [address, setAddress] = useState<Address | null>(null);
  const [amount, setAmount] = useState('');
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [depositBalance, setDepositBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // 创建公共客户端
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http()
  });

  // 创建钱包客户端
  const [walletClient, setWalletClient] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const client = createWalletClient({
        chain: foundry,
        transport: custom(window.ethereum)
      });
      setWalletClient(client);
    }
  }, []);

  // 连接钱包
  const connectWallet = async () => {
    if (!walletClient) {
      setError('钱包客户端未初始化，请确保已安装 MetaMask');
      return;
    }

    try {
      setError('');
      const [address] = await walletClient.requestAddresses();
      setAddress(address);
    } catch (error) {
      console.error('连接钱包错误:', error);
      setError('连接钱包失败，请确保已安装 MetaMask 并解锁');
    }
  };

  // 读取余额和授权额度
  const fetchBalances = async () => {
    if (!address) return;

    try {
      const [tokenBal, depositBal, allowanceAmount] = await Promise.all([
        publicClient.readContract({
          address: ERC20_TOKEN_ADDRESS,
          abi: TokenBankABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: TOKEN_BANK_ADDRESS,
          abi: TokenBankABI,
          functionName: 'deposits',
          args: [address],
        }),
        publicClient.readContract({
          address: ERC20_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, TOKEN_BANK_ADDRESS],
        })
      ]);

      setTokenBalance(tokenBal as bigint);
      setDepositBalance(depositBal as bigint);
      setAllowance(allowanceAmount as bigint);
    } catch (error) {
      console.error('读取余额错误:', error);
      setError('读取余额失败');
    }
  };

  useEffect(() => {
    if (address) {
      fetchBalances();
    }
  }, [address]);

  // 处理授权
  const handleApprove = async () => {
    if (!walletClient || !address || !amount) return;

    try {
      setIsLoading(true);
      setError('');

      const hash = await walletClient.writeContract({
        account: address,
        address: ERC20_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TOKEN_BANK_ADDRESS, parseEther(amount)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchBalances();
    } catch (error) {
      console.error('授权错误:', error);
      setError('授权失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!walletClient || !address || !amount) return;

    try {
      setIsLoading(true);
      setError('');

      const hash = await walletClient.writeContract({
        account: address,
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBankABI,
        functionName: 'deposit',
        args: [parseEther(amount)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchBalances();
    } catch (error) {
      console.error('存款错误:', error);
      setError('存款失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !address || !amount) return;

    try {
      setIsLoading(true);
      setError('');

      const hash = await walletClient.writeContract({
        account: address,
        address: TOKEN_BANK_ADDRESS,
        abi: TokenBankABI,
        functionName: 'withdraw',
        args: [parseEther(amount)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchBalances();
    } catch (error) {
      console.error('取款错误:', error);
      setError('取款失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!address) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">请先连接钱包</h1>
        <button
          onClick={connectWallet}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          连接钱包
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">TokenBank</h1>
      
      <div className="w-full max-w-md space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">账户信息</h2>
          <p className="mb-2">ERC20 代币余额: {formatEther(tokenBalance)} S6Token</p>
          <p className="mb-2">TokenBank 存款: {formatEther(depositBalance)} S6Token</p>
          <p className="mb-4">当前授权额度: {formatEther(allowance)} ETH</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">操作</h2>
          <div className="space-y-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="输入金额"
              className="w-full p-2 border rounded"
            />
            <div className="flex space-x-4">
              <button
                onClick={handleApprove}
                disabled={isLoading || !amount}
                className="flex-1 bg-yellow-500 text-white p-2 rounded hover:bg-yellow-600 disabled:bg-gray-400"
              >
                {isLoading ? '授权中...' : '授权'}
              </button>
              <button
                onClick={handleDeposit}
                disabled={isLoading || !amount || parseEther(amount) > allowance}
                className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {isLoading ? '存款中...' : '存款'}
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isLoading || !amount}
                className="flex-1 bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:bg-gray-400"
              >
                {isLoading ? '取款中...' : '取款'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 