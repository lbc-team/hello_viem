# AppKit 社交登录配置指南

## 概述

AppKit 目前主要通过 WalletConnect 和传统的钱包连接方式支持 Web3 登录。对于社交登录功能，您可以通过以下几种方式实现：

## 1. 使用 WalletConnect 的社交登录功能

WalletConnect 支持通过社交登录提供商进行 Web3 身份验证。您可以在 AppKit 配置中启用这些功能：

### 配置步骤

1. **获取 WalletConnect Project ID**
   - 访问 https://cloud.walletconnect.com/
   - 创建新项目并获取 Project ID

2. **配置环境变量**
   ```bash
   # 复制环境变量示例文件
   cp env.example .env.local
   
   # 编辑 .env.local 文件，添加您的配置
   ```

3. **支持的社交登录提供商**

   - **Google 登录**
     ```bash
     NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
     NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret
     ```

   - **Facebook 登录**
     ```bash
     NEXT_PUBLIC_FACEBOOK_APP_ID=your_facebook_app_id
     NEXT_PUBLIC_FACEBOOK_APP_SECRET=your_facebook_app_secret
     ```

   - **Twitter 登录**
     ```bash
     NEXT_PUBLIC_TWITTER_API_KEY=your_twitter_api_key
     NEXT_PUBLIC_TWITTER_API_SECRET=your_twitter_api_secret
     ```

   - **Discord 登录**
     ```bash
     NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
     NEXT_PUBLIC_DISCORD_CLIENT_SECRET=your_discord_client_secret
     ```

   - **GitHub 登录**
     ```bash
     NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
     NEXT_PUBLIC_GITHUB_CLIENT_SECRET=your_github_client_secret
     ```

## 2. 自定义社交登录实现

如果 AppKit 的内置社交登录功能不满足需求，您可以实现自定义的社交登录：

### 实现步骤

1. **创建社交登录组件**
   ```typescript
   // components/SocialLogin.tsx
   import { useAppKit } from '@reown/appkit/react';
   
   export function SocialLogin() {
     const { open } = useAppKit();
     
     const handleGoogleLogin = async () => {
       // 实现 Google 登录逻辑
       const googleUser = await signInWithGoogle();
       // 将社交登录结果转换为 Web3 身份
       const web3Identity = await convertToWeb3Identity(googleUser);
     };
     
     return (
       <div>
         <button onClick={handleGoogleLogin}>Google 登录</button>
         <button onClick={() => open()}>钱包登录</button>
       </div>
     );
   }
   ```

2. **集成第三方认证库**
   ```bash
   # 安装认证库
   npm install @auth0/auth0-react
   # 或
   npm install firebase
   ```

3. **配置认证提供商**
   ```typescript
   // 在您的应用中配置认证提供商
   import { Auth0Provider } from '@auth0/auth0-react';
   
   function App() {
     return (
       <Auth0Provider
         domain="your-domain.auth0.com"
         clientId="your-client-id"
         authorizationParams={{
           redirect_uri: window.location.origin
         }}
       >
         <AppKitProvider>
           <YourApp />
         </AppKitProvider>
       </Auth0Provider>
     );
   }
   ```

## 3. 使用 SIWE (Sign-In with Ethereum)

SIWE 是一种通过以太坊钱包进行身份验证的标准：

### 配置 SIWE

1. **安装依赖**
   ```bash
   npm install siwe
   ```

2. **实现 SIWE 登录**
   ```typescript
   import { createSiweMessage, verifySiweMessage } from 'viem/siwe';
   
   const handleSiweLogin = async () => {
     const message = createSiweMessage({
       address: userAddress,
       chainId: chainId,
       domain: window.location.hostname,
       nonce: generateNonce(),
       uri: window.location.origin,
       version: '1',
       statement: '请签名以登录到我们的应用',
     });
     
     const signature = await walletClient.signMessage({
       account: userAddress,
       message,
     });
     
     // 验证签名
     const isValid = await verifySiweMessage(publicClient, {
       message,
       signature,
     });
   };
   ```

## 4. 环境变量配置

确保在 `.env.local` 文件中配置所有必要的环境变量：

```bash
# AppKit 基础配置
NEXT_PUBLIC_APPKIT_PROJECT_ID=your_project_id

# 社交登录配置
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_FACEBOOK_APP_ID=your_facebook_app_id
NEXT_PUBLIC_TWITTER_API_KEY=your_twitter_api_key
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id

# 回调URL
NEXT_PUBLIC_AUTH_CALLBACK_URL=http://localhost:3000/auth/callback
```

## 5. 安全注意事项

1. **环境变量安全**
   - 不要将敏感信息提交到版本控制
   - 使用 `.env.local` 文件存储本地开发配置
   - 在生产环境中使用安全的密钥管理

2. **用户数据保护**
   - 遵循 GDPR 和其他隐私法规
   - 实现适当的用户数据删除机制
   - 加密存储敏感用户信息

3. **OAuth 配置**
   - 正确配置 OAuth 重定向 URI
   - 验证 OAuth 令牌的有效性
   - 实现适当的错误处理

## 6. 测试社交登录

1. **本地测试**
   ```bash
   npm run dev
   ```

2. **配置测试账户**
   - 为每个社交登录提供商创建测试账户
   - 验证登录流程的完整性

3. **错误处理测试**
   - 测试网络错误情况
   - 测试用户取消登录的情况
   - 测试无效令牌的处理

## 7. 部署注意事项

1. **生产环境配置**
   - 更新所有 OAuth 应用的重定向 URI
   - 配置生产环境的域名
   - 设置适当的安全头部

2. **监控和日志**
   - 实现登录尝试的监控
   - 记录认证错误和成功
   - 设置适当的告警机制

## 总结

AppKit 提供了灵活的社交登录配置选项。您可以根据项目需求选择合适的实现方式：

- **简单项目**: 使用 WalletConnect 的内置社交登录
- **复杂项目**: 实现自定义的社交登录逻辑
- **Web3 原生**: 使用 SIWE 进行以太坊身份验证

无论选择哪种方式，都要确保遵循安全最佳实践和用户隐私保护原则。 