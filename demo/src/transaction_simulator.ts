import {
    createPublicClient,
    createWalletClient,
    http,
    formatEther,
    parseAbi,
    type Address,
    type Hash,
    type TransactionRequest,
    decodeFunctionData,
    hexToNumber,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

/**
## 🔍 模拟工作原理

```
1. 创建快照 (evm_snapshot)
2. 执行交易 (eth_sendTransaction)
3. 获取交易回执 (eth_getTransactionReceipt)
4. 分析日志和事件
   - 解析 Transfer 事件
   - 追踪内部调用（可选）
5. 回滚到快照 (evm_revert)
6. 返回结果
```

### 支持的 RPC 方法
- `evm_snapshot` - 创建状态快照
- `evm_revert` - 恢复到快照
- `eth_sendTransaction` - 发送交易
- `eth_getTransactionReceipt` - 获取交易回执
- `eth_estimateGas` - 估算 gas
- `trace_transaction` - 追踪交易, Trace 模块（Parity/Erigon 风格）的接口 
- `trace_block` -  Trace 模块的接口 
- `debug_traceTransaction` - 调试追踪 , Geth 风格的调试接口，对一笔已上链交易 进行详细的 EVM 执行追踪,  输出：gas 消耗、存储变化（storage diff）、内部调用的 call tree
- `debug_traceCall` - Geth 调试接口，用于追踪未上链的模拟调用（call 模拟）

**/


// 定义转账记录接口
interface ETHTransfer {
    type: 'ETH';
    from: Address;
    to: Address;
    value: bigint;
    valueFormatted: string;
}

interface ERC20Transfer {
    type: 'ERC20';
    tokenAddress: Address;
    from: Address;
    to: Address;
    value: bigint;
    valueFormatted: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
}

interface ERC721Transfer {
    type: 'ERC721';
    tokenAddress: Address;
    from: Address;
    to: Address;
    tokenId: bigint;
}

type Transfer = ETHTransfer | ERC20Transfer | ERC721Transfer;

interface SimulationResult {
    success: boolean;
    transfers: Transfer[];
    gasUsed?: bigint;
    error?: string;
}

// ERC20 和 ERC721 的 Transfer 事件 ABI
const TRANSFER_EVENTS = parseAbi([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

// ERC20 函数 ABI，用于获取代币信息
const ERC20_ABI = parseAbi([
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
]);

class TransactionSimulator {
    private publicClient;
    private anvilUrl: string;

    constructor(anvilUrl: string) {
        this.anvilUrl = anvilUrl;
        this.publicClient = createPublicClient({
            chain: foundry,
            transport: http(anvilUrl),
        });
    }

    /**
     * 模拟交易并获取所有转账记录
     */
    async simulateTransaction(txRequest: TransactionRequest): Promise<SimulationResult> {
        try {
            // 1. 获取当前状态的快照
            const snapshotId = await this.createSnapshot();
            console.log(`创建快照: ${snapshotId}`);

            let transfers: Transfer[] = [];
            let gasUsed: bigint | undefined;

            try {
                // 2. 执行交易调用以估算 gas 和验证交易
                const estimatedGas = await this.publicClient.estimateGas({
                    account: txRequest.from,
                    to: txRequest.to,
                    value: txRequest.value,
                    data: txRequest.data,
                });

                console.log(`估算 Gas: ${estimatedGas}`);

                // 3. 使用 debug_traceCall 来追踪交易执行（如果 Anvil 支持）
                // 或者实际执行交易然后分析日志
                const txHash = await this.executeTransaction(txRequest);
                console.log(`模拟交易哈希: ${txHash}`);

                // 4. 获取交易回执
                const receipt = await this.publicClient.waitForTransactionReceipt({
                    hash: txHash,
                });

                gasUsed = receipt.gasUsed;
                console.log(`实际 Gas 使用: ${gasUsed}`);

                // 5. 分析交易以提取转账信息
                transfers = await this.analyzeTransaction(txHash, receipt);

                // 6. 恢复到快照状态
                await this.revertToSnapshot(snapshotId);
                console.log(`恢复到快照: ${snapshotId}`);

                return {
                    success: true,
                    transfers,
                    gasUsed,
                };
            } catch (error) {
                // 确保即使出错也要恢复快照
                await this.revertToSnapshot(snapshotId);
                throw error;
            }
        } catch (error) {
            console.error('模拟交易失败:', error);
            return {
                success: false,
                transfers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 分析交易并提取所有转账记录
     */
    private async analyzeTransaction(txHash: Hash, receipt: any): Promise<Transfer[]> {
        const transfers: Transfer[] = [];

        // 1. 获取完整的交易信息
        const tx = await this.publicClient.getTransaction({ hash: txHash });

        // 2. 检查 ETH 转账
        if (tx.value && tx.value > 0n) {
            transfers.push({
                type: 'ETH',
                from: tx.from,
                to: tx.to as Address,
                value: tx.value,
                valueFormatted: formatEther(tx.value),
            });
        }

        // 3. 分析交易日志以获取 ERC20/ERC721 转账
        for (const log of receipt.logs) {
            try {
                // 尝试解析为 Transfer 事件
                const topics = log.topics;

                // Transfer 事件的签名
                const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

                if (topics[0] === transferEventSignature) {
                    // 判断是 ERC20 还是 ERC721
                    // ERC721: 有 3 个 indexed 参数 (from, to, tokenId)
                    // ERC20: 有 2 个 indexed 参数 (from, to) + data 中的 value

                    if (topics.length === 4) {
                        // ERC721 Transfer
                        const from = `0x${topics[1].slice(26)}` as Address;
                        const to = `0x${topics[2].slice(26)}` as Address;
                        const tokenId = BigInt(topics[3]);

                        transfers.push({
                            type: 'ERC721',
                            tokenAddress: log.address,
                            from,
                            to,
                            tokenId,
                        });
                    } else if (topics.length === 3) {
                        // ERC20 Transfer
                        const from = `0x${topics[1].slice(26)}` as Address;
                        const to = `0x${topics[2].slice(26)}` as Address;
                        const value = BigInt(log.data);

                        // 尝试获取代币信息
                        let tokenSymbol: string | undefined;
                        let tokenDecimals: number | undefined;

                        try {
                            tokenSymbol = await this.publicClient.readContract({
                                address: log.address,
                                abi: ERC20_ABI,
                                functionName: 'symbol',
                            }) as string;

                            tokenDecimals = await this.publicClient.readContract({
                                address: log.address,
                                abi: ERC20_ABI,
                                functionName: 'decimals',
                            }) as number;
                        } catch (e) {
                            // 如果获取失败，继续处理，只是没有这些信息
                        }

                        const valueFormatted = tokenDecimals
                            ? (Number(value) / Math.pow(10, tokenDecimals)).toString()
                            : value.toString();

                        transfers.push({
                            type: 'ERC20',
                            tokenAddress: log.address,
                            from,
                            to,
                            value,
                            valueFormatted,
                            tokenSymbol,
                            tokenDecimals,
                        });
                    }
                }
            } catch (error) {
                console.warn(`解析日志失败:`, error);
                // 继续处理其他日志
            }
        }

        // 4. 使用 trace_transaction 追踪内部 ETH 转账（如果 Anvil 支持）
        try {
            const traces = await this.traceTransaction(txHash);
            const internalTransfers = this.extractInternalTransfers(traces);
            transfers.push(...internalTransfers);
        } catch (error) {
            console.warn('追踪内部转账失败（可能不支持 trace API）:', error);
        }

        return transfers;
    }

    /**
     * 执行交易（在模拟环境中）
     */
    private async executeTransaction(txRequest: TransactionRequest): Promise<Hash> {
        // 使用 eth_sendTransaction 发送交易
        // 注意：这需要 from 地址在 Anvil 中已解锁
        const hash = await this.publicClient.request({
            method: 'eth_sendTransaction' as any,
            params: [
                {
                    from: txRequest.from,
                    to: txRequest.to,
                    value: txRequest.value ? `0x${txRequest.value.toString(16)}` : undefined,
                    data: txRequest.data,
                    gas: txRequest.gas ? `0x${txRequest.gas.toString(16)}` : undefined,
                    gasPrice: txRequest.gasPrice ? `0x${txRequest.gasPrice.toString(16)}` : undefined,
                },
            ],
        } as any);

        return hash as Hash;
    }

    /**
     * 创建 EVM 快照
     */
    private async createSnapshot(): Promise<string> {
        const snapshotId = await this.publicClient.request({
            method: 'evm_snapshot' as any,
            params: [] as any,
        } as any);
        return snapshotId as string;
    }

    /**
     * 恢复到指定快照
     */
    private async revertToSnapshot(snapshotId: string): Promise<void> {
        await this.publicClient.request({
            method: 'evm_revert' as any,
            params: [snapshotId] as any,
        } as any);
    }

    /**
     * 追踪交易执行（使用 debug_traceTransaction 或 trace_transaction）
     */
    private async traceTransaction(txHash: Hash): Promise<any> {
        try {
            // 尝试使用 trace_transaction (OpenEthereum/Erigon 风格)
            const traces = await this.publicClient.request({
                method: 'trace_transaction' as any,
                params: [txHash] as any,
            } as any);
            console.log('trace_transaction traces:', traces);
            return traces;
        } catch (error) {
            // 尝试使用 debug_traceTransaction (Geth 风格)
            try {
                const traces = await this.publicClient.request({
                    method: 'debug_traceTransaction' as any,
                    params: [txHash, { tracer: 'callTracer' }] as any,
                } as any);
                console.log('debug_traceTransaction traces:', traces);
                return traces;
            } catch (e) {
                throw new Error('节点不支持交易追踪 API');
            }
        }
    }

    /**
     * 从追踪结果中提取内部 ETH 转账
     * 注意：这里只提取内部调用的转账，不包括顶层交易本身
     */
    private extractInternalTransfers(traces: any): ETHTransfer[] {
        const transfers: ETHTransfer[] = [];

        if (!traces) return transfers;

        // 处理 trace_transaction 格式 (Parity/Erigon 风格)
        if (Array.isArray(traces)) {
            for (const trace of traces) {
                // 跳过顶层调用（traceAddress 为空数组表示顶层）
                // 只提取内部调用（traceAddress 有值）
                if (trace.type === 'call' &&
                    trace.action?.value &&
                    BigInt(trace.action.value) > 0n &&
                    trace.traceAddress &&
                    trace.traceAddress.length > 0) {
                    transfers.push({
                        type: 'ETH',
                        from: trace.action.from as Address,
                        to: trace.action.to as Address,
                        value: BigInt(trace.action.value),
                        valueFormatted: formatEther(BigInt(trace.action.value)),
                    });
                }
            }
        }

        // 处理 debug_traceTransaction (callTracer) 格式 (Geth 风格)
        if (traces.calls) {
            // 只提取 traces.calls 中的调用（这些是内部调用）
            // 不包括 traces 顶层的调用
            const extractFromCalls = (call: any) => {
                if (call.value && BigInt(call.value) > 0n) {
                    transfers.push({
                        type: 'ETH',
                        from: call.from as Address,
                        to: call.to as Address,
                        value: BigInt(call.value),
                        valueFormatted: formatEther(BigInt(call.value)),
                    });
                }

                // 递归提取更深层的调用
                if (call.calls) {
                    call.calls.forEach(extractFromCalls);
                }
            };

            // 只处理 traces.calls 数组，不处理 traces 本身
            if (Array.isArray(traces.calls)) {
                traces.calls.forEach(extractFromCalls);
            }
        }

        return transfers;
    }

    /**
     * 格式化输出转账信息
     */
    formatTransfers(transfers: Transfer[]): void {
        console.log('\n========== 模拟交易中的转账记录 ==========\n');

        const ethTransfers = transfers.filter(t => t.type === 'ETH') as ETHTransfer[];
        const erc20Transfers = transfers.filter(t => t.type === 'ERC20') as ERC20Transfer[];
        const erc721Transfers = transfers.filter(t => t.type === 'ERC721') as ERC721Transfer[];

        if (ethTransfers.length > 0) {
            console.log('📤 ETH 转账:');
            ethTransfers.forEach((transfer, index) => {
                console.log(`  ${index + 1}. ${transfer.from} -> ${transfer.to}`);
                console.log(`     金额: ${transfer.valueFormatted} ETH`);
            });
            console.log();
        }

        if (erc20Transfers.length > 0) {
            console.log('🪙 ERC20 转账:');
            erc20Transfers.forEach((transfer, index) => {
                const symbol = transfer.tokenSymbol || '未知代币';
                console.log(`  ${index + 1}. ${transfer.from} -> ${transfer.to}`);
                console.log(`     代币: ${transfer.tokenAddress} (${symbol})`);
                console.log(`     金额: ${transfer.valueFormatted}`);
            });
            console.log();
        }

        if (erc721Transfers.length > 0) {
            console.log('🖼️  ERC721 转账:');
            erc721Transfers.forEach((transfer, index) => {
                console.log(`  ${index + 1}. ${transfer.from} -> ${transfer.to}`);
                console.log(`     NFT: ${transfer.tokenAddress}`);
                console.log(`     Token ID: ${transfer.tokenId}`);
            });
            console.log();
        }

        console.log(`总计: ${transfers.length} 笔转账`);
        console.log('==============================\n');
    }
}

// 示例使用
async function main() {
    const simulator = new TransactionSimulator(process.env.RPC_URL!);

    // 示例 1: 模拟简单的 ETH 转账
    console.log('=== 示例 1: 模拟 ETH 转账 ===\n');
    const result1 = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address, // Anvil 默认账户
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
        value: BigInt('1000000000000000000'), // 1 ETH
    });

    if (result1.success) {
        console.log(`Gas 使用: ${result1.gasUsed}`);
        simulator.formatTransfers(result1.transfers);
    } else {
        console.error(`模拟失败: ${result1.error}`);
    }

    // 示例 2: 模拟 ERC20 转账（需要替换为实际的 ERC20 合约地址和调用数据）
    // console.log('=== 示例 2: 模拟 ERC20 转账 ===\n');
    // const result2 = await simulator.simulateTransaction({
    //     from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    //     to: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address, // ERC20 合约地址
    //     data: '0x...', // transfer 函数的调用数据
    // });

    // if (result2.success) {
    //     console.log(`Gas 使用: ${result2.gasUsed}`);
    //     simulator.formatTransfers(result2.transfers);
    // }
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { TransactionSimulator, type SimulationResult, type Transfer, type ETHTransfer, type ERC20Transfer, type ERC721Transfer };
