import crypto from 'node:crypto'
import secp256k1 from 'secp256k1'
import createKeccakHash from 'keccak'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * 演示：从随机私钥推导以太坊地址的完整底层密码学过程
 *
 * 核心步骤：
 * 1. 随机生成 32 字节私钥 (256-bit 随机数)
 * 2. 使用 secp256k1 椭圆曲线由私钥推导未压缩公钥 (65 字节，首字节 0x04 为未压缩标记，后面 64 字节为 x 和 y 坐标)
 * 3. 去掉首字节 0x04，得到 64 字节公钥内容
 * 4. 对 64 字节公钥进行 Keccak-256 哈希计算 (得到 32 字节摘要)
 * 5. 取 Keccak-256 哈希结果的最后 20 字节 (40 个十六进制字符)，加上 0x 前缀即为以太坊地址
 * 6. (可选) 通过 EIP-55 算法转换为带大小写校验和的以太坊地址
 */

console.log('======================================================')
console.log('  以太坊地址生成底层原理推导演示 (Private Key -> Address)')
console.log('======================================================\n')

// 1. 生成一个 32 字节的随机数作为私钥 (范围: [1, secp256k1_n - 1])
let privateKey = crypto.randomBytes(32)
while (!secp256k1.privateKeyVerify(privateKey)) {
  privateKey = crypto.randomBytes(32)
}

const privateKeyHex = '0x' + privateKey.toString('hex')
console.log('【步骤 1: 生成私钥】')
console.log('私钥 (32 字节 / 256 位):', privateKeyHex)
console.log('私钥 Buffer 长度:', privateKey.length, 'bytes\n')

// 2. 由 secp256k1 椭圆曲线算法计算出未压缩公钥 (Uncompressed Public Key)
// 第 2 个参数 false 表示生成未压缩公钥 (长度 65 字节，首字节 0x04，紧跟 32 字节 X 坐标 + 32 字节 Y 坐标)
const pubKeyWithPrefix = secp256k1.publicKeyCreate(privateKey, false)
console.log('【步骤 2: secp256k1 计算未压缩公钥】')
console.log('完整公钥长度:', pubKeyWithPrefix.length, 'bytes')
console.log('公钥格式前缀:', '0x' + pubKeyWithPrefix[0].toString(16).padStart(2, '0'), '(0x04 表示未压缩坐标 (x, y))')

// 3. 去掉首字节 0x04，仅保留 64 字节的 (x, y) 坐标内容
const pubKey = Buffer.from(pubKeyWithPrefix.slice(1))
console.log('\n【步骤 3: 提取 64 字节公钥坐标 (去掉 0x04 前缀)】')
console.log('公钥 (64 字节):', '0x' + pubKey.toString('hex'))
console.log('X 坐标 (前 32 字节):', '0x' + pubKey.subarray(0, 32).toString('hex'))
console.log('Y 坐标 (后 32 字节):', '0x' + pubKey.subarray(32, 64).toString('hex'))

// 4. 对 64 字节的公钥进行 Keccak-256 哈希运算
const keccakHash = createKeccakHash('keccak256').update(pubKey).digest()
console.log('\n【步骤 4: Keccak-256 哈希计算】')
console.log('Keccak-256(pubKey):', '0x' + keccakHash.toString('hex'))
console.log('哈希摘要长度:', keccakHash.length, 'bytes (32 字节)\n')

// 5. 取 Keccak-256 哈希结果的最后 20 字节 (即后 40 位十六进制字符)
const rawAddress = '0x' + keccakHash.slice(-20).toString('hex')
console.log('【步骤 5: 截取最后 20 字节作为以太坊地址】')
console.log('原始小写地址:', rawAddress)

// 6. 使用 viem 进行验证与 EIP-55 校验和对比
const account = privateKeyToAccount(privateKeyHex)
console.log('\n【步骤 6: Viem 官方库对照验证】')
console.log('Viem 生成地址 (含 EIP-55 Checksum):', account.address)
console.log('地址对比结果 (忽略大小写):', rawAddress.toLowerCase() === account.address.toLowerCase() ? '✅ 完全一致' : '❌ 不一致')

// 7. 补充演示：使用 Node.js 原生 crypto.createECDH 也能得到相同结果
const ecdh = crypto.createECDH('secp256k1')
ecdh.setPrivateKey(privateKey)
const nodePubKey = ecdh.getPublicKey().subarray(1) // 去掉 0x04
const nodeAddress = '0x' + createKeccakHash('keccak256').update(nodePubKey).digest().slice(-20).toString('hex')
console.log('\n【补充: Node.js 原生 crypto.createECDH 计算】')
console.log('Node 原生 ECDH 计算地址:', nodeAddress)
console.log('与步骤 5 地址一致:', nodeAddress === rawAddress ? '✅ 完全一致' : '❌ 不一致')
