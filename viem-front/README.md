# Simple Viem Demo

通过: `npx create-next-app@latest simple-front` 创建项目

这是一个使用 Viem 实现的简单 Web3 演示项目，展示了如何连接 MetaMask 钱包并显示钱包信息。

## 功能特点

- 连接 MetaMask 钱包
- 显示钱包地址
- 显示当前网络信息（网络名称和 Chain ID）
- 显示钱包 ETH 余额
- 支持断开钱包连接
- 调用 Counter 合约的 increment 方法
- 显示 Counter 合约的当前数值

## 开发环境要求

- Node.js 22.0.0 或更高版本 (by nvm)
- pnpm 包管理器
- MetaMask 钱包扩展
- Foundry 本地开发环境（可选）

## 技术栈

- Next.js
- Viem
- Tailwind CSS
- TypeScript

## 安装依赖

```bash
# 使用 pnpm 安装依赖
pnpm install
```

## 启动项目

```bash
# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 启动生产版本
pnpm start
```

访问：http://localhost:3000 或 http://localhost:3000/siwe



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
5. 相关合约代码在 https://github.com/lbc-team/hello_foundry



