import {
    createPublicClient,
    formatEther,
    http,
    publicActions,
    parseAbiItem,
    parseAbi,
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

    console.log('开始扫描 ERC20 事件...');

    // 获取当前区块号
    const currentBlock = await publicClient.getBlockNumber();
    console.log(`当前区块号: ${currentBlock}`);

    // 设置扫描范围（这里扫描最近 1000 个区块）
    // get fromBlock from db
    const fromBlock = 0n;
    const toBlock = currentBlock;

    try {
        // 获取所有 ERC20 事件
        const logs = await publicClient.getLogs({
            fromBlock,
            toBlock,
            // address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
            // event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
            // event: TRANSFER_EVENT
            // multiple events
            events: parseAbi([
                'event Approval(address indexed owner, address indexed spender, uint256 value)',
                'event Transfer(address indexed from, address indexed to, uint256 value)'
            ])
        });

        console.log(`\n在区块 ${fromBlock} 到 ${toBlock} 之间找到 ${logs.length} 个事件`);

        // 处理每个事件
        for (const log of logs) {
            console.log('\n事件详情:');
            console.log(`事件类型: ${log.eventName}`);
            console.log(`合约地址: ${log.address}`);
            console.log(`交易哈希: ${log.transactionHash}`);
            console.log(`区块号: ${log.blockNumber}`);

            if (log.eventName === 'Transfer' && log.args.value !== undefined) {
                console.log(`从: ${log.args.from}`);
                console.log(`到: ${log.args.to}`);
                console.log(`金额: ${formatEther(log.args.value)}`);
            } else if (log.eventName === 'Approval' && log.args.value !== undefined) {
                console.log(`所有者: ${log.args.owner}`);
                console.log(`授权给: ${log.args.spender}`);
                console.log(`授权金额: ${formatEther(log.args.value)}`);
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
