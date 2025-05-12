import { createWalletClient, http, createPublicClient, verifyMessage, hashMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

async function main() {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const account = privateKeyToAccount(privateKey)
    
    console.log('钱包地址:', account.address)
    
    // 创建钱包客户端
    const walletClient = createWalletClient({
        account,
        chain: mainnet,
        transport: http()
    })
    
    // 要签名的消息
    const message = 'hello world'

    const hash = await hashMessage(message)
    console.log('hash:', hash)

    
    // 签名消息
    const signature = await walletClient.signMessage({
        message
    })
    console.log('签名结果:', signature)
    
    // 验证签名
    const isValid = await verifyMessage({
        address: account.address,
        message,
        signature
    })

    // Solidity 合约验证：
    // function recover(bytes memory message, bytes memory signature) public pure returns (address) {
    //     bytes32 hash = MessageHashUtils.toEthSignedMessageHash(message);

    //     return ECDSA.recover(hash, signature);
    // }
    
    console.log('签名验证结果:', isValid ? '验证成功' : '验证失败')
}

main().catch((error) => {
    console.error('发生错误:', error)
    process.exit(1)
}) 