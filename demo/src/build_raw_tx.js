import { createWalletClient, http, parseEther, parseGwei } from 'viem'
import { prepareTransactionRequest } from 'viem/actions'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { createPublicClient } from 'viem'
import dotenv from 'dotenv'

dotenv.config()

async function sendTransactionExample() {
  try {
    // const privateKey = generatePrivateKey()
    // 1. 从环境变量获取私钥
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey) {
      throw new Error('请在 .env 文件中设置 PRIVATE_KEY')
    }

    // 推导账户
    const account = privateKeyToAccount(privateKey)
    const userAddress = account.address
    console.log('账户地址:', userAddress)

    // 创建公共客户端
    const publicClient = createPublicClient({
      chain: foundry,
      // transport: http('https://eth-sepolia.public.blastapi.io')
      transport: http(process.env.RPC_URL)
    })

    // 检查网络状态
    const blockNumber = await publicClient.getBlockNumber()
    console.log('当前区块号:', blockNumber)

    // 获取当前 gas 价格
    const gasPrice = await publicClient.getGasPrice()
    console.log('当前 gas 价格:', parseGwei(gasPrice.toString()))

    // 查询余额
    const balance = await publicClient.getBalance({
      address: userAddress
    })
    console.log('账户余额:', parseEther(balance.toString()))

    // 查询nonce
    const nonce = await publicClient.getTransactionCount({
      address: userAddress
    })
    console.log('当前 Nonce:', nonce)

    // 2. 构建交易参数
    const txParams = {
      account: account,
      to: '0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df', // 目标地址
      value: parseEther('0.001'), // 发送金额（ETH）
      chainId: foundry.id,
      type: 'eip1559', // 
      
      // EIP-1559 交易参数
      maxFeePerGas: gasPrice * 2n, // 最大总费用为当前 gas 价格的 2 倍
      maxPriorityFeePerGas: parseGwei('1.5'), // 最大小费
      gas: 21000n,   // gas limit
      nonce: nonce,
    }

    // 或 自动 Gas 估算 及参数验证和补充
    const preparedTx = await prepareTransactionRequest(publicClient, txParams)
    console.log('准备后的交易参数:', {
      ...preparedTx,
      maxFeePerGas: parseGwei(preparedTx.maxFeePerGas.toString()),
      maxPriorityFeePerGas: parseGwei(preparedTx.maxPriorityFeePerGas.toString()),
    })

    // 创建钱包客户端
    const walletClient = createWalletClient({
      account: account,
      chain: foundry,
      transport: http(process.env.RPC_URL)
    })

    // // 方式 1：直接发送交易
    // const txHash1 = await walletClient.sendTransaction(preparedTx)
    // console.log('交易哈希:', txHash1)


    // 方式 2 ： 
    // 6. 签名交易
    const signedTx = await walletClient.signTransaction(preparedTx)
    console.log('Signed Transaction:', signedTx)

    // 7. 发送交易  eth_sendRawTransaction
    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx
    })
    console.log('Transaction Hash:', txHash)

    // // 等待交易确认
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败')
    console.log('区块号:', receipt.blockNumber)
    console.log('Gas 使用量:', receipt.gasUsed.toString())

    return txHash

  } catch (error) {
    console.error('错误:', error)
    if (error.message) {
      console.error('错误信息:', error.message)
    }
    if (error.details) {
      console.error('错误详情:', error.details)
    }
    throw error
  }
}

// 执行示例
sendTransactionExample()