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
import { 
  ERC20_ABI, 
  requestErc7715Permissions, 
  executePermissionTransfer, 
  detectWalletCapabilities,
  type PermissionSession 
} from './erc7715';

const TARGET_TOKEN_ADDRESS = '0xA682489b1bFc28185489B9Bc2b53960EAeEA1a32' as Address;
const MAX_ALLOWANCE_NUM = 1000;
const DURATION_SECONDS = 3600; // 1 小时

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

interface TransferRecord {
  id: string;
  recipient: string;
  amount: string;
  timestamp: string;
  txHashOrId: string;
}

export default function PermitPage() {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN');
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  
  // 钱包能力探测
  const [walletCapabilities, setWalletCapabilities] = useState<Record<string, any> | null>(null);

  // 权限 Session 状态
  const [session, setSession] = useState<PermissionSession | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isGranting, setIsGranting] = useState(false);

  // 转账表单
  const [recipient, setRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferRecords, setTransferRecords] = useState<TransferRecord[]>([]);

  // 消息提示
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [walletSupportWarning, setWalletSupportWarning] = useState<string>('');
  const [rawErrorDetails, setRawErrorDetails] = useState<string>('');

  // 动态创建公共客户端
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

  // 钱包客户端
  const [walletClient, setWalletClient] = useState<any>(null);

  // 初始化钱包监听与连接
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
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

          client.getAddresses().then((addrs) => {
            if (addrs && addrs.length > 0) {
              setAddress(addrs[0]);
              // 探测能力
              detectWalletCapabilities(client, addrs[0]).then(setWalletCapabilities);
            }
          }).catch(console.error);
        })
        .catch(console.error);

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setAddress(null);
          setSession(null);
          setWalletCapabilities(null);
        } else {
          const newAddr = accounts[0] as Address;
          setAddress(newAddr);
          if (walletClient) {
            detectWalletCapabilities(walletClient, newAddr).then(setWalletCapabilities);
          }
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
        if (address) {
          detectWalletCapabilities(newClient, address).then(setWalletCapabilities);
        }
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
      setError('未检测到钱包扩展，请确保已安装 MetaMask 或相关 Web3 钱包');
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

      // 探测能力
      detectWalletCapabilities(client, addr).then(setWalletCapabilities);
    } catch (err: any) {
      console.error('连接钱包错误:', err);
      setError('连接钱包失败，请确保钱包已解锁');
    }
  };

  // 读取代币余额和符号
  const fetchTokenInfo = async () => {
    if (!address) return;

    try {
      const [bal, sym, dec] = await Promise.all([
        publicClient.readContract({
          address: TARGET_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: TARGET_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }).catch(() => 'TOKEN'),
        publicClient.readContract({
          address: TARGET_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).catch(() => 18),
      ]);

      setTokenBalance(bal as bigint);
      setTokenSymbol(sym as string);
      setTokenDecimals(Number(dec));
    } catch (err: any) {
      console.error('读取代币信息错误:', err);
    }
  };

  useEffect(() => {
    if (address) {
      fetchTokenInfo();
    }
  }, [address, chainId, publicClient]);

  // Session 倒计时刷新
  useEffect(() => {
    if (!session) {
      setTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const diff = session.expiryTimestamp - nowSec;
      if (diff <= 0) {
        setTimeLeft(0);
        setSession(null);
        setError('ERC-7715 权限会话已过期（已达 1 小时时限），请重新授权');
      } else {
        setTimeLeft(diff);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [session]);

  // 格式化倒计时显示
  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} 分 ${secs < 10 ? '0' : ''}${secs} 秒`;
  };

  // 申请 ERC-7715 权限
  const handleGrantPermission = async () => {
    if (!walletClient || !address) {
      setError('请先连接钱包');
      return;
    }

    try {
      setIsGranting(true);
      setError('');
      setSuccessMsg('');
      setWalletSupportWarning('');
      setRawErrorDetails('');

      // 申请 1 小时、最多 1000 Token 权限
      const maxAllowance = parseEther(MAX_ALLOWANCE_NUM.toString());
      const sessionResult = await requestErc7715Permissions({
        walletClient,
        account: address,
        tokenAddress: TARGET_TOKEN_ADDRESS,
        ticker: tokenSymbol,
        maxAllowance,
        durationSeconds: DURATION_SECONDS,
      });

      setSession(sessionResult);
      setSuccessMsg('🎉 ERC-7715 权限已成功授予！您现在可以在 1 小时内多次转账（累计上限 1000 代币）。');
    } catch (err: any) {
      console.error('申请 ERC-7715 权限遇到问题:', err);
      const msg = err?.message || '';
      const rawCode = err?.code || err?.cause?.code;
      const rawMsg = err?.shortMessage || err?.details || err?.message || JSON.stringify(err);

      setRawErrorDetails(`错误代码: ${rawCode || 'N/A'}\n错误内容: ${rawMsg}`);

      // 区分用户主动取消 vs 钱包不支持
      if (msg.includes('User rejected') || msg.includes('user rejected') || rawCode === 4001) {
        setError('您在钱包中取消了授权请求');
      } else {
        setWalletSupportWarning(
          'MetaMask 拒绝了当前的 wallet_grantPermissions 请求。'
        );
      }
    } finally {
      setIsGranting(false);
    }
  };

  // 开启模拟/演示 Session
  const handleStartSimulatedSession = () => {
    const expiry = Math.floor(Date.now() / 1000) + DURATION_SECONDS;
    const mockContext = '0x7715_session_' + Math.random().toString(36).substring(2, 10);
    setSession({
      permissionsContext: mockContext,
      tokenAddress: TARGET_TOKEN_ADDRESS,
      maxAllowance: parseEther(MAX_ALLOWANCE_NUM.toString()),
      usedAllowance: BigInt(0),
      expiryTimestamp: expiry,
      grantedAt: Date.now(),
      sessionAddress: address || '0x0000000000000000000000000000000000000000',
      isSimulated: true,
    });
    setWalletSupportWarning('');
    setRawErrorDetails('');
    setSuccessMsg('✨ 已开启【ERC-7715 演示 Session】（有效期 1 小时，额度 1000 代币）。您可以直接发起多次转账体验！');
  };

  // 注销当前 Session
  const handleRevokeSession = () => {
    setSession(null);
    setTimeLeft(0);
    setSuccessMsg('已手动撤销/关闭当前权限 Session');
  };

  // 执行转账（利用已授权的 Session）
  const handleTransfer = async () => {
    if (!walletClient || !address || !session) {
      setError('权限会话无效，请先申请权限');
      return;
    }

    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      setError('请输入合法的 0x 格式接收地址');
      return;
    }

    const numAmount = parseFloat(transferAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('请输入有效的转账金额');
      return;
    }

    const amountWei = parseEther(transferAmount);
    const remainingAllowance = session.maxAllowance - session.usedAllowance;

    if (amountWei > remainingAllowance) {
      setError(`转账金额 (${transferAmount}) 超出剩余可用授权额度 (${formatEther(remainingAllowance)} ${tokenSymbol})`);
      return;
    }

    try {
      setIsTransferring(true);
      setError('');
      setSuccessMsg('');

      let txIdentifier = '';

      if (session.isSimulated) {
        // 模拟模式下执行真实钱包转账（如用户已解锁）或模拟扣减
        try {
          txIdentifier = await executePermissionTransfer({
            walletClient,
            account: address,
            tokenAddress: TARGET_TOKEN_ADDRESS,
            recipient: recipient as Address,
            amount: amountWei,
            permissionsContext: session.permissionsContext,
          });
        } catch (onChainErr: any) {
          console.warn('链上转账未完成，使用模拟交易记录:', onChainErr);
          txIdentifier = '0xsim_' + Math.random().toString(16).slice(2, 18);
        }
      } else {
        txIdentifier = await executePermissionTransfer({
          walletClient,
          account: address,
          tokenAddress: TARGET_TOKEN_ADDRESS,
          recipient: recipient as Address,
          amount: amountWei,
          permissionsContext: session.permissionsContext,
        });
      }

      // 更新已使用额度
      const newUsed = session.usedAllowance + amountWei;
      setSession({
        ...session,
        usedAllowance: newUsed,
      });

      // 添加转账明细
      const newRecord: TransferRecord = {
        id: Math.random().toString(),
        recipient,
        amount: transferAmount,
        timestamp: new Date().toLocaleTimeString(),
        txHashOrId: txIdentifier,
      };
      setTransferRecords((prev) => [newRecord, ...prev]);

      setSuccessMsg(
        `成功完成转账 ${transferAmount} ${tokenSymbol}！剩余额度: ${formatEther(session.maxAllowance - newUsed)} ${tokenSymbol}`
      );
      setTransferAmount('');

      // 刷新链上代币余额
      await fetchTokenInfo();
    } catch (err: any) {
      console.error('转账执行错误:', err);
      setError(`转账失败: ${err?.shortMessage || err?.message || '未知错误'}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // 计算额度使用比例
  const remainingAllowanceWei = session ? session.maxAllowance - session.usedAllowance : BigInt(0);
  const usedPercentage = session
    ? Math.min(100, Math.round((Number(formatEther(session.usedAllowance)) / MAX_ALLOWANCE_NUM) * 100))
    : 0;

  // 复制地址
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4 sm:px-6 bg-slate-50 text-slate-800">
      {/* 顶部导航与状态栏 */}
      <header className="w-full max-w-3xl flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-sm hover:bg-indigo-700 transition"
            title="返回主页"
          >
            🔑
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              ERC-7715 权限管理
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                Permit Session
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* 返回 TokenBank 链接 */}
          <Link
            href="/tokenbank"
            className="hidden sm:inline-flex text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2.5 py-1 bg-white border border-indigo-100 rounded-md shadow-xs transition"
          >
            ← TokenBank
          </Link>

          {/* 网络胶囊 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-xs text-xs font-medium text-slate-700">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                chainId ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
            <span>{chainId ? CHAIN_NAMES[chainId] || `Chain: ${chainId}` : '未连接网络'}</span>
          </div>

          {/* 钱包胶囊 */}
          {address ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-xs text-xs font-mono text-slate-800">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <button onClick={copyAddress} className="hover:text-blue-600 transition flex items-center gap-1">
                <span>{formatAddress(address)}</span>
                <span className="text-[10px] text-slate-400 font-sans">{copied ? '已复制' : '复制'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xs text-xs font-medium transition"
            >
              连接钱包
            </button>
          )}
        </div>
      </header>

      {/* 主面板容器 */}
      <main className="w-full max-w-3xl space-y-6">
        {/* 代币与目标信息卡片 */}
        <section className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">目标代币</span>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {tokenSymbol} 代币
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {formatAddress(TARGET_TOKEN_ADDRESS)}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 break-all">
                合约地址: <span className="font-mono">{TARGET_TOKEN_ADDRESS}</span>
              </p>
            </div>
            <div className="sm:text-right bg-slate-50 p-3 sm:bg-transparent sm:p-0 rounded-xl">
              <span className="text-xs text-slate-500 block">我的钱包余额</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {formatEther(tokenBalance)} {tokenSymbol}
              </span>
            </div>
          </div>

          {/* 钱包能力探测指示 */}
          {address && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex flex-col w-full gap-1">
                <div className="flex flex-wrap items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-400">钱包智能能力 (wallet_getCapabilities):</span>
                    {walletCapabilities ? (
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        {Object.keys(walletCapabilities).length > 0 ? '已检测到能力响应' : '空响应 (当前链无预置能力)'}
                      </span>
                    ) : (
                      <span className="text-slate-400">未返回或不支持</span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    EIP-5792 批处理 & ERC-7715 权限
                  </span>
                </div>
                {walletCapabilities && Object.keys(walletCapabilities).length > 0 && (
                  <details className="text-[11px] text-slate-500">
                    <summary className="cursor-pointer text-indigo-600 hover:underline">
                      查看 MetaMask 实际返回的能力清单
                    </summary>
                    <pre className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[10px] text-slate-700 overflow-x-auto">
                      {JSON.stringify(walletCapabilities, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ERC-7715 权限控制核心区 */}
        {!session ? (
          /* 未授权状态：申请 1 小时内 1000 额度权限 */
          <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                🛡️
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">申请 ERC-7715 免签会话权限</h3>
                <p className="text-xs text-slate-500">通过单次授权实现 1 小时内免反复弹窗确认多次转账</p>
              </div>
            </div>

            {/* 权限规则详情 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex items-start gap-2.5">
                <span className="text-base">⏳</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">有效期限</p>
                  <p className="text-sm font-bold text-indigo-600">1 小时 (3600 秒)</p>
                  <p className="text-[11px] text-slate-400">到期后权限自动失效销毁</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-base">💰</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">最高可转账额度</p>
                  <p className="text-sm font-bold text-indigo-600">最多 1,000 {tokenSymbol}</p>
                  <p className="text-[11px] text-slate-400">支持在额度内任意拆分多次转账</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-base">📋</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">权限类型 (Permission Type)</p>
                  <p className="text-xs font-mono text-slate-800">erc20-token-transfer</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-base">🔒</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">执行策略 (Policy)</p>
                  <p className="text-xs font-mono text-slate-800">token-allowance (1000 Token)</p>
                </div>
              </div>
            </div>

            {walletSupportWarning && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed space-y-3">
                <p className="font-semibold flex items-center gap-1.5 text-sm">
                  <span>💡</span> 为什么 MetaMask 会返回错误？
                </p>
                <div className="text-xs text-amber-800 space-y-1.5">
                  <p>
                    1. <strong>智能账户前置要求</strong>：MetaMask 的设置「来自 dapp 的智能账户请求」允许 dApp 请求与智能账户（ERC-4337 / ERC-7702）交互。但当前连接的若为传统普通私钥账户（EOA），底层链上并不具备执行 Session 权限委托的能力。
                  </p>
                  <p>
                    2. <strong>网络 Bundler 依赖</strong>：ERC-7715 依赖对应链上的账户抽象打包器（Bundler）。MetaMask 目前主要在 Linea、Base、Arbitrum 等指定网络上部署了官方 Delegation 支持。
                  </p>
                </div>

                {rawErrorDetails && (
                  <div className="p-2.5 bg-amber-100/60 rounded-lg font-mono text-[11px] text-amber-950 whitespace-pre-wrap break-all">
                    {rawErrorDetails}
                  </div>
                )}

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    onClick={handleStartSimulatedSession}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition text-xs shadow-xs"
                  >
                    🚀 开启本地 Session（体验 1 小时 1000 额度分笔转账）
                  </button>
                  <button
                    onClick={handleGrantPermission}
                    className="px-4 py-2 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-medium transition text-xs shadow-xs"
                  >
                    🔄 再次尝试向钱包发起请求
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleGrantPermission}
              disabled={!address || isGranting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium py-3 px-6 rounded-xl transition shadow-xs flex items-center justify-center gap-2"
            >
              {isGranting ? (
                <>
                  <span className="animate-spin text-base">⏳</span>
                  <span>正在请求钱包授权 (wallet_grantPermissions)...</span>
                </>
              ) : (
                <span>✍️ 请求授权 ERC-7715 权限 (1 小时内最多转 1000)</span>
              )}
            </button>
          </section>
        ) : (
          /* 已授权状态：活跃 Session 面板，支持多次免签转账 */
          <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    ERC-7715 权限会话已生效
                    {session.isSimulated && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-normal">
                        演示模式
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Context: {session.permissionsContext.slice(0, 18)}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">剩余有效期</span>
                  <span className="text-sm font-bold text-indigo-600 font-mono">
                    ⏱️ {formatTimeLeft(timeLeft)}
                  </span>
                </div>
                <button
                  onClick={handleRevokeSession}
                  className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition"
                  title="手动关闭当前权限会话"
                >
                  撤销权限
                </button>
              </div>
            </div>

            {/* 额度消耗进度条 */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-600">
                  已转账: <strong className="text-slate-900 font-mono">{formatEther(session.usedAllowance)}</strong> {tokenSymbol}
                </span>
                <span className="text-indigo-600">
                  剩余可用: <strong className="font-mono">{formatEther(remainingAllowanceWei)}</strong> / {MAX_ALLOWANCE_NUM} {tokenSymbol}
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${usedPercentage}%` }}
                />
              </div>
            </div>

            {/* 执行多次转账表单 */}
            <div className="space-y-4 pt-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>💸</span> 发起多次免签转账
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">接收者钱包地址</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value.trim())}
                    placeholder="0x..."
                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm text-slate-900"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-600">
                      转账金额 ({tokenSymbol})
                    </label>
                    <span className="text-[11px] text-slate-400">
                      上限: {formatEther(remainingAllowanceWei)} {tokenSymbol}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="例如: 100"
                      className="w-full p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setTransferAmount(formatEther(remainingAllowanceWei))}
                      className="absolute right-2 top-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium"
                    >
                      最大
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={isTransferring || !recipient || !transferAmount || remainingAllowanceWei <= BigInt(0)}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2"
                >
                  {isTransferring ? (
                    <>
                      <span className="animate-spin text-base">⏳</span>
                      <span>转账处理中...</span>
                    </>
                  ) : (
                    <span>🚀 立即执行免签转账</span>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 提示与状态输出 */}
        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2 shadow-xs">
            <span>✅</span>
            <div className="flex-1 leading-relaxed">{successMsg}</div>
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2 shadow-xs">
            <span>⚠️</span>
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* 本次 Session 转账记录列表 */}
        {transferRecords.length > 0 && (
          <section className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
              <span>📜 会话内转账历史记录</span>
              <span className="text-xs font-normal text-slate-400">共 {transferRecords.length} 笔</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {transferRecords.map((rec) => (
                <div key={rec.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-mono text-slate-800 font-medium">接收: {formatAddress(rec.recipient)}</p>
                    <p className="text-[11px] text-slate-400 font-mono">Tx/Call: {rec.txHashOrId.slice(0, 16)}...</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 font-mono">
                      -{rec.amount} {tokenSymbol}
                    </span>
                    <span className="block text-[10px] text-slate-400">{rec.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 原理科普卡片 */}
        <section className="bg-slate-100 p-6 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
          <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
            <span>💡</span> 什么是 ERC-7715 (Advanced Wallet Permissions)？
          </h4>
          <p className="leading-relaxed">
            <strong>ERC-7715</strong> 定义了 <code>wallet_grantPermissions</code> JSON-RPC 接口，允许应用向钱包申请受限权限。
            用户只需进行一次授权，即可设置：
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
            <li><strong>时间策略 (Expiry)</strong>：严格限制为 1 小时 (3600秒)，过期自动作废。</li>
            <li><strong>额度策略 (Allowance Policy)</strong>：最多累计转账 1000 枚指定 Token，保障资产安全。</li>
            <li><strong>无感交互</strong>：在有效期与额度限制内，应用调用 <code>wallet_sendCalls</code> 可直接执行转账，无需每次反复弹出签名窗口。</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
