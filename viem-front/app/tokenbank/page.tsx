'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseEther, 
  formatEther,
  type Address, 
  custom
} from 'viem';
import { sepolia, foundry, mainnet, type Chain } from 'viem/chains';
import TokenBankABI from '../contracts/TokenBank.json';
import { 
  ERC20_ABI, 
  sendApproveAndDepositCalls, 
  waitForBatchStatus 
} from './sendCalls';

const TOKEN_BANK_ADDRESS = '0x18aBd72cEB1a9b70BE4fA583785330dAE7a1588b' as Address;
const ERC20_TOKEN_ADDRESS = '0xA682489b1bFc28185489B9Bc2b53960EAeEA1a32' as Address;

const SUPPORTED_CHAINS: Record<number, Chain> = {
  11155111: sepolia,
  31337: foundry,
  1: mainnet,
};

const CHAIN_NAMES: Record<number, string> = {
  11155111: 'Sepolia',
  31337: 'Foundry (Local)',
  1: 'Ethereum',
  8453: 'Base',
  84532: 'Base Sepolia',
  42161: 'Arbitrum One',
  10: 'Optimism',
  137: 'Polygon',
};

export default function TokenBankPage() {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [depositBalance, setDepositBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN');
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [callBatchId, setCallBatchId] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 动态创建公共客户端：优先使用 window.ethereum (custom transport)，
  // 这样公共读取操作 (readContract/getBalance) 会直接走钱包当前所连接的网络（如 Sepolia），
  // 不会错误地请求硬编码的本地 127.0.0.1:8545
  const publicClient = useMemo(() => {
    const chain = (chainId && SUPPORTED_CHAINS[chainId]) || sepolia;
    if (typeof window !== 'undefined' && window.ethereum) {
      return createPublicClient({
        chain,
        transport: custom(window.ethereum!)
      });
    }
    return createPublicClient({
      chain,
      transport: http()
    });
  }, [chainId]);

  // 创建钱包客户端
  const [walletClient, setWalletClient] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      // 先获取当前网络 Chain ID
      window.ethereum
        .request({ method: 'eth_chainId' })
        .then((hexChainId: any) => {
          const currentChainId = parseInt(hexChainId, 16);
          setChainId(currentChainId);

          const chain = SUPPORTED_CHAINS[currentChainId] || sepolia;
          const client = createWalletClient({
            chain,
            transport: custom(window.ethereum!)
          });
          setWalletClient(client);

          // 自动检查已连接账户
          client.getAddresses().then((addrs) => {
            if (addrs && addrs.length > 0) {
              setAddress(addrs[0]);
            }
          }).catch(console.error);
        })
        .catch(console.error);

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setAddress(null);
        } else {
          setAddress(accounts[0] as Address);
        }
      };

      const handleChainChanged = (hexChainId: string) => {
        const newChainId = parseInt(hexChainId, 16);
        setChainId(newChainId);
        const chain = SUPPORTED_CHAINS[newChainId] || sepolia;
        const newClient = createWalletClient({
          chain,
          transport: custom(window.ethereum!)
        });
        setWalletClient(newClient);
      };

      window.ethereum.on?.('accountsChanged', handleAccountsChanged);
      window.ethereum.on?.('chainChanged', handleChainChanged);

      return () => {
        window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
        window.ethereum?.removeListener?.('chainChanged', handleChainChanged);
      };
    }
  }, []);

  // 连接钱包
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('未检测到以太坊钱包扩展，请确保已安装 MetaMask');
      return;
    }

    try {
      setError('');
      const hexChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(hexChainId as string, 16);
      setChainId(currentChainId);

      const chain = SUPPORTED_CHAINS[currentChainId] || sepolia;
      const client = createWalletClient({
        chain,
        transport: custom(window.ethereum!)
      });
      setWalletClient(client);

      const [addr] = await client.requestAddresses();
      setAddress(addr);
    } catch (error) {
      console.error('连接钱包错误:', error);
      setError('连接钱包失败，请确保已安装 MetaMask 并解锁');
    }
  };

  // 断开钱包连接状态
  const disconnectWallet = () => {
    setAddress(null);
  };

  // 复制地址
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // 地址简写
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // 读取余额、授权额度和代币 symbol
  const fetchBalances = async () => {
    if (!address) return;

    try {
      const [tokenBal, depositBal, allowanceAmount, symbol] = await Promise.all([
        publicClient.readContract({
          address: ERC20_TOKEN_ADDRESS,
          abi: ERC20_ABI,
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
        }),
        publicClient.readContract({
          address: ERC20_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }).catch((err) => {
          console.warn('获取 token symbol 失败:', err);
          return null;
        }),
      ]);

      setTokenBalance(tokenBal as bigint);
      setDepositBalance(depositBal as bigint);
      setAllowance(allowanceAmount as bigint);
      if (symbol) {
        setTokenSymbol(symbol as string);
      }
    } catch (error: any) {
      console.error('读取余额错误:', error);
      setError(`读取余额失败: ${error?.shortMessage || error?.message || '请检查合约地址与当前网络是否匹配'}`);
    }
  };

  useEffect(() => {
    if (address) {
      fetchBalances();
    }
  }, [address, chainId, publicClient]);

  // 新方式: 利用 EIP-5792 sendCalls 封装 approve 和 deposit 调用
  const handleSendCallsApproveAndDeposit = async () => {
    if (!walletClient || !address || !amount) {
      setError('请先连接钱包并输入有效金额');
      return;
    }

    try {
      setIsBatchLoading(true);
      setError('');
      setSuccessMsg('');
      setCallBatchId('');

      // 封装调用: 同时发送 approve 与 deposit 批次
      const result = await sendApproveAndDepositCalls({
        walletClient,
        account: address,
        tokenAddress: ERC20_TOKEN_ADDRESS,
        bankAddress: TOKEN_BANK_ADDRESS,
        amount,
      });

      setCallBatchId(result.id);
      setSuccessMsg(`sendCalls 批量调用已发送 (批次 ID: ${result.id})，等待执行确认...`);

      // 等待批次调用完成 (wallet_getCallsStatus)
      await waitForBatchStatus(walletClient, result.id);

      setSuccessMsg('批量调用 (Approve + Deposit) 成功完成！');
      await fetchBalances();
    } catch (err: any) {
      console.error('sendCalls 批量调用错误:', err);
      const msg = err?.shortMessage || err?.message || 'sendCalls 批量调用失败';
      if (
        msg.includes('does not support') ||
        msg.includes('wallet_sendCalls') ||
        msg.includes('not supported') ||
        msg.includes('-32601')
      ) {
        setError(
          '当前钱包暂未支持 EIP-5792 (wallet_sendCalls)。提示：标准 MetaMask 需在支持 5792 的版本/智能钱包（如 MetaMask Flask、Coinbase Smart Wallet 或 AA 智能账户）下使用；您也可以使用下方的传统分步方式操作。'
        );
      } else {
        setError(`sendCalls 错误: ${msg}`);
      }
    } finally {
      setIsBatchLoading(false);
    }
  };

  // 处理授权
  const handleApprove = async () => {
    if (!walletClient || !address || !amount) return;

    try {
      setIsLoading(true);
      setError('');
      setSuccessMsg('');

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
      setSuccessMsg('');

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
      setSuccessMsg('');

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

  // 右上角网络和钱包状态栏组件
  const HeaderNav = () => (
    <div className="w-full max-w-2xl flex items-center justify-between mb-8 px-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-sm">
          🏦
        </div>
        <span className="text-xl font-bold text-gray-900 tracking-tight">TokenBank</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* 网络状态 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-xs text-xs font-medium text-gray-700">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              chainId ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
          />
          <span>
            {chainId ? CHAIN_NAMES[chainId] || `Chain ID: ${chainId}` : '未连接网络'}
          </span>
        </div>

        {/* 钱包状态 */}
        {address ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-xs text-xs font-mono text-gray-800">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <button
              onClick={copyAddress}
              className="hover:text-blue-600 transition flex items-center gap-1"
              title="点击复制完整地址"
            >
              <span>{formatAddress(address)}</span>
              <span className="text-[10px] text-gray-400 font-sans">
                {copied ? '已复制' : '复制'}
              </span>
            </button>
            <button
              onClick={disconnectWallet}
              className="ml-1 text-gray-400 hover:text-red-500 transition font-sans text-xs"
              title="断开连接"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs text-xs font-medium transition"
          >
            连接钱包
          </button>
        )}
      </div>
    </div>
  );

  if (!address) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <HeaderNav />

        <div className="text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            🏦
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-900">请连接钱包</h2>
          <p className="text-sm text-gray-500 mb-6">连接钱包以查看代币余额、授权额度并进行存款与取款操作</p>
          <button
            onClick={connectWallet}
            className="w-full bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-sm transition"
          >
            连接钱包
          </button>
          {error && <div className="mt-4 text-red-600 text-xs">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4 sm:px-6 bg-gray-50">
      <HeaderNav />

      <div className="w-full max-w-md space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">账户信息</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p className="flex justify-between">
              <span>ERC20 代币余额:</span>
              <span className="font-semibold text-gray-900">{formatEther(tokenBalance)} {tokenSymbol}</span>
            </p>
            <p className="flex justify-between">
              <span>TokenBank 存款:</span>
              <span className="font-semibold text-gray-900">{formatEther(depositBalance)} {tokenSymbol}</span>
            </p>
            <p className="flex justify-between">
              <span>当前授权额度:</span>
              <span className="font-semibold text-gray-900">{formatEther(allowance)} {tokenSymbol}</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">操作</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">金额 ({tokenSymbol})</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="输入金额"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            {/* 新方式: sendCalls 批量调用 */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-purple-900 text-sm flex items-center gap-1.5">
                  ✨ 新方式: sendCalls
                </span>
                <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                  EIP-5792 批处理
                </span>
              </div>
              <p className="text-xs text-purple-700 mb-3 leading-relaxed">
                封装 <code>approve</code> 和 <code>deposit</code> 两个调用在同一个批次中提交，用户仅需确认一次即可完成授权与存入。
              </p>
              <button
                onClick={handleSendCallsApproveAndDeposit}
                disabled={isLoading || isBatchLoading || !amount}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 font-medium transition shadow-sm"
              >
                {isBatchLoading ? 'sendCalls 批量执行中...' : '一键授权并存款 (sendCalls)'}
              </button>
            </div>

            {/* 传统分步方式 */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2 font-medium">传统方式 (分两步独立调用):</p>
              <div className="flex space-x-2">
                <button
                  onClick={handleApprove}
                  disabled={isLoading || isBatchLoading || !amount}
                  className="flex-1 bg-yellow-500 text-white p-2 rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 text-sm font-medium transition"
                >
                  {isLoading ? '授权中...' : '1. 授权'}
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={isLoading || isBatchLoading || !amount || parseEther(amount) > allowance}
                  className="flex-1 bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm font-medium transition"
                >
                  {isLoading ? '存款中...' : '2. 存款'}
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isLoading || isBatchLoading || !amount}
                  className="flex-1 bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 text-sm font-medium transition"
                >
                  {isLoading ? '取款中...' : '取款'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 状态与提示 */}
        {callBatchId && (
          <div className="bg-purple-50 border border-purple-200 text-purple-900 p-3 rounded-lg text-xs break-all">
            <span className="font-semibold">调用批次 ID: </span>
            {callBatchId}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm text-center">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}