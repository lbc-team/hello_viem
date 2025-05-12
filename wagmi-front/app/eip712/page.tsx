'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useSignTypedData } from 'wagmi';
import { parseEther, type Address } from 'viem';
import { EIP712VerifierABI } from '../types/EIP712Verifier';

const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;

export default function EIP712Demo() {
  const { address, isConnected } = useAccount();
  
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string>('');

  const { signTypedData, data: signature, isPending } = useSignTypedData();

  const { data: verifyResult, refetch: verifySignature } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: EIP712VerifierABI,
    functionName: 'verify',
    args: [
      address as Address,
      {
        to: toAddress as Address,
        value: parseEther(amount),
      },
      signature as `0x${string}`,
    ],
    query: {
      enabled: false,
    },
  });

  const handleSign = async () => {
    if (!isConnected) {
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

      const types = {
        Send: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      };

      const sendData = {
        to: toAddress as Address,
        value: parseEther(amount),
      };

      await signTypedData({
        domain,
        types,
        primaryType: 'Send',
        message: sendData,
      });
    } catch (error) {
      console.error('签名错误:', error);
      setError(error instanceof Error ? error.message : '签名失败');
    }
  };

  const handleVerify = async () => {
    if (!address || !signature) return;
    try {
      setError('');
      const result = await verifySignature();
      setVerificationResult(result.data ?? false);
    } catch (error) {
      console.error('验证错误:', error);
      setError(error instanceof Error ? error.message : '验证失败');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">EIP712 签名演示</h1>
      
      {!isConnected ? (
        <div className="text-red-500">请先连接钱包</div>
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
              disabled={isPending}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isPending ? '签名中...' : '签名'}
            </button>
            
            <button
              onClick={handleVerify}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
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