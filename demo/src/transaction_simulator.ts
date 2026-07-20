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
    encodeFunctionData,
    hexToNumber,
    parseEther,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

/**
## 🔍 模拟工作原理

```
1. 创建快照 (evm_snapshot) - 可选
2. 执行交易 (eth_sendTransaction)
3. 获取交易回执 (eth_getTransactionReceipt)
4. 分析日志和事件
   - 解析 Transfer 事件
   - 追踪内部调用（可选）
5. 回滚到快照 (evm_revert)
6. 返回结果
```

### 使用的 RPC 方法(节点需启用 --http.api debug,trace )
- `evm_snapshot` - 创建状态快照
- `evm_revert` - 恢复到快照
- `eth_sendTransaction` - 发送交易
- `eth_getTransactionReceipt` - 获取交易回执
- `eth_estimateGas` - 估算 gas
- `trace_transaction` - 追踪交易, Trace ( Nethermind /Erigon 风格）的接口 
- `trace_block` -  Trace 模块的接口（未使用）
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
     * 方法 1: 基于快照的基础模拟
     * 依次调用 createSnapshot、estimateGas、executeTransaction、分析收据、revertToSnapshot
     * 不使用 trace 方法，只分析交易日志
     */
    async simulateTransactionBasic(txRequest: TransactionRequest): Promise<SimulationResult> {
        try {
            // 1. 创建快照
            const snapshotId = await this.createSnapshot();

            let transfers: Transfer[] = [];
            let gasUsed: bigint | undefined;

            try {
                // 2. 估算 Gas
                const estimatedGas = await this.publicClient.estimateGas({
                    account: txRequest.from,
                    to: txRequest.to,
                    value: txRequest.value,
                    data: txRequest.data,
                });
                console.log(`[方法1-基础模拟] 估算 Gas: ${estimatedGas}`);

                // 3. 执行交易
                const txHash = await this.executeTransaction(txRequest);
                console.log(`[方法1-基础模拟] 模拟交易哈希: ${txHash}`);

                // 4. 获取交易回执
                const receipt = await this.publicClient.waitForTransactionReceipt({
                    hash: txHash,
                });

                gasUsed = receipt.gasUsed;
                console.log(`[方法1-基础模拟] 实际 Gas 使用: ${gasUsed}`);

                // 5. 检查交易执行状态
                if (receipt.status === 'reverted') {
                    await this.revertToSnapshot(snapshotId);
                    return {
                        success: false,
                        transfers: [],
                        gasUsed,
                        error: '交易执行失败（reverted）',
                    };
                }

                // 6. 分析收据
                transfers = await this.analyzeTransactionReceipt(txHash, receipt);

                // 7. 恢复到快照
                await this.revertToSnapshot(snapshotId);

                return {
                    success: true,
                    transfers,
                    gasUsed,
                };
            } catch (error) {
                await this.revertToSnapshot(snapshotId);
                throw error;
            }
        } catch (error) {
            console.error('[方法1-基础模拟] 模拟交易失败:', error);
            return {
                success: false,
                transfers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 方法 2: 使用 trace_transaction (Parity/Erigon 风格)
     * 通过 trace_transaction API 获取详细的调用追踪（ETH 转账），并从日志中提取 ERC20/ERC721 转账
     */
    async simulateTransactionWithTrace(txRequest: TransactionRequest): Promise<SimulationResult> {
        try {
            // 1. 创建快照
            const snapshotId = await this.createSnapshot();

            let transfers: Transfer[] = [];
            let gasUsed: bigint | undefined;

            try {
                // 2. 执行交易
                const txHash = await this.executeTransaction(txRequest);
                console.log(`[方法2-Trace] 模拟交易哈希: ${txHash}`);

                // 3. 获取交易回执
                const receipt = await this.publicClient.waitForTransactionReceipt({
                    hash: txHash,
                });

                gasUsed = receipt.gasUsed;
                console.log(`[方法2-Trace] 实际 Gas 使用: ${gasUsed}`);

                // 4. 检查交易执行状态
                if (receipt.status === 'reverted') {
                    await this.revertToSnapshot(snapshotId);
                    return {
                        success: false,
                        transfers: [],
                        gasUsed,
                        error: '交易执行失败（reverted）',
                    };
                }

                // 5. 使用 trace_transaction 分析（提取 ETH 转账）
                const traces = await this.publicClient.request({
                    method: 'trace_transaction' as any,
                    params: [txHash] as any,
                } as any);
                console.log(`[方法2-Trace] 获取到 trace 数据`);

                // 6. 从 trace 数据中提取 ETH 转账
                const ethTransfers = this.extractAllTransfersFromTrace(traces);
                transfers.push(...ethTransfers);

                // 7. 从日志中提取 ERC20/ERC721 转账
                const tokenTransfers = await this.extractTokenTransfersFromLogs(receipt);
                transfers.push(...tokenTransfers);

                // 8. 恢复到快照
                await this.revertToSnapshot(snapshotId);

                return {
                    success: true,
                    transfers,
                    gasUsed,
                };
            } catch (error) {
                await this.revertToSnapshot(snapshotId);
                throw error;
            }
        } catch (error) {
            console.error('[方法2-Trace] 模拟交易失败:', error);
            return {
                success: false,
                transfers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 方法 3: 使用 debug_traceTransaction (Geth 风格)
     * 通过 debug_traceTransaction API 获取详细的 EVM 执行追踪（ETH 转账），并从日志中提取 ERC20/ERC721 转账
     */
    async simulateTransactionWithDebugTrace(txRequest: TransactionRequest): Promise<SimulationResult> {
        try {
            // 1. 创建快照
            const snapshotId = await this.createSnapshot();

            let transfers: Transfer[] = [];
            let gasUsed: bigint | undefined;

            try {
                // 2. 执行交易
                const txHash = await this.executeTransaction(txRequest);
                console.log(`[方法3-DebugTrace] 模拟交易哈希: ${txHash}`);

                // 3. 获取交易回执
                const receipt = await this.publicClient.waitForTransactionReceipt({
                    hash: txHash,
                });

                gasUsed = receipt.gasUsed;
                console.log(`[方法3-DebugTrace] 实际 Gas 使用: ${gasUsed}`);

                // 4. 检查交易执行状态
                if (receipt.status === 'reverted') {
                    await this.revertToSnapshot(snapshotId);
                    return {
                        success: false,
                        transfers: [],
                        gasUsed,
                        error: '交易执行失败（reverted）',
                    };
                }

                // 5. 使用 debug_traceTransaction 分析（提取 ETH 转账）
                // 使用 callTracer with onlyTopCall=false 来捕获所有内部调用
                const traces = await this.publicClient.request({
                    method: 'debug_traceTransaction' as any,
                    params: [
                        txHash,
                        {
                            tracer: 'callTracer',
                            tracerConfig: {
                                onlyTopCall: false,
                                withLog: true,
                            }
                        }
                    ] as any,
                } as any);
                console.log(`[方法3-DebugTrace] 获取到 debug trace 数据`);

                // 6. 从 debug trace 数据中提取 ETH 转账
                const ethTransfers = this.extractAllTransfersFromDebugTrace(traces);
                transfers.push(...ethTransfers);

                // 7. 从日志中提取 ERC20/ERC721 转账
                const tokenTransfers = await this.extractTokenTransfersFromLogs(receipt);
                transfers.push(...tokenTransfers);

                // 8. 恢复到快照
                await this.revertToSnapshot(snapshotId);

                return {
                    success: true,
                    transfers,
                    gasUsed,
                };
            } catch (error) {
                await this.revertToSnapshot(snapshotId);
                throw error;
            }
        } catch (error) {
            console.error('[方法3-DebugTrace] 模拟交易失败:', error);
            return {
                success: false,
                transfers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 方法 4: 使用 debug_traceCall (Geth 风格，不执行交易)
     * 通过 debug_traceCall 进行模拟调用，不需要实际执行交易，也不需要快照
     * 通过解析 call input 识别 ERC20 的 transfer/transferFrom 调用来追踪 Token 转账
     */
    async simulateTransactionWithTraceCall(txRequest: TransactionRequest): Promise<SimulationResult> {
        try {
            console.log(`[方法4-TraceCall] 开始模拟调用（不执行交易）`);

            let transfers: Transfer[] = [];

            // 1. 使用 debug_traceCall 进行模拟调用
            const traces: any = await this.publicClient.request({
                method: 'debug_traceCall' as any,
                params: [
                    {
                        from: txRequest.from,
                        to: txRequest.to,
                        value: txRequest.value ? `0x${txRequest.value.toString(16)}` : undefined,
                        data: txRequest.data,
                        gas: txRequest.gas ? `0x${txRequest.gas.toString(16)}` : undefined,
                    },
                    'latest', // 在最新区块状态下模拟
                    {
                        tracer: 'callTracer',
                        tracerConfig: {
                            onlyTopCall: false,
                            withLog: true,
                        }
                    }
                ] as any,
            } as any);
            console.log(`[方法4-TraceCall] 获取到 trace 数据`);

            // 2. 检查调用是否成功
            if (!traces || traces.error) {
                return {
                    success: false,
                    transfers: [],
                    error: `模拟调用失败: ${traces?.error || 'unknown error'}`,
                };
            }

            // 3. 从 debug trace 数据中提取 ETH 转账
            const ethTransfers = this.extractAllTransfersFromDebugTrace(traces);
            transfers.push(...ethTransfers);

            // 4. 从 trace calls 中识别 ERC20 Token 转账
            const tokenTransfers = await this.extractTokenTransfersFromTraceCalls(traces);
            transfers.push(...tokenTransfers);

            return {
                success: true,
                transfers,
                // debug_traceCall 不提供 gasUsed
            };
        } catch (error) {
            console.error('[方法4-TraceCall] 模拟调用失败:', error);
            return {
                success: false,
                transfers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 分析交易收据并提取转账记录（从日志中提取）
     */
    private async analyzeTransactionReceipt(txHash: Hash, receipt: any): Promise<Transfer[]> {
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

        // 3. 从日志中提取 ERC20/ERC721 转账
        const tokenTransfers = await this.extractTokenTransfersFromLogs(receipt);
        transfers.push(...tokenTransfers);

        return transfers;
    }

    /**
     * 从交易日志中提取 ERC20/ERC721 转账
     */
    private async extractTokenTransfersFromLogs(receipt: any): Promise<(ERC20Transfer | ERC721Transfer)[]> {
        const transfers: (ERC20Transfer | ERC721Transfer)[] = [];

        // 分析交易日志以获取 ERC20/ERC721 转账
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

        return transfers;
    }

    /**
     * 从 trace calls 中识别 ERC20 Token 转账（通过匹配 transfer/transferFrom 函数签名）
     * 用于 debug_traceCall 等没有日志的场景
     */
    private async extractTokenTransfersFromTraceCalls(traces: any): Promise<(ERC20Transfer | ERC721Transfer)[]> {
        const transfers: (ERC20Transfer | ERC721Transfer)[] = [];

        if (!traces) return transfers;

        // ERC20 函数签名
        const TRANSFER_SIGNATURE = '0xa9059cbb'; // transfer(address,uint256)
        const TRANSFER_FROM_SIGNATURE = '0x23b872dd'; // transferFrom(address,address,uint256)

        // 递归处理所有 calls
        const processCalls = async (call: any) => {
            if (!call || !call.input) return;

            const signature = call.input.slice(0, 10);

            // 检查是否是 transfer 或 transferFrom
            if (signature === TRANSFER_SIGNATURE) {
                // transfer(address to, uint256 amount)
                try {
                    const decoded = decodeFunctionData({
                        abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
                        data: call.input as `0x${string}`,
                    });

                    const to = decoded.args[0] as Address;
                    const amount = decoded.args[1] as bigint;

                    // 获取代币信息
                    let tokenSymbol: string | undefined;
                    let tokenDecimals: number | undefined;

                    try {
                        tokenSymbol = await this.publicClient.readContract({
                            address: call.to,
                            abi: ERC20_ABI,
                            functionName: 'symbol',
                        }) as string;

                        tokenDecimals = await this.publicClient.readContract({
                            address: call.to,
                            abi: ERC20_ABI,
                            functionName: 'decimals',
                        }) as number;
                    } catch (e) {
                        // 忽略获取失败
                    }

                    const valueFormatted = tokenDecimals
                        ? (Number(amount) / Math.pow(10, tokenDecimals)).toString()
                        : amount.toString();

                    transfers.push({
                        type: 'ERC20',
                        tokenAddress: call.to,
                        from: call.from as Address,
                        to,
                        value: amount,
                        valueFormatted,
                        tokenSymbol,
                        tokenDecimals,
                    });
                } catch (e) {
                    console.warn(`解析 transfer 调用失败:`, e);
                }
            } else if (signature === TRANSFER_FROM_SIGNATURE) {
                // transferFrom(address from, address to, uint256 amount)
                try {
                    const decoded = decodeFunctionData({
                        abi: parseAbi(['function transferFrom(address from, address to, uint256 amount) returns (bool)']),
                        data: call.input as `0x${string}`,
                    });

                    const from = decoded.args[0] as Address;
                    const to = decoded.args[1] as Address;
                    const amount = decoded.args[2] as bigint;

                    // 获取代币信息
                    let tokenSymbol: string | undefined;
                    let tokenDecimals: number | undefined;

                    try {
                        tokenSymbol = await this.publicClient.readContract({
                            address: call.to,
                            abi: ERC20_ABI,
                            functionName: 'symbol',
                        }) as string;

                        tokenDecimals = await this.publicClient.readContract({
                            address: call.to,
                            abi: ERC20_ABI,
                            functionName: 'decimals',
                        }) as number;
                    } catch (e) {
                        // 忽略获取失败
                    }

                    const valueFormatted = tokenDecimals
                        ? (Number(amount) / Math.pow(10, tokenDecimals)).toString()
                        : amount.toString();

                    transfers.push({
                        type: 'ERC20',
                        tokenAddress: call.to,
                        from,
                        to,
                        value: amount,
                        valueFormatted,
                        tokenSymbol,
                        tokenDecimals,
                    });
                } catch (e) {
                    console.warn(`解析 transferFrom 调用失败:`, e);
                }
            }

            // 递归处理子调用
            if (call.calls && Array.isArray(call.calls)) {
                for (const subCall of call.calls) {
                    await processCalls(subCall);
                }
            }
        };

        // 只处理 traces.calls 数组，不处理顶层（避免重复）
        if (traces.calls && Array.isArray(traces.calls)) {
            for (const call of traces.calls) {
                await processCalls(call);
            }
        }

        return transfers;
    }

    /**
     * 执行交易（在模拟环境中）
     */
    private async executeTransaction(txRequest: TransactionRequest): Promise<Hash> {
        // 使用 eth_sendTransaction 发送交易
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
     * 从 trace_transaction 结果中提取所有 ETH 转账（包括顶层和内部转账）
     */
    private extractAllTransfersFromTrace(traces: any): ETHTransfer[] {
        const transfers: ETHTransfer[] = [];

        if (!traces) return transfers;

        // 处理 trace_transaction 格式 (Parity/Erigon 风格)
        if (Array.isArray(traces)) {
            for (const trace of traces) {
                // 提取所有 call 类型的转账（包括顶层和内部转账）
                if (trace.type === 'call' &&
                    trace.action?.value &&
                    BigInt(trace.action.value) > 0n) {
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

        return transfers;
    }

    /**
     * 从 debug_traceTransaction 结果中提取所有 ETH 转账（包括顶层和内部转账）
     */
    private extractAllTransfersFromDebugTrace(traces: any): ETHTransfer[] {
        const transfers: ETHTransfer[] = [];

        if (!traces) return transfers;

        // 处理 debug_traceTransaction (callTracer) 格式 (Geth 风格)
        // 先提取顶层调用
        if (traces.value && BigInt(traces.value) > 0n) {
            transfers.push({
                type: 'ETH',
                from: traces.from as Address,
                to: traces.to as Address,
                value: BigInt(traces.value),
                valueFormatted: formatEther(BigInt(traces.value)),
            });
        }

        // 递归提取内部调用
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

        // 处理 traces.calls 数组
        if (traces.calls && Array.isArray(traces.calls)) {
            traces.calls.forEach(extractFromCalls);
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
    }
}

function getTestTx() {
    return {
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address, // Anvil 默认账户
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address, // Anvil 默认账户 1
        value: BigInt('1000000000000000000'), // 1 ETH
    } as TransactionRequest;
}

function getTestTx2() {
    const tokenbank_address = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as Address;
   
    const depositEthData = encodeFunctionData({
        abi: parseAbi(['function depositEth(uint256 amount)']),
        functionName: 'depositEth', 
        args: [
            parseEther('1'),  
        ],
    });
    const amount = parseEther('1.5');
    return{
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
        to: tokenbank_address,
        data: depositEthData,
        value: amount
    } 
}

// cast send 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6 "approve(address to, uint256 value)" 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 1000000000000000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url local
// cast call 0xD0B50F190F097D2E2E3136B6105923d1EEf67569 "allowance(address account, address spender)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0xD0DB636309D53423B6Bb7A3B318Aaee7CC9CB41A
function getTestTx3() {
    const OPS6_ADDRESS = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address;
    const tokenbank_address = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as Address;
    const amount = parseEther('1');
    const depositErc20Data = encodeFunctionData({
        abi: parseAbi(['function deposit(uint256 amount)']),
        functionName: 'deposit',
        args: [amount],
    });

    return {
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
        to: tokenbank_address,
        data: depositErc20Data
    }
}

// 示例使用
async function main() {
    const simulator = new TransactionSimulator(process.env.RPC_URL!);

    // 测试交易
    const testTx = getTestTx3();

    console.log('=========================================');
    console.log('测试交易模拟的四种方法');
    console.log('=========================================\n');

    // 方法 1: 基础模拟（只用快照、estimateGas、执行、分析收据）
    console.log('=== 方法 1: 基础模拟 (Snapshot + Receipt) ===\n');
    const result1 = await simulator.simulateTransactionBasic(testTx);

    if (result1.success) {
        console.log(`Gas 使用: ${result1.gasUsed}`);
        simulator.formatTransfers(result1.transfers);
    } else {
        console.error(`模拟失败: ${result1.error}`);
    }

    console.log('\n');

    // 方法 2: 使用 trace_transaction (Parity/Erigon 风格)
    console.log('=== 方法 2: 使用 trace_transaction ===\n');
    const result2 = await simulator.simulateTransactionWithTrace(testTx);

    if (result2.success) {
        console.log(`Gas 使用: ${result2.gasUsed}`);
        simulator.formatTransfers(result2.transfers);
    } else {
        console.error(`模拟失败: ${result2.error}`);
    }

    console.log('\n');

    // 方法 3: 使用 debug_traceTransaction (Geth 风格)
    console.log('=== 方法 3: 使用 debug_traceTransaction ===\n');
    const result3 = await simulator.simulateTransactionWithDebugTrace(testTx);

    if (result3.success) {
        console.log(`Gas 使用: ${result3.gasUsed}`);
        simulator.formatTransfers(result3.transfers);
    } else {
        console.error(`模拟失败: ${result3.error}`);
    }

    console.log('\n');

    // 方法 4: 使用 debug_traceCall (不执行交易)
    console.log('=== 方法 4: 使用 debug_traceCall (模拟调用) ===\n');
    const result4 = await simulator.simulateTransactionWithTraceCall(testTx);

    if (result4.success) {
        console.log(`Gas 使用: ${result4.gasUsed || '不可用（仅模拟调用）'}`);
        simulator.formatTransfers(result4.transfers);
    } else {
        console.error(`模拟失败: ${result4.error}`);
    }

    console.log('模拟交易完成');

    // 注意：
    // - 方法1：只分析收据和日志，可追踪顶层 ETH 转账 + ERC20/ERC721 转账
    // - 方法2：使用 trace_transaction (Parity/Erigon) 追踪所有 ETH 转账（包括内部转账） + 日志中的 ERC20/ERC721 转账
    // - 方法3：使用 debug_traceTransaction (Geth) 追踪所有 ETH 转账（包括内部转账） + 日志中的 ERC20/ERC721 转账
    // - 方法4：使用 debug_traceCall (Geth) 模拟调用，不实际执行交易，追踪所有 ETH 转账 + 通过解析 call input 识别 ERC20 转账
    // - Anvil 默认支持这四种方法
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { TransactionSimulator, type SimulationResult, type Transfer, type ETHTransfer, type ERC20Transfer, type ERC721Transfer };
