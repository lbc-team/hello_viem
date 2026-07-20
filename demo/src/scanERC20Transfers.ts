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
            address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
            // args: {
            //     // from: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
            //     // to: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8']
            // },
            // 如果需要同时监听多个事件，可以使用 events 而不是 event
            // events: parseAbi([
            //     'event Approval(address indexed owner, address indexed spender, uint256 value)',
            //     'event Transfer(address indexed from, address indexed to, uint256 value)'
            // ]),
        });

        console.log(`\n在区块 ${fromBlock} 到 ${toBlock} 之间找到 ${logs.length} 个事件`);

        // 处理每个事件
        for (const log of logs) {
            console.log('\n事件详情:');
            console.log(`事件类型: ${log.eventName}`);
            console.log(`合约地址: ${log.address}`);
            console.log(`交易哈希: ${log.transactionHash}`);
            console.log(`区块号: ${log.blockNumber}`);

            if (log.args.value !== undefined) {
                console.log(`从: ${log.args.from}`);
                console.log(`到: ${log.args.to}`);
                console.log(`金额: ${formatEther(log.args.value)}`);
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
