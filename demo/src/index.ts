import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getContract,
  http,
  parseEther,
  parseGwei,
  publicActions,
  parseEventLogs,
} from "viem";
import { foundry } from "viem/chains";
import dotenv from "dotenv";


import Counter_ABI from './abis/Counter.json' with { type: 'json' };
import ERC20_ABI from './abis/MyERC20.json' with { type: 'json' };
import { privateKeyToAccount } from "viem/accounts";
dotenv.config();

const COUNTER_ADDRESS = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
const ERC20_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const main = async () => {
  // 创建一个公共客户端

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(process.env.RPC_URL!),
  }).extend(publicActions);

  const blockNumber = await publicClient.getBlockNumber();
  console.log(`The block number is ${blockNumber}`);


  // Get the balance of an address
  const tbalance = formatEther(await publicClient.getBalance({
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  }));

  console.log(`The balance of 0xf39 is ${tbalance}`);

  // 创建一个钱包客户端
  const account = privateKeyToAccount(
    process.env.PRIVATE_KEY! as `0x${string}`
  );

  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http(process.env.RPC_URL!),
  }).extend(publicActions);

  const address = await walletClient.getAddresses();
  console.log(`The wallet address is ${address}`);

  // Send some Ether to another address
  const hash1 = await walletClient.sendTransaction({
    account,
    to: "0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df",
    value: parseEther("0.001"),
  });

  console.log(` 默认 gas 和 nonce 的 transaction hash is ${hash1}`);

  // 更多选项
  const hash2 = await walletClient.sendTransaction({
    account,
    gas: 21000n,  // 21000 是 gas 的默认值
    maxFeePerGas: parseGwei('20'), // 1 Gwei
    maxPriorityFeePerGas: parseGwei("2"), // 1 Gwei
    to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    value: parseEther('1'),
    // nonce: 1,
  })

  console.log(` 自定义 gas 和 nonce 的 transaction hash is ${hash2}`);


  const erc20Contract = getContract({
    address: ERC20_ADDRESS,
    abi: ERC20_ABI,
    client: {
      public: publicClient,
      wallet: walletClient,
    },
  });

    // 读取合约 方法 1
    const balance1 = formatEther(BigInt(await erc20Contract.read.balanceOf([
      address.toString(),
    ]) as string));
    console.log(`方法 1 获取的余额是 ${address.toString()} is ${balance1}`);
  
    // 读取合约 方法 2
    const balance = formatEther(
      BigInt(
        (await publicClient.readContract({
          address: ERC20_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address.toString()],
        })) as string
      )
    );
    console.log(`方法 2 获取的余额是 ${address.toString()} is ${balance}`);


  const counterContract = getContract({
    address: COUNTER_ADDRESS,
    abi: Counter_ABI,
    client: {
      public: publicClient,
      wallet: walletClient,
    },
  });

  // 写方法1
  const hash = await counterContract.write.increment();
  console.log(` 调用 increment 方法的 transaction hash is ${hash}`);

  const number1 = await counterContract.read.number([]);
  console.log(` 调用 number 方法的 number is ${number1}`);

  // 写方法2
  await walletClient.writeContract({
    address: COUNTER_ADDRESS,
    abi: Counter_ABI,
    functionName: 'increment',
    args: [],
  });
  

  const number2 = await counterContract.read.number([]);
  console.log(` 调用 number 方法的 number is ${number2}`);

  const tx = await erc20Contract.write.transfer([
    "0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df",
    parseEther("1"),
  ]);
  console.log(` 调用 transfer 方法的 transaction hash is ${tx}`);

  // 等待交易被确认
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  console.log(`交易状态: ${receipt.status === 'success' ? '成功' : '失败'}`);
  // console.log(receipt.logs);
  // 从 receipt 中解析事件
  const transferLogs = await parseEventLogs({
    abi: ERC20_ABI,
    eventName: 'Transfer', 
    logs: receipt.logs,
  });

  // 打印转账事件详情
  for (const log of transferLogs) {
    const eventLog = log as unknown as { eventName: string; args: { from: string; to: string; value: bigint } };
    if (eventLog.eventName === 'Transfer') {
      console.log('转账事件详情:');
      console.log(`从: ${eventLog.args.from}`);
      console.log(`到: ${eventLog.args.to}`);
      console.log(`金额: ${formatEther(eventLog.args.value)}`);
    }
  }

};

main();
