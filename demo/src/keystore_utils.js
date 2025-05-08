import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

class KeystoreUtils {
    /**
     * 加密私钥并生成 KeyStore 文件
     * @param {string} privateKey - 私钥（带0x前缀）
     * @param {string} password - 密码
     * @returns {Object} KeyStore 对象
     */
    static async encryptPrivateKey(privateKey, password) {
        try {
            // 1. 生成随机 salt
            const salt = crypto.randomBytes(32)
            
            // 2. 使用 scrypt 派生密钥
            const derivedKey = crypto.scryptSync(password, salt, 32, {
                N: 8192,
                r: 8,
                p: 1
            })
            
            // 3. 生成 IV
            const iv = crypto.randomBytes(16)
            
            // 4. 加密私钥
            // 使用派生密钥的前16字节作为AES-128的密钥
            const cipher = crypto.createCipheriv('aes-128-ctr', derivedKey.slice(0, 16), iv)
            const privateKeyBuffer = Buffer.from(privateKey.slice(2), 'hex')
            const ciphertext = Buffer.concat([
                cipher.update(privateKeyBuffer),
                cipher.final()
            ])
            
            // 5. 计算 MAC
            const mac = crypto.createHash('sha3-256')
                .update(Buffer.concat([derivedKey.slice(16, 32), ciphertext]))
                .digest()
            
            // 6. 返回 KeyStore 对象
            return {
                crypto: {
                    cipher: 'aes-128-ctr',
                    cipherparams: { iv: iv.toString('hex') },
                    ciphertext: ciphertext.toString('hex'),
                    kdf: 'scrypt',
                    kdfparams: {
                        dklen: 32,
                        n: 8192,
                        p: 1,
                        r: 8,
                        salt: salt.toString('hex')
                    },
                    mac: mac.toString('hex')
                },
                id: crypto.randomUUID(),
                version: 3
            }
        } catch (error) {
            console.error('加密私钥失败:', error)
            throw error
        }
    }

    /**
     * 从 KeyStore 文件解密私钥
     * @param {Object} keystore - KeyStore 对象
     * @param {string} password - 密码
     * @returns {string} 解密后的私钥（带0x前缀）
     */
    static async decryptPrivateKey(keystore, password) {
        try {
            const { crypto: cryptoData } = keystore
            
            // 1. 从 KeyStore 获取参数
            const { kdfparams, cipherparams, ciphertext, mac } = cryptoData
            const { salt } = kdfparams
            const { iv } = cipherparams
            
            // 2. 使用 scrypt 派生密钥
            const derivedKey = crypto.scryptSync(
                password,
                Buffer.from(salt, 'hex'),
                kdfparams.dklen,
                {
                    N: kdfparams.n,
                    r: kdfparams.r,
                    p: kdfparams.p
                }
            )
            
            // 3. 验证 MAC
            const calculatedMac = crypto.createHash('sha3-256')
                .update(Buffer.concat([derivedKey.slice(16, 32), Buffer.from(ciphertext, 'hex')]))
                .digest()
            
            if (calculatedMac.toString('hex') !== mac) {
                throw new Error('密码错误或 KeyStore 文件已损坏')
            }
            
            // 4. 解密私钥
            const decipher = crypto.createDecipheriv(
                'aes-128-ctr',
                derivedKey.slice(0, 16),  // 使用派生密钥的前16字节
                Buffer.from(iv, 'hex')
            )
            
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(ciphertext, 'hex')),
                decipher.final()
            ])
            
            return '0x' + decrypted.toString('hex')
        } catch (error) {
            console.error('解密私钥失败:', error)
            throw error
        }
    }

    /**
     * 保存 KeyStore 文件
     * @param {Object} keystore - KeyStore 对象
     * @param {string} filePath - 保存路径
     */
    static async saveKeystore(keystore, filePath) {
        try {
            // 确保目录存在
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            
            await fs.writeFile(
                filePath,
                JSON.stringify(keystore, null, 2),
                'utf8'
            )
            console.log('KeyStore 文件已保存到:', filePath)
        } catch (error) {
            console.error('保存 KeyStore 文件失败:', error)
            throw error
        }
    }

    /**
     * 加载 KeyStore 文件
     * @param {string} filePath - KeyStore 文件路径
     * @returns {Object} KeyStore 对象
     */
    static async loadKeystore(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8')
            return JSON.parse(data)
        } catch (error) {
            console.error('加载 KeyStore 文件失败:', error)
            throw error
        }
    }
}

export default KeystoreUtils 