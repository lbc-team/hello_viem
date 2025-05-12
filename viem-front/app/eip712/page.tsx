'use client';

import { useState, useEffect } from 'react';
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  parseEther,
  type Hash,
  type Address,
  custom,
  type WalletClient
} from 'viem';
import { foundry } from 'viem/chains';
import { EIP712VerifierABI } from '@/types/EIP712Verifier';

const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;

export default function EIP712Demo() {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [signature, setSignature] = useState('');
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [error, setError] = useState<string>('');
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  // 创建公共客户端
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http()
  });

  // 在客户端初始化钱包客户端
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
      // 请求用户授权连接钱包
      const [address] = await walletClient.requestAddresses();
      setAccount(address);
    } catch (error) {
      console.error('连接钱包错误:', error);
      setError('连接钱包失败，请确保已安装 MetaMask 并解锁');
    }
  };

  const handleSign = async () => {
    if (!walletClient || !account) {
      setError('请先连接钱包');
      return;
    }

    if (!toAddress || !amount) {
      setError('请填写接收地址和金额');
      return;
    }

    try {
      setError('');
      const domain = {
        name: 'EIP712Verifier',
        version: '1.0.0',
        chainId: 31337,
        verifyingContract: CONTRACT_ADDRESS,
      };

    // 合约中的 SEND_TYPEHASH 与前端定义的 types 结构一致
      const types = {
        Send: [  //  primaryType, 签名时, 消息的标题会显示 primaryType 的名称
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      };

      const msg = {
        to: toAddress as Address,
        value: parseEther(amount),
      };

      // 请求用户签名
      const signature = await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: 'Send',
        message: msg,
      });

      setSignature(signature);
    } catch (error) {
      console.error('签名错误:', error);
      setError(error instanceof Error ? error.message : '签名失败');
    }
  };

  const handleVerify = async () => {
    if (!account || !signature) {
      setError('请先完成签名');
      return;
    }

    try {
      setError('');
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: EIP712VerifierABI,
        functionName: 'verify',
        args: [
          account,
          {
            to: toAddress as Address,
            value: parseEther(amount),
          },
          signature as Hash,
        ],
      });

      setVerificationResult(result);
    } catch (error) {
      console.error('验证错误:', error);
      setError(error instanceof Error ? error.message : '验证失败');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">EIP712 Viem 签名演示</h1>
      
      {!account ? (
        <button
          onClick={connectWallet}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
        >
          连接钱包
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block mb-2">接收地址:</label>
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="0x..."
            />
          </div>

          <div>
            <label className="block mb-2">金额 (ETH):</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="0.1"
            />
          </div>

          <div className="space-x-4">
            <button
              onClick={handleSign}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              签名
            </button>
            
            <button
              onClick={handleVerify}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              disabled={!signature}
            >
              验证
            </button>
          </div>

          {error && (
            <div className="mt-4 text-red-500">
              {error}
            </div>
          )}

          {signature && (
            <div className="mt-4">
              <h2 className="font-bold">签名结果:</h2>
              <p className="break-all">{signature}</p>
            </div>
          )}

          {verificationResult !== null && (
            <div className="mt-4">
              <h2 className="font-bold">验证结果:</h2>
              <p className={verificationResult ? 'text-green-500' : 'text-red-500'}>
                {verificationResult ? '验证成功' : '验证失败'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 