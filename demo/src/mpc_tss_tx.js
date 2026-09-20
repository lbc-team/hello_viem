import crypto from 'node:crypto'
import dotenv from 'dotenv'
import {
  createPublicClient,
  http,
  parseEther,
  parseGwei,
  serializeTransaction,
  keccak256,
  recoverAddress,
  recoverTransactionAddress,
  toHex
} from 'viem'
import { foundry } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

dotenv.config()

/**
 * =========================================================================
 *                   MPC-TSS (门限签名方案 Threshold Signature Scheme) 模拟演示
 * =========================================================================
 *
 * 【SSS 与 TSS 的核心区别】：
 * - SSS (Shamir's Secret Sharing):
 *     多方仅在静态存储时分片私钥。但在签名时，必须把分片集中到单一机器的内存中，
 *     「重构出完整私钥」(Reconstruct Private Key) 后再做单点签名。存在单点泄露风险！
 *
 * - TSS (Threshold Signature Scheme):
 *     「私钥自始至终在任何时间、任何地点都从未被重构过！」
 *     1. 密钥生成阶段：每个节点仅持有分片 s_i，共同维护主公钥 PK。
 *     2. 签名阶段：当需要对交易哈希签名时，门限 t 个参与方各自在本地生成「部分签名 (Partial Signature Share)」。
 *     3. 聚合阶段：聚合器 (Aggregator) 只需将各方的部分签名线性累加，即可直接合成为合法的标准以太坊 ECDSA 签名 (r, s, v)。
 *     4. 链上完全兼容：以太坊节点/智能合约无需做任何修改，验证逻辑与普通单签完全一致。
 */

// secp256k1 椭圆曲线群的阶 N
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n
const HALF_SECP256K1_N = SECP256K1_N / 2n

/**
 * 扩展欧几里得算法求模逆: a * aInv ≡ 1 (mod m)
 */
function modInverse(a, m = SECP256K1_N) {
  let [m0, y, x] = [m, 0n, 1n]
  let currentA = ((a % m) + m) % m
  if (m === 1n) return 0n
  while (currentA > 1n) {
    const q = currentA / m
    let t = m
    m = currentA % m
    currentA = t
    t = y
    y = x - q * y
    x = t
  }
  if (x < 0n) x += m0
  return x
}

/**
 * 计算拉格朗日插值基系数 λ_i(0):
 * λ_i = ∏ (0 - j) / (i - j) = ∏ (-j) / (i - j)  (mod N)
 */
function computeLagrangeCoefficient(partyId, participantIds) {
  let num = 1n
  let den = 1n
  const bi = BigInt(partyId)

  for (const pid of participantIds) {
    if (pid === partyId) continue
    const bj = BigInt(pid)
    num = (num * (-bj)) % SECP256K1_N
    den = (den * (bi - bj)) % SECP256K1_N
  }

  num = ((num % SECP256K1_N) + SECP256K1_N) % SECP256K1_N
  den = ((den % SECP256K1_N) + SECP256K1_N) % SECP256K1_N
  return (num * modInverse(den, SECP256K1_N)) % SECP256K1_N
}

/**
 * 利用 Node.js 原生 crypto.createECDH 计算标量乘法: k * G
 */
function scalarMultiplyBasePoint(scalarBigInt) {
  const scalarHex = ((scalarBigInt % SECP256K1_N) + SECP256K1_N) % SECP256K1_N
  const buf = Buffer.from(scalarHex.toString(16).padStart(64, '0'), 'hex')
  const ecdh = crypto.createECDH('secp256k1')
  ecdh.setPrivateKey(buf)
  const pub = ecdh.getPublicKey() // 65 字节，首字节 0x04
  const x = BigInt('0x' + pub.subarray(1, 33).toString('hex'))
  const y = BigInt('0x' + pub.subarray(33, 65).toString('hex'))
  return { x, y, raw: pub }
}

/**
 * 模拟独立的 TSS 节点 (Party)
 * 职责：严格只保留本地的私钥分片，绝不泄露分片，只输出部分签名。
 */
class TSSNode {
  constructor(id, share) {
    this.id = id
    // 私钥分片，仅存在于本节点的受控隔离环境或硬件中
    this._privateShare = share
  }

  /**
   * 协同计算部分签名 (Partial Signature Share):
   *   s_i = k^(-1) * ( m / t + r * λ_i * share_i ) (mod N)
   *
   * @param {bigint} msgHash 消息哈希值 (BigInt)
   * @param {bigint} r 临时公钥坐标 r
   * @param {bigint} kInv 随机数模逆 (在实际协同协议中由零知识/同态加密分布式获得)
   * @param {bigint} tInv 门限数量的模逆 (1/t mod N)
   * @param {number[]} participantIds 参与本次签名的所有节点 ID 列表
   */
  computePartialSignature(msgHash, r, kInv, tInv, participantIds) {
    // 1. 计算当前节点在当前签名群组中的拉格朗日系数 λ_i
    const lambda = computeLagrangeCoefficient(this.id, participantIds)

    // 2. 本节点有效私钥份额 w_i = λ_i * share_i (mod N)
    const effectiveShare = (lambda * this._privateShare) % SECP256K1_N

    // 3. 计算部分签名: s_i = kInv * ( m * tInv + r * w_i ) (mod N)
    const termMsg = (msgHash * tInv) % SECP256K1_N
    const termKey = (r * effectiveShare) % SECP256K1_N
    const partialS = (kInv * (termMsg + termKey)) % SECP256K1_N

    console.log(`  [节点 Party-${this.id}] 正在计算部分签名... 局部分片未离开节点，生成 partial_s_${this.id}`)
    return partialS
  }
}

/**
 * 模拟 TSS 协调与签名聚合器 (Aggregator)
 */
class TSSAggregator {
  /**
   * 协调选定的节点进行门限签名，并聚合出标准的以太坊 ECDSA 签名 (r, s, v)
   */
  static aggregateSignature(nodes, participantIds, msgHashHex) {
    const t = participantIds.length
    const msgHash = BigInt(msgHashHex) % SECP256K1_N

    console.log(`\n--- [TSS 协同计算] 发起门限签名，门限参与方: [${participantIds.join(', ')}] ---`)

    // 1. 协同生成临时承诺点 R = k * G (在分布式协议中由各方承诺协同生成)
    // 这里模拟各方协同确定的分布式非对称随机数 k
    const randomBytes = crypto.randomBytes(32)
    const k = (BigInt('0x' + randomBytes.toString('hex')) % (SECP256K1_N - 1n)) + 1n
    const R = scalarMultiplyBasePoint(k)
    const r = R.x % SECP256K1_N
    const kInv = modInverse(k, SECP256K1_N)
    const tInv = modInverse(BigInt(t), SECP256K1_N)

    console.log(`1. 协同确定椭圆曲线临时随机点 R (rx): 0x${r.toString(16)}`)

    // 2. 各节点并行计算部分签名 (Partial Signatures)
    // 关键点：聚合器只接收各个节点计算出的数字 partial_s，不接触任何私钥分片！
    const partialSignatures = []
    for (const id of participantIds) {
      const node = nodes.find(n => n.id === id)
      const partialS = node.computePartialSignature(msgHash, r, kInv, tInv, participantIds)
      partialSignatures.push(partialS)
    }

    // 3. 聚合部分签名: s = ∑ s_i (mod N)
    console.log('\n2. 聚合器 (Aggregator) 聚合各节点的部分签名: s = ∑ s_i (mod N)')
    let s = 0n
    for (const partialS of partialSignatures) {
      s = (s + partialS) % SECP256K1_N
    }

    // 4. EIP-2 规避签名延展性规范化 (s 必须 <= N/2)
    let recoveryBit = (R.y % 2n === 1n) ? 1 : 0
    if (s > HALF_SECP256K1_N) {
      s = SECP256K1_N - s
      recoveryBit ^= 1
    }

    const rHex = '0x' + r.toString(16).padStart(64, '0')
    const sHex = '0x' + s.toString(16).padStart(64, '0')
    const v = 27n + BigInt(recoveryBit)

    console.log('3. 聚合得到最终以太坊标准 ECDSA 签名:')
    console.log('   r:', rHex)
    console.log('   s:', sHex)
    console.log('   yParity (v):', recoveryBit, `(v=${v})`)

    return {
      r: rHex,
      s: sHex,
      v,
      yParity: recoveryBit
    }
  }
}

/**
 * 模拟分布式密钥生成 (DKG) 与多项式分片分发
 * 设多项式 f(u) = a0 + a1*u + ... + a_{t-1}*u^{t-1} (mod N)
 * 其中 a0 为主私钥 (对应主公钥 PK)，每个节点获得 share_i = f(i)
 */
function setupTSS(masterPrivateKeyHex, totalShares = 5, threshold = 3) {
  const masterKey = BigInt(masterPrivateKeyHex) % SECP256K1_N

  // 随机生成门限多项式的高阶系数 a_1, a_2 ... a_{t-1}
  const coefficients = [masterKey]
  for (let i = 1; i < threshold; i++) {
    const coeff = (BigInt('0x' + crypto.randomBytes(32).toString('hex')) % (SECP256K1_N - 1n)) + 1n
    coefficients.push(coeff)
  }

  // 为每个节点计算分片: share_i = f(i) = ∑ a_k * i^k (mod N)
  const nodes = []
  for (let i = 1; i <= totalShares; i++) {
    let share = 0n
    let power = 1n
    const bi = BigInt(i)
    for (let deg = 0; deg < threshold; deg++) {
      share = (share + coefficients[deg] * power) % SECP256K1_N
      power = (power * bi) % SECP256K1_N
    }
    nodes.push(new TSSNode(i, share))
  }

  return nodes
}

/**
 * 主流程
 */
async function main() {
  console.log('=================================================================')
  console.log('            MPC-TSS 门限签名与交易发送模拟演示')
  console.log('=================================================================\n')

  // 1. 初始化密钥与网络客户端
  const masterPrivateKey = process.env.PRIVATE_KEY || '0x4b907b436bad6713b719201e5112792bc3fd998590581c19222e92b6d1409427'
  const masterAccount = privateKeyToAccount(masterPrivateKey)
  const publicAddress = masterAccount.address

  console.log('【1. 钱包主账户信息】')
  console.log('主账户地址 (公钥推导):', publicAddress)

  // 2. DKG 密钥分片分发 (5 节点，3 门限: 3-of-5)
  const totalParties = 5
  const threshold = 3
  console.log(`\n【2. 模拟 DKG 门限分片分发 (${threshold}-of-${totalParties})】`)
  const nodes = setupTSS(masterPrivateKey, totalParties, threshold)
  console.log(`已初始化 ${totalParties} 个独立 TSS 节点，任意 ${threshold} 个节点即可协同签名，无需重构私钥。`)

  // 3. 构建以太坊交易参数
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(process.env.RPC_URL || 'http://127.0.0.1:8545')
  })

  let nonce = 0
  let gasPrice = 2000000000n
  let isRpcOnline = false

  try {
    nonce = await publicClient.getTransactionCount({ address: publicAddress })
    gasPrice = await publicClient.getGasPrice()
    isRpcOnline = true
    console.log('\n【3. 链上连接状态】')
    console.log(`RPC 连接成功: 当前 Nonce = ${nonce}, GasPrice = ${parseGwei(gasPrice.toString())}`)
  } catch {
    console.log('\n【3. 链上连接状态】')
    console.log('未检测到本地活跃 RPC 节点，将使用模拟参数展示 TSS 签名与验签过程。')
  }

  const txParams = {
    to: '0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df',
    value: parseEther('0.001'),
    chainId: foundry.id,
    type: 'eip1559',
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: parseGwei('1.5'),
    gas: 21000n,
    nonce: nonce
  }

  // 4. 对未签名交易序列化并计算 Keccak-256 待签名哈希
  const unsignedSerializedTx = serializeTransaction(txParams)
  const txHashToSign = keccak256(unsignedSerializedTx)

  console.log('\n【4. 待签名交易哈希】')
  console.log('交易待签名 Keccak256 Hash:', txHashToSign)

  // 5. 模拟选择任意 3 个在线节点协同参与 TSS 签名 (例如节点 1, 3, 5)
  const activePartyIds = [1, 3, 5]
  console.log(`\n【5. 门限签名执行 (选定节点: ${activePartyIds.join(', ')})】`)
  console.log('>>> 注意：签名期间没有任何节点发送或重构过私钥分片！<<<')

  const signature = TSSAggregator.aggregateSignature(nodes, activePartyIds, txHashToSign)

  // 6. 密码学与标准以太坊验签验证
  console.log('\n【6. 签名验证与地址校验】')
  const recoveredSigner = await recoverAddress({
    hash: txHashToSign,
    signature: {
      r: signature.r,
      s: signature.s,
      v: signature.v
    }
  })
  console.log('从聚合签名恢复的发起人地址:', recoveredSigner)
  console.log('与钱包主地址匹配:', recoveredSigner.toLowerCase() === publicAddress.toLowerCase() ? '✅ 验证成功 (100% 匹配)' : '❌ 失败')

  // 7. 序列化成带签名的 Raw Transaction
  const signedSerializedTx = serializeTransaction(txParams, signature)
  console.log('\n【7. 组装以太坊 Raw Transaction】')
  console.log('序列化签名交易数据 (Raw Tx):', signedSerializedTx.slice(0, 70) + '...')

  const recoveredFromRawTx = await recoverTransactionAddress({
    serializedTransaction: signedSerializedTx
  })
  console.log('从 Raw Tx 解析出发起人地址:', recoveredFromRawTx)
  console.log('Raw Tx 发起人地址校验:', recoveredFromRawTx.toLowerCase() === publicAddress.toLowerCase() ? '✅ 校验完全一致' : '❌ 失败')

  // 8. 若网络可用则尝试广播上链
  if (isRpcOnline) {
    console.log('\n【8. 广播交易至网络】')
    try {
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedSerializedTx
      })
      console.log('交易广播成功! Hash:', txHash)
    } catch (e) {
      console.log('交易广播提示:', e.message)
    }
  } else {
    console.log('\n【8. 网络广播跳过】: 本地未连接节点，Raw Transaction 已就绪可随时广播。')
  }

  // 9. 对比测试：换另外一组节点 (例如节点 2, 4, 5) 进行同样的签名
  console.log('\n【9. 容灾/门限验证: 换另一组节点 [2, 4, 5] 再次签名】')
  const alternativePartyIds = [2, 4, 5]
  const signature2 = TSSAggregator.aggregateSignature(nodes, alternativePartyIds, txHashToSign)
  const recovered2 = await recoverAddress({
    hash: txHashToSign,
    signature: { r: signature2.r, s: signature2.s, v: signature2.v }
  })
  console.log('节点组 [2, 4, 5] 聚合签名恢复地址:', recovered2)
  console.log('与主地址一致:', recovered2.toLowerCase() === publicAddress.toLowerCase() ? '✅ 再次验证成功' : '❌ 失败')
}

main().catch(console.error)
