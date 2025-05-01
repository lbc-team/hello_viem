'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { useAccount, useConnect, useDisconnect, useChainId, useChains } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function Home() {
  const [balance, setBalance] = useState<string>('0');
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const chains = useChains();
  const currentChain = chains.find(chain => chain.id === chainId);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address) return;
      
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      const balance = await publicClient.getBalance({
        address: address,
      });

      setBalance(formatEther(balance));
    };

    fetchBalance();
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Simple Viem Demo</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
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
