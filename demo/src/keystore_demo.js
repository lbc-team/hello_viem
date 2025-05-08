import KeystoreUtils from './keystore_utils.js'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

async function demo() {
    try {
        // 1. 从环境变量获取私钥
        const privateKey = process.env.PRIVATE_KEY
        if (!privateKey) {
            throw new Error('请在 .env 文件中设置 PRIVATE_KEY')
        }
        console.log('原始私钥:', privateKey)

        // 2. 设置密码和文件路径
        const password = '123456'
        const keystorePath = path.join(process.cwd(), '.keys', 'keystore.json')

        // 3. 加密私钥并生成 KeyStore
        console.log('\n开始加密私钥...')
        const keystore = await KeystoreUtils.encryptPrivateKey(privateKey, password)
        console.log('KeyStore 生成成功')

        // 4. 保存 KeyStore 文件
        await KeystoreUtils.saveKeystore(keystore, keystorePath)

        // 5. 加载 KeyStore 文件
        console.log('\n开始加载 KeyStore 文件...')
        const loadedKeystore = await KeystoreUtils.loadKeystore(keystorePath)
        console.log('KeyStore 文件加载成功')

        // 6. 解密私钥
        console.log('\n开始解密私钥...')
        const decryptedPrivateKey = await KeystoreUtils.decryptPrivateKey(loadedKeystore, password)
        console.log('解密后的私钥:', decryptedPrivateKey)
        console.log('私钥是否一致:', privateKey === decryptedPrivateKey)

    } catch (error) {
        console.error('演示过程出错:', error)
    }
}

// 执行演示
demo() 