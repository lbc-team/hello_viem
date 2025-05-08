# viem_tutorial

 

## 环境配置
0. 使用 node.js 22:
```
nvm use 22 
```

1. 安装依赖：
```bash
cd demo
pnpm install
```

2. 配置环境变量：
复制 env_sample 为 `.env` 并修改：

```
PRIVATE_KEY=你的私钥
RPC_URL=你的 RPC 节点地址
```

3. 运行：

运行脚本： `npm run index` 或 `pnpm index`


## 代码模块说明

## 代码模块说明

### 1. 基础示例 (index.ts)
演示 viem 的基础功能：
- 账户创建和管理
- 网络连接配置
- 基础交易操作

### 2. 原始交易构建 (build_raw_tx.js)
演示如何构建和发送原始交易：
- 手动构建 EIP-1559 类型交易
- 使用 `prepareTransactionRequest` 准备交易
- 支持交易签名和广播
- 包含交易确认等待

### 3. ERC20 代币操作 (weth.ts)
演示 ERC20 代币相关操作：
- 代币余额查询
- 代币转账
- 代币授权

### 4. 事件监听 (watchTransfer.ts)
演示如何监听区块链事件：
- 监听 ERC20 Transfer 事件
- 实时事件处理
- 使用 ABI 解析事件数据

 
## 注意事项
1. 确保账户有足够的 ETH 支付 gas 费用
2. 使用正确的网络配置（Sepolia/Foundry）
3. 妥善保管私钥，不要泄露
4. 建议在测试网络上进行测试