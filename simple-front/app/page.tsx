'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatEther, getContract } from 'viem';
import { foundry } from 'viem/chains';
import { useAccount, useConnect, useDisconnect, useChainId, useChains, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import Counter_ABI from './contracts/Counter.json';

// Counter 合约地址
const COUNTER_ADDRESS = "0x7148E9A2d539A99a66f1bd591E4E20cA35a08eD5";

export default function Home() {
  const [balance, setBalance] = useState<string>('0');
  const [counterNumber, setCounterNumber] = useState<string>('0');
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const chains = useChains();
  const currentChain = chains.find(chain => chain.id === chainId);
  const { data: walletClient } = useWalletClient();

  // 获取 Counter 合约的数值
  const fetchCounterNumber = async () => {
    if (!address) return;
    
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(),
    });

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
    if (!walletClient) return;
    
    try {
      const hash = await walletClient.writeContract({
        address: COUNTER_ADDRESS,
        abi: Counter_ABI,
        functionName: 'increment',
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
      
      const publicClient = createPublicClient({
        chain: foundry,
        transport: http(),
      });

      const balance = await publicClient.getBalance({
        address: address,
      });

      setBalance(formatEther(balance));
    };

    fetchBalance();
    fetchCounterNumber();
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Simple Viem Demo</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        {!isConnected ? (
          <button
            onClick={() => connect({ connector: injected() })}
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
                {currentChain?.name || '未知网络'} (Chain ID: {chainId})
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
              onClick={() => disconnect()}
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
