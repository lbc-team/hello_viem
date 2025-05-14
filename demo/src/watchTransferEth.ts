import {
    createPublicClient,
    formatEther,
    http,
    webSocket,
    publicActions,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

const main = async () => {
    // 创建公共客户端
    const publicClient = createPublicClient({
        chain: foundry,
        transport: webSocket(process.env.RPC_URL!),
    }).extend(publicActions);

    console.log('开始监听 ETH 转账交易...');

    // 监听新区块
    const unwatch = publicClient.watchBlocks({
        onBlock: async (block) => {
            // 获取区块中的所有交易
            const blockWithTransactions = await publicClient.getBlock({
                blockHash: block.hash,
                includeTransactions: true,
            });

            // 遍历交易
            for (const tx of blockWithTransactions.transactions) {
                // 只关注普通转账交易（没有 data 字段或 data 字段为 '0x'）
                if (tx.input === '0x' && tx.value > 0n) {
                    console.log('\n检测到新的 ETH 转账交易:');
                    console.log(`从: ${tx.from}`);
                    console.log(`到: ${tx.to}`);
                    console.log(`金额: ${formatEther(tx.value)} ETH`);
                    console.log(`交易哈希: ${tx.hash}`);
                    console.log(`区块号: ${block.number}`);
                }
            }
        }
    });

    // 保持程序运行
    process.on('SIGINT', () => {
        console.log('\n停止监听...');
        unwatch();
        process.exit();
    });
};

main().catch((error) => {
    console.error('发生错误:', error);
    process.exit(1);
}); 