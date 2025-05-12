'use client';

import { useState } from 'react';
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  parseEther,
  type Hash,
  type Address
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

  // 创建钱包客户端
  const walletClient = createWalletClient({
    chain: foundry,
    transport: http()
  });

  // 创建公共客户端
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http()
  });

  // 连接钱包
  const connectWallet = async () => {
    try {
      const [address] = await walletClient.requestAddresses();
      setAccount(address);
    } catch (error) {
      console.error('连接钱包错误:', error);
    }
  };

  const handleSign = async () => {
    if (!walletClient || !account) return;

    try {
      const domain = {
        name: 'EIP712Verifier',
        version: '1.0.0',
        chainId: 31337,
        verifyingContract: CONTRACT_ADDRESS,
      };

      const types = {
        Send: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      };

      const value = {
        to: toAddress as Address,
        value: parseEther(amount),
      };

      const signature = await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: 'Send',
        message: value,
      });

      setSignature(signature);
    } catch (error) {
      console.error('签名错误:', error);
    }
  };

  const handleVerify = async () => {
    if (!account || !signature) return;

    try {
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
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">EIP712 签名演示</h1>
      
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