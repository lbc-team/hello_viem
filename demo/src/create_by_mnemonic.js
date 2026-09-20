import { mnemonicToSeedSync, generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { HDKey, mnemonicToAccount, privateKeyToAccount, publicKeyToAddress } from 'viem/accounts'
import secp256k1 from 'secp256k1'
import createKeccakHash from 'keccak'
import { toHex } from 'viem'

/**
 * 演示：从助记词 (Mnemonic) 推导以太坊地址的完整底层流程
 *
 * 涉及密码学与区块链标准：
 * 1. BIP-39: 助记词编码与 PBKDF2 派生 512 位 Master Seed
 * 2. BIP-32: 分层确定性钱包 (Hierarchical Deterministic Wallets) 主密钥与链码生成
 * 3. BIP-44: 多币种派生路径规范 (Ethereum 为 m/44'/60'/0'/0/x)
 * 4. secp256k1 椭圆曲线 + Keccak-256 哈希推导最终以太坊地址
 * 5. EIP-55: 大小写校验和地址转换
 */

console.log('===========================================================')
console.log('  助记词生成以太坊地址原理演示 (Mnemonic -> Seed -> Address)')
console.log('===========================================================\n')

// 1. 准备助记词与可选的密码盐 (Passphrase)
// 参考助记词 (经典 Ganache/以太坊测试助记词)
const defaultMnemonic = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
const mnemonic = defaultMnemonic
const passphrase = '' // 额外的密码保护盐值，默认为空字符串

console.log('【步骤 1: 准备助记词与密码盐】')
console.log('助记词 (Mnemonic):', mnemonic)
console.log('密码盐 (Passphrase):', passphrase ? `"${passphrase}"` : '(空)')
console.log('助记词单词数:', mnemonic.split(' ').length)

// 2. BIP-39: 助记词 -> 种子 (Master Seed)
// 使用 PBKDF2(HMAC-SHA512, 密码=助记词, 盐="mnemonic"+passphrase, 迭代=2048) 生成 64 字节 (512 位) 种子
const seed = mnemonicToSeedSync(mnemonic, passphrase)
console.log('\n【步骤 2: BIP-39 生成 Master Seed (PBKDF2 512-bit)】')
console.log('Master Seed 长度:', seed.length, 'bytes (512 位)')
console.log('Master Seed (Hex):', toHex(seed))

// 3. BIP-32: 从 Master Seed 构建 HD 根密钥节点 (Master HD Key)
const hdMaster = HDKey.fromMasterSeed(seed)
console.log('\n【步骤 3: BIP-32 构建 Master HD 根节点】')
console.log('根私钥 (Master Private Key):', toHex(hdMaster.privateKey))
console.log('根链码 (Chain Code):', toHex(hdMaster.chainCode))

// 4. BIP-44: 按标准以太坊路径进行分层派生
// 路径含义: m / 44' (BIP-44) / 60' (Ethereum) / 0' (账户 0) / 0 (外部收款链) / 0 (第 0 个地址)
const derivationPath = "m/44'/60'/0'/0/0"
const childNode = hdMaster.derive(derivationPath)
const childPrivateKey = childNode.privateKey

console.log('\n【步骤 4: BIP-44 路径派生子私钥】')
console.log('派生路径 (Derivation Path):', derivationPath)
console.log('派生得到的私钥 (32 字节):', toHex(childPrivateKey))

// 5. 由子私钥推导未压缩公钥 (65 字节，首字节 0x04)
const pubKeyWithPrefix = secp256k1.publicKeyCreate(childPrivateKey, false)
const pubKey = Buffer.from(pubKeyWithPrefix.slice(1)) // 去掉 0x04，得到 64 字节坐标

console.log('\n【步骤 5: 推导 64 字节未压缩公钥 (X, Y)】')
console.log('未压缩公钥 (去除 0x04 前缀):', '0x' + pubKey.toString('hex'))

// 6. Keccak-256 哈希计算并截取后 20 字节
const hash = createKeccakHash('keccak256').update(pubKey).digest()
const rawAddress = '0x' + hash.slice(-20).toString('hex')

console.log('\n【步骤 6: Keccak-256 哈希截取后 20 字节得到以太坊地址】')
console.log('Keccak-256 哈希摘要:', '0x' + hash.toString('hex'))
console.log('推导出的以太坊地址 (小写):', rawAddress)

// 7. 使用 Viem 对比验证 (集成 EIP-55 校验和)
const viemAccountByMnemonic = mnemonicToAccount(mnemonic, { path: derivationPath })
console.log('\n【步骤 7: Viem 官方 mnemonicToAccount 校验】')
console.log('Viem 校验和地址 (EIP-55 Checksum):', viemAccountByMnemonic.address)
console.log('地址对比结果 (忽略大小写):', rawAddress.toLowerCase() === viemAccountByMnemonic.address.toLowerCase() ? '✅ 完全一致' : '❌ 不一致')

// 8. 演示派生前 3 个以太坊地址 (m/44'/60'/0'/0/0 ~ 2)
console.log('\n【拓展: 派生该钱包前 3 个子账户地址】')
for (let i = 0; i < 3; i++) {
  const path = `m/44'/60'/0'/0/${i}`
  const child = hdMaster.derive(path)
  const childAcc = privateKeyToAccount(toHex(child.privateKey))
  console.log(`索引 [${i}] 路径: ${path}`)
  console.log(`       私钥: ${toHex(child.privateKey)}`)
  console.log(`       地址: ${childAcc.address}`)
}
