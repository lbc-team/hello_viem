# Simple Viem Demo

通过: `npx create-next-app@latest simple-front`

这是一个使用 Viem 和 Wagmi 实现的简单 Web3 演示项目，展示了如何连接 MetaMask 钱包并显示钱包信息。

## 功能特点

- 连接 MetaMask 钱包
- 显示钱包地址
- 显示当前网络信息（网络名称和 Chain ID）
- 显示钱包 ETH 余额
- 支持断开钱包连接

## 技术栈

- Next.js
- Viem
- Wagmi
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

## 开发环境要求

- Node.js 18.0.0 或更高版本
- pnpm 包管理器
- MetaMask 钱包扩展

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

create by : `npx create-next-app@latest myapp`


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
