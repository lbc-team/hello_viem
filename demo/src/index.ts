import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getContract,
  http,
  parseEther,
  publicActions,
} from "viem";
import { baseSepolia, foundry } from "viem/chains";
import dotenv from "dotenv";
import WETH_ABI from './abis/weth.json' with { type: 'json' };
import { privateKeyToAccount } from "viem/accounts";
dotenv.config();

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

const main = async () => {
  // Create a wallet client
  const account = privateKeyToAccount(
    process.env.PRIVATE_KEY! as `0x${string}`
  );

  const client = createWalletClient({
    account,
    chain: foundry,
    transport: http(process.env.RPC_URL!),
  }).extend(publicActions);

  const address = await client.getAddresses();
  console.log(`The wallet address is ${address}`);

  // Send some Ether to another address
  /* const hash = await client.sendTransaction({
    account,
    to: "0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df",
    value: parseEther("0.001"),
  });

  console.log(`The transaction hash is ${hash}`); */

  // Get the balance of an address
  /* const balance = formatEther(await client.getBalance({
    address: "0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df",
  }));

  console.log(`The balance of 0x01BF49D75f2b73A2FDEFa7664AEF22C86c5Be3df is ${balance}`); */

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const contract = getContract({
    address: WETH_ADDRESS,
    abi: WETH_ABI,
    client: {
      public: publicClient,
      wallet: client,
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

  // Read the balance of the wallet address
  const balance1 = formatEther(BigInt(await contract.read.balanceOf([
    address.toString(),
  ]) as string));
  console.log(`The balance of ${address.toString()} is ${balance1}`);

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
  console.log(`The balance of ${address.toString()} is ${balance}`);
};

main();
