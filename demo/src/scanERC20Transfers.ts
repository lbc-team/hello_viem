import {
    createPublicClient,
    formatEther,
    http,
    publicActions,
    type Log,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

// ERC20 Transfer 事件的定义
const TRANSFER_EVENT = {
    type: 'event',
    name: 'Transfer',
    inputs: [
        { type: 'address', name: 'from', indexed: true },
        { type: 'address', name: 'to', indexed: true },
        { type: 'uint256', name: 'value' }
    ]
} as const;

const main = async () => {
    // 创建公共客户端
    const publicClient = createPublicClient({
        chain: foundry,
        transport: http(process.env.RPC_URL!),
    }).extend(publicActions);

    console.log('开始扫描 ERC20 转账事件...');

    // 获取当前区块号
    const currentBlock = await publicClient.getBlockNumber();
    console.log(`当前区块号: ${currentBlock}`);

    // 设置扫描范围（这里扫描最近 1000 个区块）
    const fromBlock = 0n;
    const toBlock = currentBlock;

    try {
        // 获取所有 ERC20 Transfer 事件
        const logs = await publicClient.getLogs({
            fromBlock,
            toBlock,
            event: TRANSFER_EVENT,
        });

        console.log(`\n在区块 ${fromBlock} 到 ${toBlock} 之间找到 ${logs.length} 个转账事件`);

        // 处理每个事件
        for (const log of logs) {
            if (log.args.value !== undefined) {
                console.log('\n转账事件详情:');
                console.log(`从: ${log.args.from}`);
                console.log(`到: ${log.args.to}`);
                console.log(`金额: ${formatEther(log.args.value)}`);
                console.log(`合约地址: ${log.address}`);
                console.log(`交易哈希: ${log.transactionHash}`);
                console.log(`区块号: ${log.blockNumber}`);
            }
        }
    } catch (error) {
        console.error('扫描过程中发生错误:', error);
    }
};

main().catch((error) => {
    console.error('发生错误:', error);
    process.exit(1);
}); 