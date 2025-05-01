import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getContract,
  http,
  parseEther,
  parseGwei,
  publicActions,
} from "viem";
import { baseSepolia, foundry } from "viem/chains";
import dotenv from "dotenv";
import WETH_ABI from './abis/weth.json' with { type: 'json' };
import { privateKeyToAccount } from "viem/accounts";
dotenv.config();

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

const main = async () => {
  // 创建一个公共客户端
  const publicClient = createPublicClient({
    chain: baseSepolia, // mainnet, ....
    transport: http(),
  });

  const blockNumber = await publicClient.getBlockNumber();
  console.log(`The block number is ${blockNumber}`);


  // Get the balance of an address
  const tbalance = formatEther(await publicClient.getBalance({
    address: "0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df",
  }));

  console.log(`The balance of 0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df is ${tbalance}`);



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
  // https://viem.sh/docs/actions/wallet/sendTransaction#sendtransaction
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

  const contract = getContract({
    address: WETH_ADDRESS,
    abi: WETH_ABI,
    client: {
      public: publicClient,
      wallet: walletClient,
    },
  });

  // Execute the deposit transaction on the WETH smart contract
  /* const hash = await contract.write.deposit([], {
    value: parseEther("0.000001"),
  });

  console.log(`The transaction hash is ${hash}`); */

  /* const hash = await client.writeContract({
    address: WETH_ADDRESS,
    abi: WETH_ABI,
    functionName: 'deposit',
    args: [],
    value: parseEther("0.000001")
  });
  console.log(`The transaction hash is ${hash}`); */

  // 读取合约 方法 1
  const balance1 = formatEther(BigInt(await contract.read.balanceOf([
    address.toString(),
  ]) as string));
  console.log(`方法 1 获取的余额是 ${address.toString()} is ${balance1}`);

  // 读取合约 方法 2
  const balance = formatEther(
    BigInt(
      (await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "balanceOf",
        args: [address.toString()],
      })) as string
    )
  );
  console.log(`方法 2 获取的余额是 ${address.toString()} is ${balance}`);
};

main();
