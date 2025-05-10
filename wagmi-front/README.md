# Simple Viem Demo

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).


通过: `npx create-next-app@latest simple-front`

这是一个使用 Viem 和 Wagmi 构建的简单以太坊应用示例。该应用展示了如何与智能合约进行交互，包括读取和写入操作。

## Wagmi 介绍

Wagmi 是一个 React Hooks 库，用于以太坊开发。它提供了一系列简单易用的 hooks，帮助开发者轻松地与以太坊网络交互。Wagmi 基于 Viem 构建，提供了类型安全、模块化和可组合的 API。


## 功能特点

- 使用 Wagmi v2 进行钱包连接/断开
- 显示当前网络信息（网络名称和 Chain ID）
- 使用 `useBalance` 自动获取和更新钱包 ETH 余额
- 使用 `useReadContract` 读取智能合约数据
- 使用 `useWriteContract` 写入智能合约数据
- 实时显示交易状态和哈希
- 自动更新合约数据

## 技术栈

- [Next.js](https://nextjs.org/)
- [Viem](https://viem.sh/)
- [Wagmi](https://wagmi.sh/)
- [Tailwind CSS](https://tailwindcss.com/)




## 主要功能实现

### 1. 钱包连接

使用 Wagmi 的 `useConnect` 和 `useDisconnect` hooks 管理钱包连接：

```typescript
const { address, isConnected } = useAccount();
const { connect } = useConnect();
const { disconnect } = useDisconnect();
```

### 2. 余额查询

使用 `useBalance` hook 自动获取和更新钱包余额：

```typescript
const { data: balance } = useBalance({
  address,
});
```

### 3. 合约交互

使用 `useReadContract` 和 `useWriteContract` hooks 进行合约交互：

```typescript
// 读取合约数据
const { data: counterNumber, refetch: refetchCounter } = useReadContract({
  address: COUNTER_ADDRESS as `0x${string}`,
  abi: Counter_ABI,
  functionName: 'number',
});

// 写入合约数据
const { 
  writeContract,
  isPending,
  data: hash,
  isSuccess,
  isError,
  error
} = useWriteContract();
```

### 4. 交易状态管理

自动处理交易状态和更新：

```typescript
// 监听交易完成状态
useEffect(() => {
  if (isSuccess) {
    refetchCounter();
  }
}, [isSuccess, refetchCounter]);
```



## 使用方法

1. 克隆仓库
2. 安装依赖：
```bash
# 使用 pnpm 安装依赖
pnpm install
```
3. 启动开发服务器：
```bash
pnpm dev
```

4. 在浏览器中访问 `http://localhost:3000` 或 `http://localhost:3000/appkit-demo`
 


## 项目结构

```
simple-front/
├── app/
│   ├── layout.tsx      # 根布局组件
│   ├── page.tsx        # 主页面组件
│   ├── providers.tsx   # Wagmi Provider 配置
│   └── globals.css     # 全局样式
├── public/             # 静态资源
└── package.json        # 项目配置
```

## 注意事项

1. 确保已安装 MetaMask 浏览器扩展
2. 确保 MetaMask 已连接到以太坊网络
3. 首次使用需要授权连接钱包
4. 确保本地 Foundry 节点正在运行（用于本地开发）

## 开发环境要求

- Node.js 22.0.0 或更高版本
- pnpm 包管理器
- MetaMask 钱包扩展
- Foundry 本地开发环境（可选）
 
## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
