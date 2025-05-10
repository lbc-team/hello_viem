'use client';

import { useState } from 'react';
import { createSiweMessage, verifySiweMessage } from 'viem/siwe';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { mainnet } from 'viem/chains';

// 添加 window.ethereum 的类型定义
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (params: any) => void) => void;
      removeListener: (event: string, callback: (params: any) => void) => void;
    };
  }
}

export default function SiwePage() {
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string>('');

  // 创建公共客户端
  const publicClient = createPublicClient({
    chain: mainnet,
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
      setAddress(address as `0x${string}`);
      setIsConnected(true);
      setError('');
    } catch (error) {
      console.error('连接钱包失败:', error);
      setError('连接钱包失败');
    }
  };

  // SIWE 登录
  const handleSiweLogin = async () => {
    if (!address || !window.ethereum) return;

    try {
      const walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });

      // 创建 SIWE 消息
      const message = createSiweMessage({
        address,
        chainId: mainnet.id,
        domain: window.location.hostname,
        nonce: Math.random().toString(36).substring(2),
        uri: window.location.origin,
        version: '1',
        statement: '请签名以登录到我们的应用',
      });

      // 请求用户签名
      const signature = await walletClient.signMessage({
        account: address,
        message,
      });

      // 验证签名
      const isValid = await verifySiweMessage(publicClient, {
        message,
        signature,
      });

      if (isValid) {
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('签名验证失败');
      }
    } catch (error) {
      console.error('SIWE 登录失败:', error);
      setError('SIWE 登录失败');
    }
  };

  // 登出
  const handleLogout = () => {
    setIsAuthenticated(false);
    setAddress(undefined);
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">SIWE 登录演示</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        {!isConnected ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
          >
            连接 MetaMask
          </button>
        ) : !isAuthenticated ? (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600">钱包地址:</p>
              <p className="font-mono break-all">{address}</p>
            </div>
            <button
              onClick={handleSiweLogin}
              className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
            >
              SIWE 登录
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600">已登录地址:</p>
              <p className="font-mono break-all">{address}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition-colors"
            >
              登出
            </button>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 