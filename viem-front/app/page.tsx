'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, createWalletClient, http, formatEther, getContract, custom } from 'viem';
import { foundry } from 'viem/chains';
import Counter_ABI from './contracts/Counter.json';

// Counter 合约地址
const COUNTER_ADDRESS = "0x7148E9A2d539A99a66f1bd591E4E20cA35a08eD5";

export default function Home() {
  const [balance, setBalance] = useState<string>('0');
  const [counterNumber, setCounterNumber] = useState<string>('0');
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState<number | undefined>();

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(),
  });

  // 连接钱包
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('请安装 MetaMask');
      return;
    }

    try {
      const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      
      setAddress(address as `0x${string}`);
      setChainId(Number(chainId));
      setIsConnected(true);

      // 监听账户变化
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setIsConnected(false);
          setAddress(undefined);
        } else {
          setAddress(accounts[0] as `0x${string}`);
        }
      });

      // 监听网络变化
      window.ethereum.on('chainChanged', (chainId: string) => {
        setChainId(Number(chainId));
      });
    } catch (error) {
      console.error('连接钱包失败:', error);
    }
  };

  // 断开连接
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(undefined);
    setChainId(undefined);
  };

  // 获取 Counter 合约的数值
  const fetchCounterNumber = async () => {
    if (!address) return;
    
    const counterContract = getContract({
      address: COUNTER_ADDRESS,
      abi: Counter_ABI,
      client: publicClient,
    });

    const number = await counterContract.read.number();
    setCounterNumber(number.toString());
  };

  // 调用 increment 函数
  const handleIncrement = async () => {
    if (!address) return;
    
    const walletClient = createWalletClient({
      chain: foundry,
      transport: custom(window.ethereum),
    });

    try {
      const hash = await walletClient.writeContract({
        address: COUNTER_ADDRESS,
        abi: Counter_ABI,
        functionName: 'increment',
        account: address,
      });
      console.log('Transaction hash:', hash);
      // 更新数值显示
      fetchCounterNumber();
    } catch (error) {
      console.error('调用 increment 失败:', error);
    }
  };

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address) return;
      
      const balance = await publicClient.getBalance({
        address: address,
      });

      setBalance(formatEther(balance));
    };

    if (address) {
      fetchBalance();
      fetchCounterNumber();
    }
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Simple Viem Demo</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        <div className="mb-4">
          <a
            href="/siwe"
            className="block w-full bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 transition-colors text-center"
          >
            前往 SIWE 登录演示
          </a>
        </div>
        
        {!isConnected ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
          >
            连接 MetaMask
          </button>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600">钱包地址:</p>
              <p className="font-mono break-all">{address}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">当前网络:</p>
              <p className="font-mono">
                {foundry.name} (Chain ID: {chainId})
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">余额:</p>
              <p className="font-mono">{balance} ETH</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Counter 数值:</p>
              <p className="font-mono">{counterNumber}</p>
              <button
                onClick={handleIncrement}
                className="mt-2 w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
              >
                增加计数
              </button>
            </div>
            <button
              onClick={disconnectWallet}
              className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition-colors"
            >
              断开连接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
