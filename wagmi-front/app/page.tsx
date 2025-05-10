'use client';

import { useState, useEffect } from 'react';
import { 
  useAccount, 
  useConnect, 
  useDisconnect, 
  useChainId, 
  useChains, 
  useReadContract, 
  useWriteContract,
  useClient,
  useBalance
} from 'wagmi';
import { injected } from 'wagmi/connectors';
import Counter_ABI from './contracts/Counter.json';

// Counter 合约地址
const COUNTER_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const chains = useChains();
  const currentChain = chains.find(chain => chain.id === chainId);

  // 使用 useBalance 获取余额
  const { data: balance } = useBalance({
    address,
  });

  // 使用 useReadContract 读取合约数据
  const { data: counterNumber, refetch: refetchCounter } = useReadContract({
    address: COUNTER_ADDRESS as `0x${string}`,
    abi: Counter_ABI,
    functionName: 'number',
  });

  // 使用 useWriteContract 写入合约数据
  const { 
    writeContract,
    isPending,
    data: hash,
    isSuccess,
    isError,
    error
  } = useWriteContract();

  const handleIncrement = () => {
    writeContract({
      address: COUNTER_ADDRESS as `0x${string}`,
      abi: Counter_ABI,
      functionName: 'increment',
    });
  };

  // 监听交易完成状态
  useEffect(() => {
    if (isSuccess) {
      refetchCounter();
    }
  }, [isSuccess, refetchCounter]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Simple Wagmi Demo</h1>
      
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
              <p className="font-mono">
                {balance?.formatted || '0'} {balance?.symbol}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Counter 数值:</p>
              <p className="font-mono">{counterNumber?.toString() || '0'}</p>
              <button
                onClick={handleIncrement}
                disabled={isPending}
                className={`mt-2 w-full py-2 px-4 rounded transition-colors ${
                  isPending 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isPending ? '处理中...' : '增加计数'}
              </button>
              {isPending && (
                <p className="mt-2 text-gray-600">交易正在处理中...</p>
              )}
              {hash && (
                <p className="mt-2 text-blue-500">
                  交易哈希: {hash}
                </p>
              )}
              {isError && (
                <p className="mt-2 text-red-500">
                  错误: {error?.message}
                </p>
              )}
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
