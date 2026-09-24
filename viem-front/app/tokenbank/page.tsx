'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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

declare global {
  interface Window {
    phantom?: {
      ethereum?: any;
      solana?: any;
    };
  }
}

interface EIP6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: any;
}

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
  const [activeProvider, setActiveProvider] = useState<any>(null);
  const [activeWalletName, setActiveWalletName] = useState<string>('');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [injectedProviders, setInjectedProviders] = useState<EIP6963ProviderDetail[]>([]);

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

  // 动态创建公共客户端：优先走当前激活钱包 (activeProvider) 的 custom transport
  const publicClient = useMemo(() => {
    const chain = (chainId && SUPPORTED_CHAINS[chainId]) || sepolia;
    if (activeProvider) {
      return createPublicClient({
        chain,
        transport: custom(activeProvider),
      });
    }
    return createPublicClient({
      chain,
      transport: http(),
    });
  }, [chainId, activeProvider]);

  // 创建钱包客户端
  const [walletClient, setWalletClient] = useState<any>(null);

  // 检测 Phantom Provider
  const getPhantomProvider = () => {
    if (typeof window === 'undefined') return null;
    if (window.phantom?.ethereum) return window.phantom.ethereum;
    if ((window.ethereum as any)?.isPhantom) return window.ethereum;
    const providers = (window.ethereum as any)?.providers;
    if (Array.isArray(providers)) {
      const p = providers.find((item: any) => item.isPhantom);
      if (p) return p;
    }
    const eip6963Phantom = injectedProviders.find(
      (p) => p.info.rdns === 'app.phantom' || p.info.name.toLowerCase().includes('phantom')
    );
    if (eip6963Phantom) return eip6963Phantom.provider;
    return null;
  };

  // 检测 MetaMask Provider
  const getMetaMaskProvider = () => {
    if (typeof window === 'undefined') return null;
    const providers = (window.ethereum as any)?.providers;
    if (Array.isArray(providers)) {
      const mm = providers.find((item: any) => item.isMetaMask && !item.isPhantom);
      if (mm) return mm;
    }
    if ((window.ethereum as any)?.isMetaMask && !(window.ethereum as any)?.isPhantom) {
      return window.ethereum;
    }
    const eip6963MM = injectedProviders.find(
      (p) => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask')
    );
    if (eip6963MM) return eip6963MM.provider;
    if (window.ethereum && !(window.ethereum as any)?.isPhantom) return window.ethereum;
    return null;
  };

  // 监听 EIP-6963 钱包发现
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAnnouncement = (event: any) => {
      if (event?.detail) {
        setInjectedProviders((prev) => {
          if (prev.some((p) => p.info.uuid === event.detail.info.uuid)) return prev;
          return [...prev, event.detail];
        });
      }
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // 尝试根据历史偏好自动重连
    const savedType = localStorage.getItem('tokenbank_wallet_type');
    const timer = setTimeout(() => {
      let p: any = null;
      let name = '';
      if (savedType === 'phantom') {
        p = getPhantomProvider();
        name = 'Phantom';
      } else if (savedType === 'metamask') {
        p = getMetaMaskProvider();
        name = 'MetaMask';
      } else if (savedType) {
        const found = injectedProviders.find((item) => item.info.rdns === savedType);
        if (found) {
          p = found.provider;
          name = found.info.name;
        }
      }

      if (p) {
        p.request({ method: 'eth_accounts' })
          .then((accounts: string[]) => {
            if (accounts && accounts.length > 0) {
              connectWithProvider(p, name, savedType || 'wallet');
            }
          })
          .catch(() => {});
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
    };
  }, []);

  // 绑定当前激活 Provider 的事件监听
  useEffect(() => {
    if (!activeProvider) return;

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
        transport: custom(activeProvider),
      });
      setWalletClient(newClient);
    };

    activeProvider.on?.('accountsChanged', handleAccountsChanged);
    activeProvider.on?.('chainChanged', handleChainChanged);

    return () => {
      activeProvider.removeListener?.('accountsChanged', handleAccountsChanged);
      activeProvider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [activeProvider]);

  // 底层连接逻辑
  const connectWithProvider = async (provider: any, walletName: string, walletTypeKey: string) => {
    try {
      setError('');
      const hexChainId = await provider.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(hexChainId as string, 16);
      setChainId(currentChainId);

      const chain = SUPPORTED_CHAINS[currentChainId] || sepolia;
      const client = createWalletClient({
        chain,
        transport: custom(provider),
      });
      setWalletClient(client);

      const [addr] = await client.requestAddresses();
      setAddress(addr);
      setActiveProvider(provider);
      setActiveWalletName(walletName);
      setIsWalletModalOpen(false);
      localStorage.setItem('tokenbank_wallet_type', walletTypeKey);
    } catch (err: any) {
      console.error('连接钱包错误:', err);
      setError(`连接 ${walletName} 失败: ${err?.message || '用户取消或钱包未解锁'}`);
    }
  };

  // 用户点击指定钱包按钮进行连接
  const handleSelectWallet = (type: 'phantom' | 'metamask' | string, customDetail?: EIP6963ProviderDetail) => {
    if (customDetail) {
      connectWithProvider(customDetail.provider, customDetail.info.name, customDetail.info.rdns);
      return;
    }

    if (type === 'phantom') {
      const p = getPhantomProvider();
      if (!p) {
        setError('未检测到 Phantom 钱包扩展。请先安装 Phantom 钱包或在浏览器扩展中开启。');
        window.open('https://phantom.app/', '_blank');
        return;
      }
      connectWithProvider(p, 'Phantom', 'phantom');
    } else if (type === 'metamask') {
      const p = getMetaMaskProvider();
      if (!p) {
        setError('未检测到 MetaMask 钱包扩展。请先安装 MetaMask 钱包。');
        window.open('https://metamask.io/download/', '_blank');
        return;
      }
      connectWithProvider(p, 'MetaMask', 'metamask');
    }
  };

  // 断开钱包连接状态
  const disconnectWallet = () => {
    setAddress(null);
    setActiveProvider(null);
    setActiveWalletName('');
    localStorage.removeItem('tokenbank_wallet_type');
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

  // 新方式: 利用 EIP-5792 sendCalls 封装 approve 和 deposit 调用 (使用 atomicRequired: true)
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

      // 封装调用: 同时发送 approve 与 deposit 批次 (已配置 forceAtomic: true 对应 atomicRequired: true)
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
          `当前钱包 (${activeWalletName || '当前插件'}) 暂未支持 EIP-5792 (wallet_sendCalls)。如需体验原子批处理，请使用支持 5792 的智能账户钱包；您也可以直接使用下方的传统分步方式操作。`
        );
      } else {
        setError(`sendCalls 错误: ${msg}`);
      }
    } finally {
      setIsBatchLoading(false);
    }
  };

  // 处理普通授权
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
        <Link
          href="/permit"
          className="ml-1 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium px-2 py-0.5 rounded-full transition border border-indigo-200"
        >
          🔑 ERC-7715
        </Link>
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
            {/* 钱包来源标识 (Phantom / MetaMask) */}
            <span className={`flex items-center gap-1 font-sans font-medium px-2 py-0.5 rounded-full text-[11px] ${
              activeWalletName === 'Phantom'
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : 'bg-orange-100 text-orange-800 border border-orange-200'
            }`}>
              {activeWalletName === 'Phantom' ? '👻 Phantom' : '🦊 MetaMask'}
            </span>

            <button
              onClick={copyAddress}
              className="hover:text-blue-600 transition flex items-center gap-1 ml-1"
              title="点击复制完整地址"
            >
              <span>{formatAddress(address)}</span>
              <span className="text-[10px] text-gray-400 font-sans">
                {copied ? '已复制' : '复制'}
              </span>
            </button>

            {/* 切换钱包 */}
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="text-gray-400 hover:text-blue-600 transition font-sans text-xs px-1"
              title="切换钱包"
            >
              🔄
            </button>

            {/* 断开连接 */}
            <button
              onClick={disconnectWallet}
              className="text-gray-400 hover:text-red-500 transition font-sans text-xs px-1"
              title="断开连接"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs text-xs font-medium transition flex items-center gap-1.5"
          >
            <span>连接钱包</span>
          </button>
        )}
      </div>
    </div>
  );

  // 钱包选择弹窗
  const WalletModal = () => {
    if (!isWalletModalOpen) return null;

    const phantomAvailable = !!getPhantomProvider();
    const metaMaskAvailable = !!getMetaMaskProvider();

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">选择连接的钱包</h3>
            <button
              onClick={() => setIsWalletModalOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {/* Phantom 钱包 */}
            <button
              onClick={() => handleSelectWallet('phantom')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition ${
                activeWalletName === 'Phantom'
                  ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-200'
                  : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl">
                  👻
                </span>
                <div className="text-left">
                  <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                    Phantom
                    {activeWalletName === 'Phantom' && (
                      <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.2 rounded font-normal">当前连接</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {phantomAvailable ? '已就绪 (支持以太坊 EVM)' : '未检测到，点击前往官网安装'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-purple-600">
                {phantomAvailable ? '连接 ➔' : '下载 ↗'}
              </span>
            </button>

            {/* MetaMask 钱包 */}
            <button
              onClick={() => handleSelectWallet('metamask')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition ${
                activeWalletName === 'MetaMask'
                  ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-200'
                  : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl">
                  🦊
                </span>
                <div className="text-left">
                  <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                    MetaMask
                    {activeWalletName === 'MetaMask' && (
                      <span className="text-[10px] bg-orange-600 text-white px-1.5 py-0.2 rounded font-normal">当前连接</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {metaMaskAvailable ? '已就绪 (支持 7702 / 5792)' : '未检测到，点击前往官网安装'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-orange-600">
                {metaMaskAvailable ? '连接 ➔' : '下载 ↗'}
              </span>
            </button>

            {/* 其它已检测到的 EIP-6963 钱包 */}
            {injectedProviders
              .filter(
                (p) =>
                  !p.info.name.toLowerCase().includes('phantom') &&
                  !p.info.name.toLowerCase().includes('metamask')
              )
              .map((p) => (
                <button
                  key={p.info.uuid}
                  onClick={() => handleSelectWallet(p.info.name, p)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition"
                >
                  <div className="flex items-center gap-3">
                    {p.info.icon ? (
                      <img src={p.info.icon} alt={p.info.name} className="w-8 h-8 rounded-lg" />
                    ) : (
                      <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-base">
                        💼
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 text-sm">{p.info.name}</span>
                  </div>
                  <span className="text-xs font-medium text-blue-600">连接 ➔</span>
                </button>
              ))}
          </div>

          <div className="mt-5 pt-3 border-t border-gray-100 text-center">
            <span className="text-xs text-gray-400">支持 EIP-6963 多钱包并行共存</span>
          </div>
        </div>
      </div>
    );
  };

  if (!address) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <HeaderNav />

        <div className="text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            🏦
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-900">请连接钱包</h2>
          <p className="text-sm text-gray-500 mb-6">
            支持使用 <b>Phantom</b> 或 <b>MetaMask</b> 连接以查看代币余额并进行存款/取款
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => handleSelectWallet('phantom')}
              className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-4 rounded-xl font-medium transition shadow-xs"
            >
              <span>👻</span>
              <span>Phantom</span>
            </button>
            <button
              onClick={() => handleSelectWallet('metamask')}
              className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2.5 px-4 rounded-xl font-medium transition shadow-xs"
            >
              <span>🦊</span>
              <span>MetaMask</span>
            </button>
          </div>
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
          >
            更多连接选项 / 钱包检测 ➔
          </button>
          {error && <div className="mt-4 text-red-600 text-xs bg-red-50 p-2.5 rounded-lg border border-red-100">{error}</div>}
        </div>

        <WalletModal />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4 sm:px-6 bg-gray-50">
      <HeaderNav />

      <div className="w-full max-w-md space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">账户信息</h2>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              activeWalletName === 'Phantom'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-orange-100 text-orange-800'
            }`}>
              {activeWalletName === 'Phantom' ? '👻 Phantom EVM' : '🦊 MetaMask'}
            </span>
          </div>
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
                  EIP-5792 批处理 (atomicRequired: true)
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

      <WalletModal />
    </div>
  );
}