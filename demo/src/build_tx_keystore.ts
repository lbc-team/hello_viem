import { createWalletClient, http, parseEther, parseGwei, type Hash, type TransactionReceipt } from 'viem'
import { prepareTransactionRequest } from 'viem/actions'
import { foundry } from 'viem/chains'
import { createPublicClient, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { Wallet } from '@ethersproject/wallet'

dotenv.config()

async function sendTransactionWithKeystore(): Promise<Hash> {
  try {
    // 1. 从环境变量获取 keystore 文件路径和密码
    const keystorePath = process.env.KEYSTORE_PATH
    const keystorePassword = process.env.KEYSTORE_PASSWORD

    if (!keystorePath || !keystorePassword) {
      throw new Error('请在 .env 文件中设置 KEYSTORE_PATH 和 KEYSTORE_PASSWORD')
    }

    // 2. 读取 keystore 文件
    const keystoreContent = readFileSync(join(process.cwd(), keystorePath), 'utf-8')
    const keystore = JSON.parse(keystoreContent)

    // 3. 使用 ethers.js 的 Wallet 来解密 keystore
    const wallet = await Wallet.fromEncryptedJson(keystoreContent, keystorePassword)
    const privateKey = wallet.privateKey as `0x${string}`

    // 4. 创建公共客户端
    const publicClient: PublicClient = createPublicClient({
      chain: foundry,
      transport: http(process.env.RPC_URL)
    })

    // 5. 创建钱包客户端
    const walletClient: WalletClient = createWalletClient({
      chain: foundry,
      transport: http(process.env.RPC_URL)
    })

    // 6. 从私钥创建账户
    const account = privateKeyToAccount(privateKey)
    const userAddress = account.address
    console.log('账户地址:', userAddress)

    // 7. 检查网络状态
    const blockNumber = await publicClient.getBlockNumber()
    console.log('当前区块号:', blockNumber)

    // 8. 获取当前 gas 价格
    const gasPrice = await publicClient.getGasPrice()
    console.log('当前 gas 价格:', parseGwei(gasPrice.toString()))

    // 9. 查询余额
    const balance = await publicClient.getBalance({
      address: userAddress
    })
    console.log('账户余额:', parseEther(balance.toString()))

    // 10. 查询 nonce
    const nonce = await publicClient.getTransactionCount({
      address: userAddress
    })
    console.log('当前 Nonce:', nonce)

    // 11. 构建交易参数
    const txParams = {
      account: account,
      to: '0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df' as `0x${string}`, // 目标地址
      value: parseEther('0.001'), // 发送金额（ETH）
      chainId: foundry.id,
      type: 'eip1559' as const,
      chain: foundry,
      
      // EIP-1559 交易参数
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: parseGwei('1.5'),
      gas: 21000n,
      nonce: nonce,
    }

    // 12. 准备交易
    const preparedTx = await prepareTransactionRequest(publicClient, txParams)
    console.log('准备后的交易参数:', {
      ...preparedTx,
      maxFeePerGas: parseGwei(preparedTx.maxFeePerGas.toString()),
      maxPriorityFeePerGas: parseGwei(preparedTx.maxPriorityFeePerGas.toString()),
    })

    // 13. 签名交易
    const signedTx = await walletClient.signTransaction(preparedTx)
    console.log('Signed Transaction:', signedTx)

    // 14. 发送交易
    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx
    })
    console.log('Transaction Hash:', txHash)

    // 15. 等待交易确认
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败')
    console.log('区块号:', receipt.blockNumber)
    console.log('Gas 使用量:', receipt.gasUsed.toString())

    return txHash

  } catch (error) {
    console.error('错误:', error)
    if (error instanceof Error) {
      console.error('错误信息:', error.message)
    }
    if (error && typeof error === 'object' && 'details' in error) {
      console.error('错误详情:', error.details)
    }
    throw error
  }
}

// 执行示例
sendTransactionWithKeystore() 